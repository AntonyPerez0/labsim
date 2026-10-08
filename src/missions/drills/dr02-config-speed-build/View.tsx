/**
 * DR02 config.properties Speed-Build — rig card on the left, an IntelliJ-style properties editor on the
 * right. Type `key=value` lines (Standard realism: keys autocomplete after 3 characters — Tab accepts).
 * Ctrl+Enter (or Run ▶) validates all 11 keys; the reveal shows the Config Assistant table.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { getState } from "@/core/store";
import type { DrillComponentProps } from "../../types";
import { useDrill } from "../common/useDrill";
import { Btn, Kbd, Legend, Reveal, Waiting } from "../common/ui";
import {
  CONFIG_KEYS,
  completeKey,
  filePoints,
  gradeConfig,
  type ConfigData,
  type KeyGrade,
} from "./logic";
import "./style.css";

interface Payload {
  rows: KeyGrade[];
  correct: number;
}

export function View(props: DrillComponentProps) {
  const d = useDrill<ConfigData, Payload>(props);
  const it = d.item;
  const assist = props.realism !== "strict";
  const [lines, setLines] = useState<string[]>([""]);
  const [cur, setCur] = useState(0);
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (!it) return;
    const start = it.data.start.length ? [...it.data.start] : [""];
    setLines(start);
    setCur(it.data.start.length ? 0 : 0);
    window.setTimeout(() => refs.current[0]?.focus(), 40);
  }, [d.itemKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    refs.current[cur]?.focus();
  }, [cur, lines.length]);

  const used = useMemo(
    () => lines.map((l) => l.split("=")[0]!.trim()).filter(Boolean),
    [lines],
  );

  const submit = () => {
    if (!it || d.staged) return;
    const g = gradeConfig(it.data, lines);
    const ms = d.elapsedMs();
    const streak = getState().session.drill?.streak ?? 0;
    const pts = filePoints(g.correct, ms / 1000, streak);
    const bad = g.rows.filter((r) => !r.ok).map((r) => r.key);
    d.stage(
      {
        correct: g.correct === CONFIG_KEYS.length,
        pointsOverride: pts,
        elapsedMs: ms,
        detail: bad.length
          ? `${g.correct}/11 keys — check ${bad.slice(0, 3).join(", ")}`
          : undefined,
      },
      { rows: g.rows, correct: g.correct },
    );
  };

  const setLine = (i: number, v: string) =>
    setLines((ls) => ls.map((l, j) => (j === i ? v : l)));

  const onKey = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    const line = lines[i] ?? "";
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      submit();
      return;
    }
    if (e.key === "Tab" && assist) {
      const sug = completeKey(line.trim(), used);
      if (sug) {
        e.preventDefault();
        setLine(i, `${sug}=`);
        return;
      }
    }
    if (e.key === "Enter") {
      e.preventDefault();
      setLines((ls) => [...ls.slice(0, i + 1), "", ...ls.slice(i + 1)]);
      setCur(i + 1);
    } else if (e.key === "ArrowDown" && i < lines.length - 1) {
      e.preventDefault();
      setCur(i + 1);
    } else if (e.key === "ArrowUp" && i > 0) {
      e.preventDefault();
      setCur(i - 1);
    } else if (e.key === "Backspace" && line === "" && lines.length > 1) {
      e.preventDefault();
      setLines((ls) => ls.filter((_, j) => j !== i));
      setCur(Math.max(0, i - 1));
    }
  };

  if (!it) return <Waiting />;
  const data = it.data;
  const st = d.staged;
  return (
    <div className="dr02">
      <div className="dr02-left">
        <div className={`dr02-card${st ? ' is-compact' : ''}`}>
          <div className="dr02-card__head">
            <span className="dr02-card__eyebrow">Orca · Robot</span>
            <span className="dr02-card__name">{data.hrn}</span>
            <span className={`dr02-kind is-${data.kind}`}>{data.kind}</span>
          </div>
          {data.variant === "wiki" ? (
            <div className="dr02-wiki">
              Copied from the old team wiki (2023) — it may be stale.
            </div>
          ) : null}
          <dl className="dr02-facts">
            <dt>Name</dt>
            <dd className="mono">{data.rig}</dd>
            <dt>Environment</dt>
            <dd className="mono">{data.env}</dd>
            <dt>Location</dt>
            <dd>{data.location}</dd>
            <dt>Unlock passcode</dt>
            <dd className="mono">{data.passcode}</dd>
          </dl>
          <table className="dr02-devs">
            <thead>
              <tr>
                <th>Role</th>
                <th>Device</th>
                <th>IP</th>
                <th>Serial</th>
              </tr>
            </thead>
            <tbody>
              {data.devices.map((dv) => (
                <tr key={dv.role}>
                  <td>
                    <b>{dv.role}</b>
                  </td>
                  <td>
                    {dv.model}
                    <div className="dr02-enum">{dv.type}</div>
                  </td>
                  <td className="mono">{dv.ip}</td>
                  <td className="mono">{dv.serial}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="dr02-note">
            Running locally from your workstation: Jenkins injects these in CI —
            here you type them.
          </div>
        </div>
        {st ? (
          <Reveal
            correct={st.verdict.correct}
            points={st.points}
            multiplier={st.multiplier}
            title={
              st.verdict.correct
                ? "config.properties ✓ 11/11"
                : `config.properties ✗ ${st.payload.correct}/11`
            }
            onNext={() => d.commit()}
            autoMs={2400}
            nextLabel={
              d.itemTarget && d.index + 1 >= d.itemTarget
                ? "Finish"
                : "Next rig"
            }
          >
            {it.teach.why}
          </Reveal>
        ) : (
          <Legend
            items={[
              ["⏎", "new line"],
              ...(assist
                ? ([["Tab", "complete key"]] as [string, string][])
                : []),
              ["Ctrl ⏎", "validate"],
              ["", "+40 per key · 11/11 +100 + speed"],
            ]}
          />
        )}
      </div>

      <div className="dr02-editor">
        <div className="dr02-editor__tabs">
          <span className="dr02-tab is-on">config.properties</span>
          <span className="dr02-tab">TaxTest.java</span>
          <span className="dr02-editor__count">
            {d.itemTarget
              ? `file ${Math.min(d.index + 1, d.itemTarget)} / ${d.itemTarget}`
              : ""}
          </span>
        </div>
        {st ? (
          <ConfigAssistant rows={st.payload.rows} />
        ) : (
          <div className="dr02-lines">
            {lines.map((l, i) => {
              const sug =
                assist && i === cur ? completeKey(l.trim(), used) : null;
              const key = l.split("=")[0]!.trim();
              const known = (CONFIG_KEYS as readonly string[]).includes(key);
              return (
                <div
                  key={i}
                  className={`dr02-line${i === cur ? " is-cur" : ""}`}
                  onClick={() => setCur(i)}
                >
                  <span className="dr02-gutter">{i + 1}</span>
                  <div className="dr02-field">
                    <input
                      ref={(el) => {
                        refs.current[i] = el;
                      }}
                      className={`dr02-input${l.includes("=") ? (known ? " is-known" : " is-unknown") : ""}`}
                      value={l}
                      spellCheck={false}
                      autoComplete="off"
                      onFocus={() => setCur(i)}
                      onChange={(e) => setLine(i, e.target.value)}
                      onKeyDown={(e) => onKey(i, e)}
                    />
                    {sug ? (
                      <span className="dr02-ghost" aria-hidden>
                        <span className="dr02-ghost__typed">{l}</span>
                        {sug.slice(l.trim().length)}=
                        <span className="dr02-ghost__tab">Tab</span>
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div className="dr02-editor__foot">
          <span className="dr02-keys">
            {CONFIG_KEYS.map((k) => (
              <span
                key={k}
                className={`dr02-keychip${used.includes(k) ? " is-used" : ""}`}
              >
                {k}
              </span>
            ))}
          </span>
          {!st ? (
            <Btn primary onClick={submit} k="Ctrl ⏎">
              Run ▶
            </Btn>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ConfigAssistant({ rows }: { rows: KeyGrade[] }) {
  return (
    <div className="dr02-assist">
      <div className="dr02-assist__title">uia-remote Config Assistant</div>
      {rows.map((r) => (
        <div key={r.key} className={`dr02-row ${r.ok ? "is-ok" : "is-bad"}`}>
          <span className="dr02-row__mark">{r.ok ? "✓" : "✗"}</span>
          <span className="dr02-row__key">{r.key}</span>
          <span className="dr02-row__val">
            {r.value === null ? <i>missing</i> : r.value || <i>empty</i>}
          </span>
          {!r.ok ? (
            <span className="dr02-row__fix">
              → <b>{r.expected || "(empty)"}</b> — {r.why}
            </span>
          ) : null}
        </div>
      ))}
      <div className="dr02-assist__hint">
        <Kbd k="⏎" size="sm" /> next rig
      </div>
    </div>
  );
}
