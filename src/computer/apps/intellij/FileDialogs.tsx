/**
 * File & refactoring dialogs (Apps §4.7): New Java Class / File / Directory / Package, Add File to Git, Move,
 * Rename, Delete, Rollback; plus Stop-and-Rerun, Run/Debug Configurations, Settings, About, Code With Me.
 */
import { useState } from 'react';
import type { RepoId } from '@/sim';
import { Buttons, Dialog } from './Dialog';
import { FileIcon, IcClass, IcCodeWithMe, IcEnum, IcIdeaLogo, IcInterface } from './icons';
import { javaPackageOf, sourceRootOf, type RunConfig } from './projectModel';

const JAVA_ID = /^[A-Za-z_$][\w$]*$/;

export function NewClassDialog(props: { dir: string; onCreate(path: string, text: string): void; onClose(): void }) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'Class' | 'Interface' | 'Enum' | 'Record'>('Class');
  const valid = JAVA_ID.test(name.trim());
  const pkg = javaPackageOf(`${props.dir}/X.java`);
  const create = () => {
    if (!valid) return;
    const n = name.trim();
    const kw = kind === 'Class' ? 'class' : kind === 'Interface' ? 'interface' : kind === 'Enum' ? 'enum' : 'record';
    const body = kind === 'Record' ? `public record ${n}() {\n}\n` : `public ${kw} ${n} {\n}\n`;
    props.onCreate(`${props.dir ? `${props.dir}/` : ''}${n}.java`, `${pkg ? `package ${pkg};\n\n` : ''}${body}`);
  };
  const kinds: [typeof kind, React.ReactNode][] = [
    ['Class', <IcClass key="c" />],
    ['Interface', <IcInterface key="i" />],
    ['Enum', <IcEnum key="e" />],
    ['Record', <IcClass key="r" />],
  ];
  return (
    <Dialog title="New Java Class" onCancel={props.onClose} onOk={create} width={380}>
      <input className="ij-field-input" style={{ width: '100%' }} placeholder="Name" aria-label="Name" value={name} onChange={(e) => setName(e.target.value)} />
      <div className="ij-list" style={{ marginTop: 6 }} role="listbox" aria-label="Kind">
        {kinds.map(([k, ic]) => (
          <div key={k} role="option" aria-selected={kind === k} className={`ij-list-row${kind === k ? ' ij-active' : ''}`} onMouseDown={() => setKind(k)} onDoubleClick={create}>
            {ic} {k}
          </div>
        ))}
      </div>
      {name && !valid ? <div className="ij-err" style={{ marginTop: 6 }}>Not a valid class name</div> : null}
    </Dialog>
  );
}

