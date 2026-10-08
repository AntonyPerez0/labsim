/** Renders the IDE's current modal dialog / popup (`model.dialog`) and wires it to the actions. */
import { personName } from '@/content/team';
import { getState } from '@/core/store';
import type { GitRepo, RepoId } from '@/sim';
import { applyScreenIntention, codeWithMeSessions, createFile, deleteFile, gitCheckout, gitPull, gitPush, gitRollback, moveFile, openFile, startRun, writeProjectFile } from './actions';
import { ConfirmDialog, AboutDialog, AddToGitDialog, CodeWithMeDialog, EditConfigsDialog, MoveDialog, NewClassDialog, NewFileDialog, RenameDialog, SettingsDialog } from './FileDialogs';
import { BranchesPopup, NewBranchDialog, PullDialog, PushDialog } from './GitDialogs';
import { knownLocalBranches, type IdeModel } from './ideModel';
import { screenClassInfo } from './inspections';
import { lineAt, posToLineCol } from './editorOps';
import { tokenAt } from './lang';
import type { RunConfig } from './projectModel';
import { ContextActionsPopup, FindInFilesPopup, GotoLineDialog, RecentFilesPopup, SearchEverywhere, type ActionEntry, type ContextAction } from './Popups';
import { OpenProjectDialog } from './Welcome';
import { GetFromVcsDialog } from './VcsDialog';
import { treeAt } from './vcs';
import { getWindowManager } from '@/computer/apps';

export interface DialogHostProps {
  model: IdeModel;
  repo: RepoId;
  files: Record<string, string>;
  gitRepo: GitRepo | null;
  configs: RunConfig[];
  root: string;
  actions: ActionEntry[];
  theme: 'darcula' | 'light';
  fontSize: number;
  branchAnchor: { x: number; y: number };
  virtualDirs: Set<string>;
  onSettings(theme: 'darcula' | 'light', fontSize: number): void;
  onOpenProject(repo: RepoId, opts?: { cwm?: string | null; cloned?: boolean }): void;
}

