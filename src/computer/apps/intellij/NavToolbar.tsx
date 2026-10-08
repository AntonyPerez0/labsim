/** Navigation bar + main toolbar (Apps §4.2): path, Build, run configuration combo, Run/Debug/Stop, Git actions. */
import {
  FileIcon,
  IcChevronDown,
  IcCodeWithMe,
  IcCommit,
  IcDebug,
  IcHammer,
  IcHistory,
  IcProjectTw,
  IcPush,
  IcRollback,
  IcRun,
  IcSearch,
  IcStop,
  IcUpdate,
} from "./icons";
import type { RunConfig } from "./projectModel";

export interface NavToolbarProps {
  repo: string;
  navSegs: string[];
  activeConfig: RunConfig | null;
  anyRunning: boolean;
  canGit: boolean;
  cmd(id: string): void;
  onRun(debug: boolean): void;
  onRunConfigMenu(e: React.MouseEvent): void;
  onNavSeg(path: string): void;
  onShowHistory(): void;
}

export function NavToolbar({
  repo,
  navSegs,
  activeConfig,
  anyRunning,
  canGit,
  cmd,
  onRun,
  onRunConfigMenu,
  onNavSeg,
  onShowHistory,
}: NavToolbarProps) {
  return (
    <div className="ij-navbar">
      <div className="ij-navpath">
        <span className="ij-navseg">
          <IcProjectTw size={14} /> {repo}
        </span>
        {navSegs.map((s, i) => (
          <span key={i} style={{ display: "contents" }}>
            <span className="ij-navsep">›</span>
            <span
              className="ij-navseg"
              role="button"
              tabIndex={-1}
              onClick={() => onNavSeg(navSegs.slice(0, i + 1).join("/"))}
            >
              {i === navSegs.length - 1 ? <FileIcon path={s} /> : null}
              {s}
            </span>
          </span>
        ))}
      </div>
      <button
        type="button"
        className="ij-tbtn"
        title="Build Project (Ctrl+F9)"
        aria-label="Build Project"
        onClick={() => cmd("build")}
      >
        <IcHammer />
      </button>
      <button
        type="button"
        className="ij-runcombo"
        data-hint="intellij.runConfig"
        title="Select Run/Debug Configuration"
        onClick={onRunConfigMenu}
      >
        {activeConfig ? (
          <FileIcon
            path={activeConfig.testPath}
            test={activeConfig.kind === "junit"}
          />
        ) : null}
        <span>{activeConfig?.name ?? "Add Configuration…"}</span>
        <IcChevronDown size={12} />
      </button>
      <button
        type="button"
        className="ij-tbtn"
        data-hint="intellij.runButton"
        title={activeConfig ? `Run '${activeConfig.name}' (Shift+F10)` : "Run"}
        aria-label="Run"
        disabled={!activeConfig}
        onClick={() => onRun(false)}
      >
        <IcRun />
      </button>
      <button
        type="button"
        className="ij-tbtn"
        title={
          activeConfig ? `Debug '${activeConfig.name}' (Shift+F9)` : "Debug"
        }
        aria-label="Debug"
        disabled={!activeConfig}
        onClick={() => onRun(true)}
      >
        <IcDebug />
      </button>
      <button
        type="button"
        className="ij-tbtn"
        data-hint="intellij.stopButton"
        title="Stop (Ctrl+F2)"
        aria-label="Stop"
        disabled={!anyRunning}
        onClick={() => cmd("stop")}
      >
        <IcStop active={anyRunning} />
      </button>
      <span className="ij-tsep" />
      <span className="ij-gitlabel">Git:</span>
      <button
        type="button"
        className="ij-tbtn"
        title="Update Project… (Alt+Shift+U)"
        aria-label="Update Project"
        disabled={!canGit}
        onClick={() => cmd("update")}
      >
        <IcUpdate />
      </button>
      <button
        type="button"
        className="ij-tbtn"
        data-hint="intellij.commitButton"
        title="Commit… (Ctrl+K)"
        aria-label="Commit"
        disabled={!canGit}
        onClick={() => cmd("commit")}
      >
        <IcCommit />
      </button>
      <button
        type="button"
        className="ij-tbtn"
        data-hint="intellij.pushButton"
        title="Push… (Ctrl+Shift+K)"
        aria-label="Push"
        disabled={!canGit}
        onClick={() => cmd("push")}
      >
        <IcPush />
      </button>
      <button
        type="button"
        className="ij-tbtn"
        title="Show History"
        aria-label="Show History"
        disabled={!canGit}
        onClick={onShowHistory}
      >
        <IcHistory />
      </button>
      <button
        type="button"
        className="ij-tbtn"
        title="Rollback…"
        aria-label="Rollback"
        disabled={!canGit}
        onClick={() => cmd("tw:commit")}
      >
        <IcRollback />
      </button>
      <span className="ij-tsep" />
      <button
        type="button"
        className="ij-tbtn"
        title="Code With Me"
        aria-label="Code With Me"
        onClick={() => cmd("codeWithMe")}
      >
        <IcCodeWithMe />
      </button>
      <button
        type="button"
        className="ij-tbtn"
        title="Search Everywhere (Double Shift)"
        aria-label="Search Everywhere"
        onClick={() => cmd("searchEverywhere")}
      >
        <IcSearch />
      </button>
    </div>
  );
}