export function NewFileDialog(props: { dir: string; what: 'File' | 'Directory' | 'Package'; exists(path: string): boolean; onCreate(path: string): void; onClose(): void }) {
  const [name, setName] = useState('');
  const n = name.trim();
  const rel = props.what === 'Package' ? n.replace(/\./g, '/') : n;
  const path = `${props.dir ? `${props.dir}/` : ''}${rel}`;
  const err = !n ? null : props.exists(path) ? `${props.what === 'File' ? 'File' : 'Directory'} '${n}' already exists` : /[\\:*?"<>|]/.test(n) ? 'Invalid name' : null;
  const create = () => {
    if (!n || err) return;
    props.onCreate(path);
  };
  return (
    <Dialog title={`New ${props.what}`} onCancel={props.onClose} onOk={create} width={380}>
      <input className={`ij-field-input${err ? ' ij-invalid' : ''}`} style={{ width: '100%' }} placeholder={props.what === 'Package' ? 'com.labsim.uia.screens' : 'Name'} aria-label="Name" value={name} onChange={(e) => setName(e.target.value)} />
      {err ? <div className="ij-err" style={{ marginTop: 6 }}>{err}</div> : null}
    </Dialog>
  );
}

export function AddToGitDialog(props: { path: string; onAnswer(add: boolean): void }) {
  return (
    <Dialog
      title="Add File to Git"
      onCancel={() => props.onAnswer(false)}
      onOk={() => props.onAnswer(true)}
      footer={
        <>
          <span className="ij-foot-left">
            <label className="ij-check">
              <input type="checkbox" /> Don&apos;t ask again
            </label>
          </span>
          <button type="button" className="ij-btn ij-default" data-autofocus onClick={() => props.onAnswer(true)}>
            Add
          </button>
          <button type="button" className="ij-btn" onClick={() => props.onAnswer(false)}>
            Cancel
          </button>
        </>
      }
    >
      <div>Do you want to add the following file to Git?</div>
      <div style={{ marginTop: 8 }}>
        <FileIcon path={props.path} /> {props.path}
      </div>
    </Dialog>
  );
}

export function MoveDialog(props: { path: string; targetDir?: string; onMove(to: string): void; onClose(): void }) {
  const name = props.path.split('/').pop()!;
  const java = name.endsWith('.java');
  const fromDir = props.path.split('/').slice(0, -1).join('/');
  const startDir = props.targetDir ?? fromDir;
  const [dir, setDir] = useState(startDir);
  const [pkg, setPkg] = useState(javaPackageOf(`${startDir}/${name}`) ?? '');
  const root = sourceRootOf(`${startDir}/${name}`) ?? sourceRootOf(props.path);
  const effectiveDir = java && root ? (pkg.trim() ? `${root}/${pkg.trim().replace(/\./g, '/')}` : root) : dir.trim().replace(/^\/+|\/+$/g, '');
  const to = `${effectiveDir ? `${effectiveDir}/` : ''}${name}`;
  const valid = to !== props.path && (!java || !pkg.trim() || /^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*$/.test(pkg.trim()));
  const ok = () => valid && props.onMove(to);
  return (
    <Dialog title="Move" onCancel={props.onClose} onOk={ok} width={560} footer={<Buttons okLabel="Refactor" onOk={ok} okDisabled={!valid} onCancel={props.onClose} />}>
      <div className="ij-form">
        {java && root ? (
          <>
            <label htmlFor="ij-move-pkg">Move class {name.replace(/\.java$/, '')} to package:</label>
            <input id="ij-move-pkg" className="ij-field-input" value={pkg} onChange={(e) => setPkg(e.target.value)} />
            <label>To directory:</label>
            <input className="ij-field-input" value={`.../${effectiveDir}`} readOnly />
          </>
        ) : (
          <>
            <label htmlFor="ij-move-dir">Move file {name} to directory:</label>
            <input id="ij-move-dir" className="ij-field-input" value={dir} onChange={(e) => setDir(e.target.value)} />
          </>
        )}
        <span />
        <label className="ij-check">
          <input type="checkbox" defaultChecked /> Search for references
        </label>
      </div>
    </Dialog>
  );
}

export function RenameDialog(props: { path: string; exists(path: string): boolean; onRename(to: string): void; onClose(): void }) {
  const name = props.path.split('/').pop()!;
  const dir = props.path.split('/').slice(0, -1).join('/');
  const [v, setV] = useState(name);
  const to = `${dir ? `${dir}/` : ''}${v.trim()}`;
  const err = !v.trim() ? null : to !== props.path && props.exists(to) ? `File ${v.trim()} already exists` : /[\\/:*?"<>|]/.test(v) ? 'Invalid name' : null;
  const ok = () => !err && v.trim() && to !== props.path && props.onRename(to);
  return (
    <Dialog title="Rename file" onCancel={props.onClose} onOk={ok} width={460} footer={<Buttons okLabel="Refactor" onOk={ok} okDisabled={!!err || !v.trim()} onCancel={props.onClose} />}>
      <div className="ij-form">
        <label htmlFor="ij-rename">New name:</label>
        <input
          id="ij-rename"
          className={`ij-field-input${err ? ' ij-invalid' : ''}`}
          value={v}
          onChange={(e) => setV(e.target.value)}
          onFocus={(e) => e.currentTarget.setSelectionRange(0, v.lastIndexOf('.') > 0 ? v.lastIndexOf('.') : v.length)}
        />
        {err ? <div className="ij-field-error">{err}</div> : null}
      </div>
    </Dialog>
  );
}

export function ConfirmDialog(props: { title: string; message: React.ReactNode; okLabel: string; onOk(): void; onClose(): void }) {
  return (
    <Dialog title={props.title} onCancel={props.onClose} onOk={props.onOk} width={440} footer={<Buttons okLabel={props.okLabel} onOk={props.onOk} onCancel={props.onClose} />}>
      {props.message}
    </Dialog>
  );
}

export function EditConfigsDialog(props: { configs: RunConfig[]; selected: string | null; root: string; onClose(): void }) {
  const [sel, setSel] = useState(props.selected ?? props.configs[0]?.name ?? null);
  const cfg = props.configs.find((c) => c.name === sel) ?? null;
  const groups: [string, RunConfig[]][] = [
    ['JUnit', props.configs.filter((c) => c.kind === 'junit')],
    ['LSTR', props.configs.filter((c) => c.kind === 'lstr')],
  ];
  return (
    <Dialog title="Run/Debug Configurations" onCancel={props.onClose} width={760} bodyPad={false} footer={<button type="button" className="ij-btn ij-default" onClick={props.onClose}>OK</button>}>
      <div style={{ display: 'flex', minHeight: 320 }}>
        <div className="ij-list" style={{ width: 260, borderRight: '1px solid var(--ij-border)' }}>
          {groups
            .filter(([, l]) => l.length)
            .map(([g, l]) => (
              <div key={g}>
                <div className="ij-list-sec">{g}</div>
                {l.map((c) => (
                  <div key={c.name} className={`ij-list-row${sel === c.name ? ' ij-active' : ''}`} style={{ paddingLeft: 22 }} onMouseDown={() => setSel(c.name)}>
                    <FileIcon path={c.testPath} test={c.kind === 'junit'} /> {c.name}
                  </div>
                ))}
              </div>
            ))}
          {!props.configs.length ? <div className="ij-list-row ij-dim">No configurations</div> : null}
        </div>
        <div style={{ flex: 1, padding: 16 }}>
          {cfg ? (
            <div className="ij-form">
              <label>Name:</label>
              <input className="ij-field-input" value={cfg.name} readOnly />
              <label>{cfg.kind === 'junit' ? 'Class:' : 'Test file:'}</label>
              <input className="ij-field-input" value={cfg.kind === 'junit' ? `${javaPackageOf(cfg.testPath) ?? ''}.${cfg.name}` : cfg.testPath} readOnly />
              <label>Working directory:</label>
              <input className="ij-field-input" value={`$MODULE_WORKING_DIR$ (${props.root})`} readOnly />
              <label>VM options:</label>
              <input className="ij-field-input" value="-ea" readOnly />
              <span />
              <span className="ij-dim">Configurations are generated from the project (read-only in this lab).</span>
            </div>
          ) : null}
        </div>
      </div>
    </Dialog>
  );
}

export function SettingsDialog(props: { theme: 'darcula' | 'light'; fontSize: number; onApply(theme: 'darcula' | 'light', fontSize: number): void; onClose(): void }) {
  const [page, setPage] = useState<'theme' | 'font'>('theme');
  const [theme, setTheme] = useState(props.theme);
  const [size, setSize] = useState(props.fontSize);
  const apply = () => props.onApply(theme, size);
  return (
    <Dialog
      title="Settings"
      onCancel={props.onClose}
      width={720}
      bodyPad={false}
      footer={
        <>
          <button type="button" className="ij-btn ij-default" onClick={() => (apply(), props.onClose())}>
            OK
          </button>
          <button type="button" className="ij-btn" onClick={props.onClose}>
            Cancel
          </button>
          <button type="button" className="ij-btn" onClick={apply}>
            Apply
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', minHeight: 300 }}>
        <div className="ij-list" style={{ width: 220, borderRight: '1px solid var(--ij-border)' }}>
          <div className="ij-list-sec">Appearance &amp; Behavior</div>
          <div className={`ij-list-row${page === 'theme' ? ' ij-active' : ''}`} style={{ paddingLeft: 22 }} onMouseDown={() => setPage('theme')}>
            Appearance
          </div>
          <div className="ij-list-sec">Editor</div>
          <div className={`ij-list-row${page === 'font' ? ' ij-active' : ''}`} style={{ paddingLeft: 22 }} onMouseDown={() => setPage('font')}>
            Font
          </div>
        </div>
        <div style={{ flex: 1, padding: 16 }}>
          {page === 'theme' ? (
            <div className="ij-form">
              <label htmlFor="ij-theme">Theme:</label>
              <select id="ij-theme" className="ij-select" value={theme} onChange={(e) => setTheme(e.target.value as 'darcula' | 'light')}>
                <option value="darcula">Darcula</option>
                <option value="light">IntelliJ Light</option>
              </select>
            </div>
          ) : (
            <div className="ij-form">
              <label htmlFor="ij-fsize">Size:</label>
              <input id="ij-fsize" className="ij-field-input" type="number" min={9} max={24} value={size} onChange={(e) => setSize(Math.max(9, Math.min(24, Number(e.target.value) || 13)))} style={{ width: 80 }} />
              <label>Line height:</label>
              <input className="ij-field-input" value="1.4" readOnly style={{ width: 80 }} />
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}

export function AboutDialog({ onClose }: { onClose(): void }) {
  return (
    <Dialog title="About IntelliJ IDEA" onCancel={onClose} width={460} footer={<button type="button" className="ij-btn ij-default" onClick={onClose}>Close</button>}>
      <div style={{ display: 'flex', gap: 16 }}>
        <IcIdeaLogo size={56} />
        <div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>IntelliJ IDEA 2024.3 (Community Edition)</div>
          <div className="ij-dim">Build #IC-243.21565.193</div>
          <div className="ij-dim" style={{ marginTop: 8 }}>
            Runtime version: 21.0.5+8-b631.28 amd64
            <br />
            VM: OpenJDK 64-Bit Server VM by JetBrains s.r.o.
          </div>
        </div>
      </div>
    </Dialog>
  );
}

export function CodeWithMeDialog(props: { sessions: { person: string; personName: string; repo: RepoId }[]; onJoin(person: string, repo: RepoId): void; onClose(): void }) {
  const [sel, setSel] = useState(0);
  const s = props.sessions[sel];
  return (
    <Dialog
      title="Code With Me"
      onCancel={props.onClose}
      onOk={() => s && props.onJoin(s.person, s.repo)}
      width={440}
      footer={<Buttons okLabel="Join Session…" okDisabled={!s} onOk={() => s && props.onJoin(s.person, s.repo)} onCancel={props.onClose} />}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <IcCodeWithMe /> Join a colleague&apos;s shared project
      </div>
      <div className="ij-list" style={{ minHeight: 90, border: '1px solid var(--ij-border2)' }} role="listbox">
        {props.sessions.map((x, i) => (
          <div key={`${x.person}/${x.repo}`} role="option" aria-selected={i === sel} className={`ij-list-row${i === sel ? ' ij-active' : ''}`} onMouseDown={() => setSel(i)} onDoubleClick={() => props.onJoin(x.person, x.repo)}>
            {x.personName} — {x.repo}
          </div>
        ))}
        {!props.sessions.length ? <div className="ij-list-row ij-dim">No shared sessions</div> : null}
      </div>
    </Dialog>
  );
}