export function DialogHost(props: DialogHostProps) {
  const { model, repo, files, gitRepo } = props;
  const d = model.dialog;
  if (!d) return null;
  const close = () => {
    model.popupAnchor = null;
    model.openDialog(null);
    model.editorFocusSeq++;
    model.changed();
  };
  const exists = (p: string) => files[p] !== undefined || Object.keys(files).some((f) => f.startsWith(`${p}/`)) || props.virtualDirs.has(p);
  const buffer = model.active ? model.buffers.get(model.active) : undefined;

  switch (d.kind) {
    case 'getFromVcs':
      return (
        <GetFromVcsDialog
          initialUrl={d.url}
          onCancel={close}
          onOpened={(r, cloned) => {
            close();
            props.onOpenProject(r, { cloned });
          }}
        />
      );
    case 'openProject':
      return <OpenProjectDialog onCancel={close} onOpen={(r) => (close(), props.onOpenProject(r))} />;
    case 'gotoLine': {
      const lc = buffer ? posToLineCol(buffer.text, buffer.end) : { line: 1, col: 1 };
      return (
        <GotoLineDialog
          line={lc.line}
          col={lc.col}
          onClose={close}
          onGo={(line, col) => {
            close();
            if (buffer) openFile(model, buffer.path, { line, col, emit: false });
          }}
        />
      );
    }
    case 'gotoFile':
      return <SearchEverywhere mode={d.mode} paths={Object.keys(files)} actions={props.actions} onClose={close} onOpen={(p) => (close(), openFile(model, p))} />;
    case 'recentFiles':
      return <RecentFilesPopup recent={model.recent.filter((p) => files[p] !== undefined)} onClose={close} onOpen={(p) => (close(), openFile(model, p))} />;
    case 'findInFiles':
      return <FindInFilesPopup files={files} initial={d.query} onClose={close} onOpen={(p, line, col) => (close(), openFile(model, p, { line, col }))} />;
    case 'contextActions': {
      const list: ContextAction[] = [];
      if (buffer) {
        const info = screenClassInfo(buffer.path, buffer.text);
        if (info.isScreen && info.missing.length) list.push({ label: 'Implement mandatory screen methods', primary: true, run: () => applyScreenIntention(model, buffer.path) });
        list.push({
          label: 'Add Javadoc',
          run: () => {
            const l = lineAt(buffer.text, buffer.end);
            const ws = /^\s*/.exec(l.text)![0];
            const doc = `${ws}/**\n${ws} * \n${ws} */\n`;
            model.recordEdit(buffer, { text: buffer.text.slice(0, l.start) + doc + buffer.text.slice(l.start), start: l.start + ws.length + 7 + ws.length, end: l.start + ws.length + 7 + ws.length }, 'intention');
            model.changed();
          },
        });
        list.push({
          label: 'Copy reference',
          run: () => {
            const l = lineAt(buffer.text, buffer.end);
            const tok = tokenAt(l.text, buffer.end - l.start);
            const cls = buffer.path.split('/').pop()!.replace(/\.\w+$/, '');
            const pkg = /^\s*package\s+([\w.]+)\s*;/m.exec(buffer.text)?.[1];
            getWindowManager()?.clipboard.write(pkg ? `${pkg}.${cls}${tok && tok !== cls ? `#${tok}` : ''}` : `${buffer.path}:${posToLineCol(buffer.text, buffer.end).line}`, 'intellij');
          },
        });
      }
      return <ContextActionsPopup actions={list} anchor={model.popupAnchor} onClose={close} />;
    }
    case 'newClass':
      return (
        <NewClassDialog
          dir={d.dir}
          onClose={close}
          onCreate={(path, text) => {
            if (model.cwm) {
              close();
              createFile(model, path, text, null);
              return;
            }
            const r = writeProjectFile(repo, model.cwm, path, text);
            if (!r.ok) {
              close();
              model.balloon({ kind: 'error', title: 'Cannot create class', body: r.error });
              return;
            }
            model.openDialog({ kind: 'addToGit', path });
          }}
        />
      );
    case 'newFile':
      return (
        <NewFileDialog
          dir={d.dir}
          what={d.what}
          exists={exists}
          onClose={close}
          onCreate={(path) => {
            close();
            if (d.what === 'File') createFile(model, path, '', null);
            else {
              props.virtualDirs.add(path);
              model.expanded.add(d.dir);
              model.selectedNode = path;
              model.changed();
            }
          }}
        />
      );
    case 'addToGit':
      return (
        <AddToGitDialog
          path={d.path}
          onAnswer={(add) => {
            close();
            const text = getState().lab.repos[repo]?.local?.files[d.path] ?? '';
            createFile(model, d.path, text, add);
          }}
        />
      );
    case 'move':
      return (
        <MoveDialog
          path={d.path}
          targetDir={d.targetDir}
          onClose={close}
          onMove={(to) => {
            close();
            moveFile(model, d.path, to);
          }}
        />
      );
    case 'rename':
      return (
        <RenameDialog
          path={d.path}
          exists={exists}
          onClose={close}
          onRename={(to) => {
            close();
            const oldCls = d.path.split('/').pop()!.replace(/\.java$/, '');
            if (moveFile(model, d.path, to) && to.endsWith('.java') && d.path.endsWith('.java')) {
              const newCls = to.split('/').pop()!.replace(/\.java$/, '');
              const text = getState().lab.repos[repo]?.local?.files[to];
              if (text && oldCls !== newCls) {
                const next = text.replace(new RegExp(`\\b(class|interface|enum|record)\\s+${oldCls}\\b`), `$1 ${newCls}`);
                writeProjectFile(repo, model.cwm, to, next);
              }
            }
          }}
        />
      );
    case 'delete':
      return (
        <ConfirmDialog
          title="Delete"
          okLabel="OK"
          message={<>Delete file &quot;{d.path.split('/').pop()}&quot;?</>}
          onClose={close}
          onOk={() => {
            close();
            deleteFile(model, d.path);
          }}
        />
      );
    case 'rollback':
      return (
        <ConfirmDialog
          title="Rollback Changes"
          okLabel="Rollback"
          message={
            <>
              <div>Rollback changes in {d.paths.length} file{d.paths.length === 1 ? '' : 's'}?</div>
              {d.paths.map((p) => (
                <div key={p} className="ij-dim" style={{ marginTop: 4 }}>
                  {p}
                </div>
              ))}
            </>
          }
          onClose={close}
          onOk={() => {
            close();
            gitRollback(model, d.paths);
          }}
        />
      );
    case 'stopRerun':
      return (
        <ConfirmDialog
          title={`Process '${d.config.name}' Is Running`}
          okLabel="Stop and Rerun"
          message={<>Do you want to stop the process and rerun &apos;{d.config.name}&apos;?</>}
          onClose={close}
          onOk={() => {
            close();
            startRun(model, d.config, { force: true, debug: d.debug });
          }}
        />
      );
    case 'editConfigs':
      return <EditConfigsDialog configs={props.configs} selected={model.runConfig} root={props.root} onClose={close} />;
    case 'settings':
      return <SettingsDialog theme={props.theme} fontSize={props.fontSize} onApply={props.onSettings} onClose={close} />;
    case 'about':
      return <AboutDialog onClose={close} />;
    case 'codeWithMe': {
      const sessions = codeWithMeSessions(getState().lab).map((s) => ({ ...s, personName: personName(s.person) || s.person }));
      return <CodeWithMeDialog sessions={sessions} onClose={close} onJoin={(person, r) => (close(), props.onOpenProject(r, { cwm: person }))} />;
    }
    case 'push':
      return gitRepo ? (
        <PushDialog
          gitRepo={gitRepo}
          onClose={close}
          onPush={() => {
            close();
            gitPush(model);
          }}
        />
      ) : null;
    case 'pull':
      return <PullDialog branch={gitRepo?.local?.branch ?? 'main'} mode="pull" onClose={close} onOk={() => (close(), gitPull(model))} />;
    case 'newBranch': {
      const cur = gitRepo?.local?.branch ?? 'main';
      return (
        <NewBranchDialog
          from={d.from ?? cur}
          exists={(n) => !!gitRepo && (knownLocalBranches(repo, cur, gitRepo.defaultBranch).includes(n) || !!gitRepo.branches[n])}
          onClose={close}
          onCreate={(name, checkout) => {
            close();
            if (d.from && d.from !== cur) gitCheckout(model, d.from.replace(/^origin\//, ''), false);
            const ok = gitCheckout(model, name, true);
            if (ok && !checkout) gitCheckout(model, cur, false);
          }}
        />
      );
    }
    case 'branches':
      return gitRepo ? (
        <BranchesPopup
          gitRepo={gitRepo}
          anchor={props.branchAnchor}
          onClose={close}
          onCheckout={(b) => {
            close();
            gitCheckout(model, b, false);
          }}
          onNewBranch={(from) => model.openDialog({ kind: 'newBranch', from })}
          onDiff={(b) => {
            close();
            const path = model.active && !model.diffs.has(model.active) ? model.active : null;
            if (!path) {
              model.balloon({ kind: 'info', title: 'Open a file to compare it with another branch' }, 4000);
              return;
            }
            const other = treeAt(gitRepo, gitRepo.branches[b])[path] ?? '';
            model.openDiff({ id: `diff:${b}:${path}`, title: `${path.split('/').pop()} (${b} vs local)`, leftTitle: `${b} (Read-only)`, rightTitle: 'Your version', left: other, right: model.buffers.get(path)?.text ?? files[path] ?? '', path });
          }}
        />
      ) : null;
    default:
      return null;
  }
}
