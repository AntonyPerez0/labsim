/** Git dialogs (Apps §4.10): Push Commits, Update Project / Pull, Create New Branch, Branches popup. */
import { useMemo, useState } from 'react';
import type { GitRepo } from '@/sim';
import { Buttons, Dialog } from './Dialog';
import { FileIcon, IcBranch, IcSearch } from './icons';
import { knownLocalBranches } from './ideModel';
import { MenuList, type MenuItem } from './Menu';
import { authorName, commitDate } from './Panels';
import { isValidBranchName, shortSha, unpushedCommits } from './vcs';

export function PushDialog(props: { gitRepo: GitRepo; onPush(): void; onClose(): void }) {
  const repo = props.gitRepo;
  const branch = repo.local?.branch ?? 'main';
  const isNew = !repo.branches[branch];
  const commits = useMemo(() => unpushedCommits(repo), [repo]);
  const [sel, setSel] = useState(commits[0]?.sha ?? null);
  const selected = commits.find((c) => c.sha === sel) ?? null;
  return (
    <Dialog
      title={`Push Commits to ${repo.name}`}
      onCancel={props.onClose}
      onOk={props.onPush}
      width={780}
      bodyPad={false}
      footer={<Buttons okLabel="Push" onOk={props.onPush} okDisabled={!commits.length && !isNew} onCancel={props.onClose} />}
    >
      <div style={{ display: 'flex', minHeight: 260 }}>
        <div style={{ width: 360, borderRight: '1px solid var(--ij-border)', padding: 8 }}>
          <div className="ij-prow">
            <IcBranch /> <b>{repo.name}</b>: {branch} → origin : {branch}
            {isNew ? <span style={{ color: '#62b543', marginLeft: 6 }}>New</span> : null}
          </div>
          {commits.map((c) => (
            <div key={c.sha} className={`ij-prow${sel === c.sha ? ' ij-selected' : ''}`} style={{ paddingLeft: 26 }} onMouseDown={() => setSel(c.sha)}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.message.split('\n')[0]}</span>
            </div>
          ))}
          {!commits.length ? <div className="ij-prow ij-dim">{isNew ? 'No new commits — the branch will be created on the remote' : 'Nothing to push'}</div> : null}
        </div>
        <div style={{ flex: 1, padding: 8, overflow: 'auto' }}>
          {selected ? (
            <>
              {Object.keys(selected.changes).map((p) => (
                <div key={p} className="ij-prow">
                  <FileIcon path={p} /> <span className="ij-vcs-modified">{p.split('/').pop()}</span> <span className="ij-dim">{p.split('/').slice(0, -1).join('/')}</span>
                </div>
              ))}
              <div className="ij-dim" style={{ marginTop: 10 }}>
                {shortSha(selected.sha)} {selected.message.split('\n')[0]}  {authorName(selected.author)}  {commitDate(selected.atMs)}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </Dialog>
  );
}

export function PullDialog(props: { branch: string; mode: 'update' | 'pull'; onOk(): void; onClose(): void }) {
  const [rebase, setRebase] = useState(false);
  return (
    <Dialog
      title={props.mode === 'update' ? 'Update Project' : `Pull to ${props.branch}`}
      onCancel={props.onClose}
      onOk={props.onOk}
      width={460}
      footer={<Buttons okLabel={props.mode === 'update' ? 'OK' : 'Pull'} onOk={props.onOk} onCancel={props.onClose} />}
    >
      {props.mode === 'pull' ? (
        <div className="ij-form" style={{ marginBottom: 10 }}>
          <label>Remote:</label>
          <select className="ij-select" defaultValue="origin">
            <option>origin</option>
          </select>
          <label>Branch:</label>
          <select className="ij-select" defaultValue={`origin/${props.branch}`}>
            <option>origin/{props.branch}</option>
          </select>
        </div>
      ) : null}
      <div className="ij-dim" style={{ marginBottom: 6 }}>
        Update Type
      </div>
      <label className="ij-check" style={{ display: 'flex', marginBottom: 4 }}>
        <input type="radio" name="ij-upd" checked={!rebase} onChange={() => setRebase(false)} /> Merge incoming changes into the current branch
      </label>
      <label className="ij-check" style={{ display: 'flex' }}>
        <input type="radio" name="ij-upd" checked={rebase} onChange={() => setRebase(true)} /> Rebase the current branch on top of incoming changes
      </label>
    </Dialog>
  );
}

export function NewBranchDialog(props: { from: string; exists(name: string): boolean; onCreate(name: string, checkout: boolean): void; onClose(): void }) {
  const [name, setName] = useState('');
  const [checkout, setCheckout] = useState(true);
  const [overwrite, setOverwrite] = useState(false);
  const n = name.trim();
  const err = !n ? null : !isValidBranchName(n) ? `Branch name ${n} is not valid` : props.exists(n) && !overwrite ? `Branch ${n} already exists` : null;
  const ok = () => n && !err && props.onCreate(n, checkout);
  return (
    <Dialog title="Create New Branch" onCancel={props.onClose} onOk={ok} width={440} footer={<Buttons okLabel="Create" onOk={ok} okDisabled={!n || !!err} onCancel={props.onClose} />}>
      <div className="ij-form">
        <label htmlFor="ij-newbranch">New branch name:</label>
        <input id="ij-newbranch" className={`ij-field-input${err ? ' ij-invalid' : ''}`} value={name} spellCheck={false} onChange={(e) => setName(e.target.value)} />
        {err ? <div className="ij-field-error">{err}</div> : null}
        <span />
        <label className="ij-check">
          <input type="checkbox" checked={checkout} onChange={(e) => setCheckout(e.target.checked)} /> Checkout branch
        </label>
        <span />
        <label className="ij-check">
          <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} /> Overwrite existing branch
        </label>
      </div>
      <div className="ij-dim" style={{ marginTop: 8 }}>
        From: {props.from}
      </div>
    </Dialog>
  );
}

