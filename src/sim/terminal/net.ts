/**
 * Network commands (Apps §5.4): ping (iputils, streaming), curl (every REST surface of Sim §3.23 via
 * CoreServices.http, plus the devops-owned Jenkins and Ollama APIs), nc -zv, nslookup, ip addr.
 */
import type { LabState } from '../types';
import type { RestResponse } from '../api';
import { core } from '../devops/coreRef';
import { queueBuild, jenkinsUp } from '../devops/jenkins/engine';
import { ask, CONNECT_REFUSED, OLLAMA_IP, OLLAMA_PORT, ollamaTagsJson, ollamaUp } from '../devops/ollama';
import { gameDate, pad2 } from '../devops/util';
import type { CmdResult, Line, Sh } from './session';
import { E, L, fail, ok, registerJob } from './session';

const HTTP_TEXT: Record<number, string> = { 200: 'OK', 201: 'Created', 202: 'Accepted', 204: 'No Content', 400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found', 405: 'Method Not Allowed', 409: 'Conflict', 500: 'Internal Server Error', 502: 'Bad Gateway', 503: 'Service Unavailable' };

/** The host the shell is running on (workstation or the ssh target). */
export function fromHost(sh: Sh, remoteHostId: string | null): string {
  void sh;
  return remoteHostId ?? 'ws-17';
}

export function hostIp(lab: LabState, hostId: string): string {
  return lab.hosts[hostId]?.ip ?? '10.42.50.17';
}

function httpDate(lab: LabState): string {
  const t = gameDate(lab, lab.time.nowMs + 4 * 3_600_000);
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][t.wd];
  const mo = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][t.mo - 1];
  return `${wd}, ${pad2(t.d)} ${mo} ${t.y} ${pad2(t.h)}:${pad2(t.mi)}:${pad2(t.s)} GMT`;
}

/* ────────────────────────────── ping ────────────────────────────── */

export function ping(sh: Sh, argv: string[], from: string): CmdResult {
  let count: number | null = null;
  let host: string | null = null;
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '-c' || a === '-n') count = Number(argv[++i]);
    else if (/^-c\d+$/.test(a)) count = Number(a.slice(2));
    else if (a.startsWith('-')) continue;
    else host = a;
  }
  if (!host) return fail(2, E('ping: usage error: Destination address required'));
  const r = core().resolve(sh.lab, host);
  if (!r.ip) return fail(2, E(`ping: ${host}: Name or service not known`));
  const ip = r.ip;
  const label = host === ip ? ip : host;
  const myIp = hostIp(sh.lab, from);
  const st = { sent: 0, recv: 0, errs: 0, rtts: [] as number[], start: sh.lab.time.physMs };
  const header = L(`PING ${label} (${ip}) 56(84) bytes of data.`);
  const stats = (): Line[] => {
    const loss = st.sent ? Math.round((100 * (st.sent - st.recv)) / st.sent) : 0;
    const time = Math.max(0, (st.sent - 1) * 1000 + (st.recv === 0 ? 31 : 3));
    const lines = [L(''), L(`--- ${label} ping statistics ---`), L(`${st.sent} packets transmitted, ${st.recv} received, ${st.errs ? `+${st.errs} errors, ` : ''}${loss}% packet loss, time ${time}ms`)];
    if (st.rtts.length) {
      const min = Math.min(...st.rtts);
      const max = Math.max(...st.rtts);
      const avg = st.rtts.reduce((a, b) => a + b, 0) / st.rtts.length;
      const mdev = Math.sqrt(st.rtts.reduce((a, b) => a + (b - avg) ** 2, 0) / st.rtts.length);
      lines.push(L(`rtt min/avg/max/mdev = ${min.toFixed(3)}/${avg.toFixed(3)}/${max.toFixed(3)}/${mdev.toFixed(3)} ms`));
    }
    return lines;
  };
  const one = (s: Sh): Line => {
    st.sent++;
    const reach = core().reach(s.lab, s.ctx, from, ip, null);
    if (reach.ok || reach.kind === 'refused') {
      st.recv++;
      const ms = Math.max(0.2, reach.latencyMs) + core().rand(s.lab, 'devices') * 0.9;
      st.rtts.push(ms);
      return L(`64 bytes from ${host === ip ? ip : `${host} (${ip})`}: icmp_seq=${st.sent} ttl=64 time=${ms.toFixed(ms < 10 ? 2 : 1)} ms`);
    }
    st.errs++;
    return L(`From ${myIp} icmp_seq=${st.sent} Destination Host Unreachable`);
  };
  let emittedHeader = false;
  const job = registerJob({
    step(s, phys) {
      const out: Line[] = [];
      if (!emittedHeader) {
        out.push(header);
        emittedHeader = true;
      }
      while ((count === null || st.sent < count) && phys >= st.start + st.sent * 1000) out.push(one(s));
      if (count !== null && st.sent >= count) {
        out.push(...stats());
        return { lines: out, done: true, exitCode: st.recv ? 0 : 1 };
      }
      return { lines: out, done: false, exitCode: null };
    },
    interrupt() {
      return stats();
    },
  });
  return { lines: [], code: 0, stream: job };
}

