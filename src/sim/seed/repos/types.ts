/** Seed format for the four GitHub repos (Sim §2.12). Built into `GitRepo` by `./index.ts`. */
import type { PrComment, RepoId } from '../../types';

export interface SeedCommit {
  /** Documented short sha (7 hex); padded deterministically to 40. */
  short: string;
  message: string;
  /** Team key ("jared") or bot ("claude-eval"). */
  author: string;
  /** "YYYY-MM-DD HH:MM" local game time. */
  at: string;
  /** path → new contents (null = deleted). */
  changes: Record<string, string | null>;
}

export interface SeedPr {
  number: number;
  title: string;
  author: string;
  body: string;
  sourceBranch: string;
  state: 'open' | 'merged' | 'closed';
  createdAt: string;
  mergedAt?: string;
  /** Branch commits on top of the base (oldest first). */
  branchCommits: SeedCommit[];
  /** Squash commit on main (merged PRs) — its short sha must appear in `commits`. */
  mergeShort?: string;
  /** For open PRs: main commit the branch starts from (default: head of main at seed time). */
  baseShort?: string;
  reviewers: string[];
  approvals: string[];
  comments: (Omit<PrComment, 'atMs'> & { at: string })[];
  verdict: 'NONE' | 'APPROVED' | 'CHANGES_REQUESTED';
  checks: 'pending' | 'success' | 'failure';
  draft?: boolean;
}

export interface RepoSeed {
  id: RepoId;
  remoteUrl: string;
  description: string;
  /** Commits on main, oldest first. */
  commits: SeedCommit[];
  prs: SeedPr[];
  /** Branch protection: direct pushes to main rejected (Sim §3.22.1). */
  protectedMain: boolean;
}