export function BranchesPopup(props: {
  gitRepo: GitRepo;
  anchor: { x: number; y: number };
  onCheckout(branch: string): void;
  onNewBranch(from?: string): void;
  onDiff(branch: string): void;
  onClose(): void;
}) {
  const repo = props.gitRepo;
  const current = repo.local?.branch ?? repo.defaultBranch;
  const [q, setQ] = useState('');
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  // sim-devops keeps the clone's local branches on `local.branches` (beyond the contract); merge what the IDE saw.
  const simLocal = Object.keys((repo.local as { branches?: Record<string, string> } | null)?.branches ?? {});
  const local = [...new Set([...knownLocalBranches(repo.id, current, repo.defaultBranch), ...simLocal])];
  const remote = Object.keys(repo.branches).sort();
  const match = (b: string) => b.toLowerCase().includes(q.toLowerCase());
  const open = (e: React.MouseEvent, b: string, isRemote: boolean) => {
    const root = (e.currentTarget as HTMLElement).closest('.ij-root')?.getBoundingClientRect();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const target = isRemote ? b : b;
    setMenu({
      x: r.right - (root?.left ?? 0),
      y: r.top - (root?.top ?? 0),
      items: [
        { label: 'Checkout', disabled: !isRemote && b === current, onClick: () => props.onCheckout(target) },
        { label: `New Branch from '${isRemote ? `origin/${b}` : b}'…`, onClick: () => props.onNewBranch(isRemote ? `origin/${b}` : b) },
        { separator: true },
        { label: 'Show Diff with Working Tree', onClick: () => props.onDiff(b) },
        { separator: true },
        { label: 'Delete', disabled: true },
      ],
    });
  };
  return (
    <div className="ij-backdrop" style={{ background: 'transparent', padding: 0, display: 'block' }} onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div
        className="ij-popup"
        style={{ position: 'absolute', width: 340, left: Math.max(8, props.anchor.x - 340), bottom: 30, maxHeight: 460 }}
        role="dialog"
        aria-label="Git Branches"
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            if (menu) setMenu(null);
            else props.onClose();
          } else e.stopPropagation();
        }}
      >
        <div className="ij-popup-search">
          <IcSearch />
          <input autoFocus placeholder="Search" aria-label="Search branches" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="ij-list">
          <div className="ij-list-row" role="button" onMouseDown={(e) => (e.preventDefault(), props.onNewBranch())}>
            + New Branch…
          </div>
          <div className="ij-list-row ij-dim">Checkout Tag or Revision…</div>
          <div className="ij-list-sec">Local</div>
          {local.filter(match).map((b) => (
            <div key={`l:${b}`} className="ij-list-row" style={{ paddingLeft: 18 }} onMouseDown={(e) => (e.preventDefault(), open(e, b, false))}>
              {b === current ? <span style={{ color: '#f4c82d' }}>★</span> : <IcBranch />} {b}
              {b === current && (repo.local?.ahead || repo.local?.behind) ? (
                <span className="ij-dim">
                  {repo.local?.ahead ? ` ↑${repo.local.ahead}` : ''}
                  {repo.local?.behind ? ` ↓${repo.local.behind}` : ''}
                </span>
              ) : null}
            </div>
          ))}
          <div className="ij-list-sec">Remote</div>
          {remote.filter(match).map((b) => (
            <div key={`r:${b}`} className="ij-list-row" style={{ paddingLeft: 18 }} onMouseDown={(e) => (e.preventDefault(), open(e, b, true))}>
              <IcBranch /> origin/{b}
            </div>
          ))}
        </div>
      </div>
      {menu ? <MenuList items={menu.items} x={menu.x} y={menu.y} onClose={() => setMenu(null)} /> : null}
    </div>
  );
}