/* ────────────────────────────── curl ────────────────────────────── */

interface CurlOpts {
  method: string;
  url: string;
  body: string | null;
  headers: string[];
  include: boolean;
  silent: boolean;
  verbose: boolean;
  writeOut: string | null;
  output: string | null;
}

export function parseCurl(argv: string[]): CurlOpts | string {
  const o: CurlOpts = { method: 'GET', url: '', body: null, headers: [], include: false, silent: false, verbose: false, writeOut: null, output: null };
  let explicitMethod = false;
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '-X' || a === '--request') {
      o.method = (argv[++i] ?? 'GET').toUpperCase();
      explicitMethod = true;
    } else if (a === '-H' || a === '--header') o.headers.push(argv[++i] ?? '');
    else if (a === '-d' || a === '--data' || a === '--data-raw' || a === '--data-binary') {
      o.body = argv[++i] ?? '';
      if (!explicitMethod) o.method = 'POST';
    } else if (a === '-i' || a === '--include') o.include = true;
    else if (a === '-s' || a === '--silent' || a === '-sS') o.silent = true;
    else if (a === '-v' || a === '--verbose') o.verbose = true;
    else if (a === '-w' || a === '--write-out') o.writeOut = argv[++i] ?? '';
    else if (a === '-o' || a === '--output') o.output = argv[++i] ?? '';
    else if (a === '-L' || a === '-k' || a === '-f' || a === '--fail' || a === '-m' || a === '--max-time') {
      if (a === '-m' || a === '--max-time') i++;
    } else if (/^-[a-zA-Z]{2,}$/.test(a)) {
      for (const ch of a.slice(1)) {
        if (ch === 's') o.silent = true;
        else if (ch === 'i') o.include = true;
        else if (ch === 'v') o.verbose = true;
      }
    } else if (a.startsWith('-')) return `curl: option ${a}: is unknown\ncurl: try 'curl --help' or 'curl --manual' for more information`;
    else o.url = a;
  }
  if (!o.url) return "curl: no URL specified!\ncurl: try 'curl --help' or 'curl --manual' for more information";
  return o;
}

interface ParsedUrl {
  scheme: string;
  host: string;
  port: number;
  path: string;
  query: string;
}
function parseUrl(url: string): ParsedUrl | null {
  const m = /^(?:(https?):\/\/)?([^/:?#]+)(?::(\d+))?([^?#]*)(\?[^#]*)?/.exec(url);
  if (!m) return null;
  const scheme = m[1] ?? 'http';
  return { scheme, host: m[2]!, port: m[3] ? Number(m[3]) : scheme === 'https' ? 443 : 80, path: m[4] || '/', query: m[5] ?? '' };
}

/** Jenkins JSON API (devops-owned, Sim §3.23). */
function jenkinsRest(lab: LabState, sh: Sh, method: string, u: ParsedUrl): RestResponse {
  const json = (status: number, v: unknown): RestResponse => ({ status, body: typeof v === 'string' ? v : JSON.stringify(v), headers: { 'Content-Type': 'application/json;charset=utf-8' }, latencyMs: 40 });
  const path = decodeURIComponent(u.path).replace(/\/+$/, '');
  if (path === '' || path === '/api/json' || path === '/api') return json(200, { _class: 'hudson.model.Hudson', jobs: [{ name: 'Java', url: `${lab.jenkins.url}/job/Java/` }, { name: 'iOS', url: `${lab.jenkins.url}/job/iOS/` }] });
  const m = /^\/job\/([^/]+)\/job\/([^/]+)(\/.*)?$/.exec(path);
  if (!m) return json(404, '<html><body><h2>HTTP ERROR 404 Not Found</h2></body></html>');
  const jobId = `${m[1]}/${m[2]}`;
  const job = lab.jenkins.jobs[jobId];
  if (!job || !job.exists) return json(404, '<html><body><h2>HTTP ERROR 404 Not Found</h2></body></html>');
  const rest = m[3] ?? '';
  const builds = job.buildIds.map((id) => lab.jenkins.builds[id]!).filter(Boolean).sort((a, b) => b.number - a.number);
  const asJson = (b: (typeof builds)[number]): unknown => ({ _class: 'org.jenkinsci.plugins.workflow.job.WorkflowRun', number: b.number, result: b.result, building: b.state !== 'finished', duration: b.finishedMs !== null && b.startedMs !== null ? b.finishedMs - b.startedMs : 0, url: `${lab.jenkins.url}/job/${m[1]}/job/${m[2]}/${b.number}/` });
  if (method === 'POST' && (rest === '/build' || rest === '/buildWithParameters')) {
    const params: Record<string, string> = {};
    for (const kv of u.query.replace(/^\?/, '').split('&').filter(Boolean)) {
      const [k, v] = kv.split('=');
      params[decodeURIComponent(k!)] = decodeURIComponent(v ?? '');
    }
    const r = queueBuild(lab, sh.ctx, jobId, params, 'player');
    if (!r.ok) return json(409, r.error);
    return { status: 201, body: '', headers: { Location: `${lab.jenkins.url}/queue/item/${lab.seq.build}/` }, latencyMs: 60 };
  }
  const which = /^\/(lastBuild|lastSuccessfulBuild|lastFailedBuild|lastCompletedBuild|\d+)\/api\/json$/.exec(rest);
  if (which) {
    const sel = which[1]!;
    const b = /^\d+$/.test(sel) ? builds.find((x) => x.number === Number(sel)) : sel === 'lastBuild' ? builds[0] : sel === 'lastSuccessfulBuild' ? builds.find((x) => x.result === 'SUCCESS') : sel === 'lastFailedBuild' ? builds.find((x) => x.result === 'FAILURE') : builds.find((x) => x.state === 'finished');
    if (!b) return json(404, '<html><body><h2>HTTP ERROR 404 Not Found</h2></body></html>');
    const v = asJson(b) as Record<string, unknown>;
    return json(200, sel === 'lastBuild' && rest.endsWith('api/json') ? { number: v['number'], result: v['result'], building: v['building'], duration: v['duration'] } : v);
  }
  const consoleM = /^\/(lastBuild|\d+)\/consoleText$/.exec(rest);
  if (consoleM) {
    const b = consoleM[1] === 'lastBuild' ? builds[0] : builds.find((x) => x.number === Number(consoleM[1]));
    return b ? { status: 200, body: b.console.join('\n'), headers: { 'Content-Type': 'text/plain;charset=utf-8' }, latencyMs: 30 } : json(404, 'Not Found');
  }
  if (rest === '/api/json' || rest === '') return json(200, { _class: 'org.jenkinsci.plugins.workflow.job.WorkflowJob', name: job.name, fullName: job.id, buildable: !job.disabled, nextBuildNumber: lab.jenkins.nextBuildNumber[jobId], lastBuild: builds[0] ? { number: builds[0].number } : null });
  return json(404, '<html><body><h2>HTTP ERROR 404 Not Found</h2></body></html>');
}

function connectError(kind: 'no-route' | 'timeout' | 'refused', host: string, port: number): { code: number; line: string } {
  if (kind === 'refused') return { code: 7, line: `curl: (7) Failed to connect to ${host} port ${port}: Connection refused` };
  if (kind === 'timeout') return { code: 28, line: 'curl: (28) Connection timed out after 10001 milliseconds' };
  return { code: 7, line: `curl: (7) Failed to connect to ${host} port ${port}: No route to host` };
}

export function curl(sh: Sh, argv: string[], from: string): CmdResult {
  const o = parseCurl(argv);
  if (typeof o === 'string') return fail(2, ...o.split('\n').map(E));
  const u = parseUrl(o.url);
  if (!u) return fail(3, E(`curl: (3) URL using bad/illegal format or missing URL`));
  const lab = sh.lab;
  const host = u.host === 'localhost' || u.host === '127.0.0.1' ? (lab.hosts[from]?.ip ?? '127.0.0.1') : u.host;
  const r = core().resolve(lab, host);
  if (!r.ip) return fail(6, E(`curl: (6) Could not resolve host: ${u.host}`));
  const reach = core().reach(lab, sh.ctx, from, r.ip, u.port);
  const fullUrl = `${u.scheme}://${u.host}${u.port === 80 && u.scheme === 'http' ? '' : `:${u.port}`}${u.path}${u.query}`;
  const verbosePre = o.verbose ? [E(`*   Trying ${r.ip}:${u.port}...`)] : [];
  if (!reach.ok) {
    const e = connectError(reach.kind === 'ok' ? 'refused' : reach.kind, r.ip, u.port);
    if (reach.kind === 'timeout') {
      const until = lab.time.physMs + 10_001;
      let first = true;
      const job = registerJob({
        step(_s, phys) {
          const lines: Line[] = first ? verbosePre : [];
          first = false;
          if (phys < until) return { lines, done: false, exitCode: null };
          return { lines: [...lines, ...(o.silent && !argv.includes('-sS') ? [] : [E(e.line)])], done: true, exitCode: e.code };
        },
      });
      return { lines: [], code: 0, stream: job };
    }
    return fail(e.code, ...verbosePre, ...(o.silent && !argv.includes('-sS') ? [] : [E(e.line)]));
  }
  let resp: RestResponse;
  let delayed: ((l: LabState) => RestResponse) | null = null;
  if (r.ip === OLLAMA_IP && u.port === OLLAMA_PORT) {
    if (!ollamaUp(lab)) return fail(7, E(CONNECT_REFUSED));
    if (u.path === '/api/tags' || u.path === '/api/tags/') resp = { status: 200, body: ollamaTagsJson(lab), headers: { 'Content-Type': 'application/json; charset=utf-8' }, latencyMs: 8 };
    else if (u.path === '/api/version') resp = { status: 200, body: '{"version":"0.3.12"}', headers: { 'Content-Type': 'application/json; charset=utf-8' }, latencyMs: 4 };
    else if (u.path === '/api/generate' && o.method === 'POST') {
      let req: { model?: string; prompt?: string; images?: string[] } = {};
      try {
        req = JSON.parse(o.body ?? '{}') as typeof req;
      } catch {
        return ok(L('{"error":"invalid character \'\\\'\' looking for beginning of value"}'));
      }
      const img = (req.images ?? [])[0] ?? null;
      const imageRef = img ? (img.startsWith('img:') ? img : (lab.workstation.files[img.replace(/^\/home\/engineer/, '~')] ?? null)) : null;
      const a = ask(lab, sh.ctx, req.model ?? '', req.prompt ?? '', imageRef, 'player');
      if (!a.ok) resp = { status: 404, body: JSON.stringify({ error: a.error }), headers: { 'Content-Type': 'application/json; charset=utf-8' }, latencyMs: 5 };
      else {
        const id = a.requestId;
        delayed = (l: LabState) => {
          const q = l.ollama.requests.find((x) => x.id === id);
          return { status: 200, body: JSON.stringify({ model: 'llava:latest', created_at: '2026-10-05T13:41:07.000Z', response: q?.response ?? '', done: true }), headers: { 'Content-Type': 'application/json; charset=utf-8' }, latencyMs: 0 };
        };
        resp = { status: 200, body: '', latencyMs: 0 };
        const reqId = id;
        let pre = true;
        const job = registerJob({
          step(s, _phys) {
            const lines: Line[] = pre ? verbosePre : [];
            pre = false;
            const q = s.lab.ollama.requests.find((x) => x.id === reqId);
            if (!q || q.state !== 'done') return { lines, done: false, exitCode: null };
            return { lines: [...lines, ...render(s.lab, o, delayed!(s.lab), fullUrl, r.ip!, u.port)], done: true, exitCode: 0 };
          },
        });
        return { lines: [], code: 0, stream: job };
      }
    } else resp = { status: 404, body: '404 page not found', headers: { 'Content-Type': 'text/plain; charset=utf-8' }, latencyMs: 2 };
  } else if (r.hostId === 'jenkins-vm' && u.port === 8080) {
    if (!jenkinsUp(lab)) return fail(7, E(`curl: (7) Failed to connect to ${r.ip} port 8080: Connection refused`));
    resp = jenkinsRest(lab, sh, o.method, u);
  } else if (r.hostId === 'ollama-vm' && u.port === 3000) {
    resp = { status: 200, body: '<!doctype html><html lang="en"><head><title>Open WebUI</title></head><body><div id="app"></div></body></html>', headers: { 'Content-Type': 'text/html; charset=utf-8' }, latencyMs: 12 };
  } else {
    resp = core().http(lab, sh.ctx, { method: o.method, url: fullUrl.replace(u.host, host), body: o.body, fromHostId: from, actor: 'player' });
  }
  const rendered = render(lab, o, resp, fullUrl, r.ip, u.port);
  if (resp.latencyMs > 1500) {
    const until = lab.time.physMs + resp.latencyMs;
    const job = registerJob({
      step(_s, phys) {
        return phys >= until ? { lines: rendered, done: true, exitCode: 0 } : { lines: [], done: false, exitCode: null };
      },
    });
    return { lines: [], code: 0, stream: job };
  }
  return { lines: [...verbosePre, ...rendered], code: 0 };
}

function render(lab: LabState, o: CurlOpts, resp: RestResponse, fullUrl: string, ip: string, port: number): Line[] {
  const out: Line[] = [];
  const statusLine = `HTTP/1.1 ${resp.status} ${HTTP_TEXT[resp.status] ?? ''}`.trimEnd();
  // The server's own header spelling wins (uvicorn on the Pis sends lower-case names); the default
  // Content-Type is only added when the response has none in any case.
  const own = resp.headers ?? {};
  const hasType = Object.keys(own).some((k) => k.toLowerCase() === 'content-type');
  const headers: Record<string, string> = { ...(hasType ? {} : { 'Content-Type': 'application/json' }), ...own, 'Content-Length': String(new TextEncoder().encode(resp.body).length), Date: httpDate(lab) };
  if (o.verbose) {
    const u = /^https?:\/\/([^/]+)(\/.*)?$/.exec(fullUrl);
    out.push(E(`* Connected to ${u?.[1]?.split(':')[0]} (${ip}) port ${port} (#0)`), E(`> ${o.method} ${u?.[2] ?? '/'} HTTP/1.1`), E(`> Host: ${u?.[1]}`), E('> User-Agent: curl/7.81.0'), E('> Accept: */*'));
    for (const h of o.headers) out.push(E(`> ${h}`));
    if (o.body) out.push(E(`> Content-Length: ${o.body.length}`));
    out.push(E('>'), E(`< ${statusLine}`), ...Object.entries(headers).map(([k, v]) => E(`< ${k}: ${v}`)), E('<'));
  } else if (o.include) out.push(L(statusLine), ...Object.entries(headers).map(([k, v]) => L(`${k}: ${v}`)), L(''));
  if (o.output !== '/dev/null' && o.output === null) for (const l of resp.body.split('\n')) if (l || resp.body) out.push(L(l));
  if (o.writeOut) out.push(L(o.writeOut.replace(/%\{http_code\}/g, String(resp.status)).replace(/\\n/g, '\n')));
  if (o.verbose) out.push(E(`* Connection #0 to host ${ip} left intact`));
  return out;
}

/* ────────────────────────────── nc / nslookup / ip ────────────────────────────── */

export function nc(sh: Sh, argv: string[], from: string): CmdResult {
  const args = argv.slice(1).filter((a) => !a.startsWith('-'));
  if (args.length < 2) return fail(1, E('usage: nc [-46CDdFhklNnrStUuvZz] [-I length] [-i interval] [-M ttl]'), E('	  [-m minttl] [-O length] [-P proxy_username] [-p source_port]'), E('	  [-q seconds] [-s sourceaddr] [-T keyword] [-V rtable] [-W recvlimit]'), E('	  [-w timeout] [-X proxy_protocol] [-x proxy_address] [destination] [port]'));
  const [host, portS] = args as [string, string];
  const r = core().resolve(sh.lab, host);
  if (!r.ip) return fail(1, E(`nc: getaddrinfo for host "${host}" port ${portS}: Name or service not known`));
  const reach = core().reach(sh.lab, sh.ctx, from, r.ip, Number(portS));
  if (reach.ok) return ok(E(`Connection to ${host} ${portS} port [tcp/*] succeeded!`));
  const why = reach.kind === 'refused' ? 'Connection refused' : reach.kind === 'timeout' ? 'Connection timed out' : 'No route to host';
  return fail(1, E(`nc: connect to ${host} port ${portS} (tcp) failed: ${why}`));
}

export function nslookup(sh: Sh, argv: string[]): CmdResult {
  const name = argv.slice(1).find((a) => !a.startsWith('-'));
  if (!name) return fail(1, E('Usage: nslookup [-opt ...] host'));
  const r = core().resolve(sh.lab, name);
  const head = [L('Server:\t\t10.42.0.53'), L('Address:\t10.42.0.53#53'), L('')];
  if (!r.ip) return fail(1, ...head, L(`** server can't find ${name}: NXDOMAIN`), L(''));
  if (/^\d+\.\d+\.\d+\.\d+$/.test(name)) {
    const h = r.hostId ? sh.lab.hosts[r.hostId] : null;
    const ptr = h?.aliases[0] ?? (h ? `${h.hostname.toLowerCase()}.lab.local` : null);
    if (!ptr) return fail(1, ...head, L(`** server can't find ${name.split('.').reverse().join('.')}.in-addr.arpa: NXDOMAIN`), L(''));
    return ok(L(`${name.split('.').reverse().join('.')}.in-addr.arpa\tname = ${ptr}.`), L(''));
  }
  return ok(...head, L(`Name:\t${name}`), L(`Address: ${r.ip}`), L(''));
}

export function ipAddr(ip: string, iface: string, mac: string, prefix = 16): CmdResult {
  return ok(
    L('1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN group default qlen 1000'),
    L('    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00'),
    L('    inet 127.0.0.1/8 scope host lo'),
    L('       valid_lft forever preferred_lft forever'),
    L(`2: ${iface}: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc fq_codel state UP group default qlen 1000`),
    L(`    link/ether ${mac} brd ff:ff:ff:ff:ff:ff`),
    L(`    inet ${ip}/${prefix} brd 10.42.255.255 scope global dynamic noprefixroute ${iface}`),
    L('       valid_lft 85972sec preferred_lft 85972sec'),
  );
}

export function macFor(ip: string): string {
  const parts = ip.split('.').map((n) => Number(n));
  const h = (n: number): string => n.toString(16).padStart(2, '0');
  return `dc:a6:32:${h(parts[1] ?? 0)}:${h(parts[2] ?? 0)}:${h(parts[3] ?? 0)}`;
}
