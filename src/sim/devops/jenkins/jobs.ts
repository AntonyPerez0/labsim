/** Jenkins job configuration (Sim §3.18.1): Configure → Save, Move (CloudBees Folders), New Item, Delete. */
import type { TxContext } from '@/core/store';
import type { JenkinsJob, LabState } from '../../types';
import type { JenkinsJobPatch, Result } from '../../api';
import { JENKINS_VIEWS } from '../../seed/jenkins';
import { clone } from '../util';

const viewsFor = (lab: LabState, id: string): string[] =>
  Object.values(lab.jenkins.views ?? JENKINS_VIEWS)
    .filter((v) => new RegExp(v.include).test(id))
    .map((v) => v.name);

export function saveJob(lab: LabState, ctx: TxContext, jobId: string, patch: JenkinsJobPatch, actor: string): Result {
  const job = lab.jenkins.jobs[jobId];
  if (!job || !job.exists) return { ok: false, error: `No such job: ${jobId}` };
  const fields: string[] = [];
  if (patch.script !== undefined && patch.script !== job.script) {
    job.script = patch.script;
    fields.push('script');
  }
  if (patch.savedParams !== undefined) {
    const next = { ...job.savedParams };
    for (const [k, v] of Object.entries(patch.savedParams)) if (job.params.some((p) => p.name === k)) next[k] = v;
    if (JSON.stringify(next) !== JSON.stringify(job.savedParams)) {
      job.savedParams = next;
      fields.push('params');
    }
  }
  if (patch.params !== undefined) {
    job.params = clone(patch.params);
    if (!fields.includes('params')) fields.push('params');
  }
  if (patch.description !== undefined && patch.description !== job.description) {
    job.description = patch.description;
    fields.push('description');
  }
  if (patch.disabled !== undefined && patch.disabled !== job.disabled) {
    job.disabled = patch.disabled;
    fields.push('disabled');
  }
  ctx.emit('jenkins.jobSaved', { jobId, fields, actor });
  return { ok: true, value: undefined };
}

export function moveJob(lab: LabState, ctx: TxContext, jobId: string, toFolder: string, actor: string): Result<{ jobId: string }> {
  const job = lab.jenkins.jobs[jobId];
  if (!job || !job.exists) return { ok: false, error: `No such job: ${jobId}` };
  if (toFolder !== 'Java' && toFolder !== 'iOS') return { ok: false, error: `No such folder: ${toFolder}` };
  if (job.folder === toFolder) return { ok: true, value: { jobId } };
  const newId = `${toFolder}/${job.name}`;
  if (lab.jenkins.jobs[newId]?.exists) return { ok: false, error: `A job already exists with the name ‘${job.name}’` };
  const moved: JenkinsJob = { ...job, id: newId, folder: toFolder, views: viewsFor(lab, newId) };
  lab.jenkins.jobs[newId] = moved;
  delete lab.jenkins.jobs[jobId];
  lab.jenkins.nextBuildNumber[newId] = lab.jenkins.nextBuildNumber[jobId] ?? 1;
  delete lab.jenkins.nextBuildNumber[jobId];
  for (const id of moved.buildIds) {
    const b = lab.jenkins.builds[id];
    if (b) b.jobId = newId;
  }
  lab.jenkins.queue = [...lab.jenkins.queue];
  ctx.emit('jenkins.jobMoved', { fromJobId: jobId, toJobId: newId, actor });
  return { ok: true, value: { jobId: newId } };
}

export function createJob(lab: LabState, ctx: TxContext, spec: { folder: string; name: string; copyFrom?: string }, actor: string): Result<{ jobId: string }> {
  if (spec.folder !== 'Java' && spec.folder !== 'iOS') return { ok: false, error: `No such folder: ${spec.folder}` };
  if (!/^[A-Za-z0-9._-]+$/.test(spec.name)) return { ok: false, error: `‘${spec.name}’ is an unsafe character` };
  const id = `${spec.folder}/${spec.name}`;
  if (lab.jenkins.jobs[id]?.exists) return { ok: false, error: `A job already exists with the name ‘${spec.name}’` };
  const src = spec.copyFrom ? lab.jenkins.jobs[spec.copyFrom] : null;
  if (spec.copyFrom && !src) return { ok: false, error: `No such job: ${spec.copyFrom}` };
  const job: JenkinsJob = src
    ? { ...clone(src), id, folder: spec.folder, name: spec.name, buildIds: [], views: viewsFor(lab, id), exists: true, nextScheduledMs: src.nextScheduledMs }
    : {
        id,
        folder: spec.folder,
        name: spec.name,
        description: '',
        runner: 'pigeon',
        platform: 'android',
        params: [],
        capabilityLookup: 'NON_DYNAMIC',
        requiredCapabilities: [],
        testRef: null,
        schedule: null,
        scheduleEveryMs: null,
        nextScheduledMs: null,
        buildIds: [],
        disabled: false,
        views: viewsFor(lab, id),
        script: `// ${id} — Jenkinsfile\npipeline {\n  agent { label 'lab-executor' }\n  stages {\n  }\n}\n`,
        savedParams: {},
        exists: true,
        merchantPolicy: 'none',
      };
  lab.jenkins.jobs[id] = job;
  lab.jenkins.nextBuildNumber[id] = 1;
  ctx.emit('jenkins.jobCreated', { jobId: id, actor });
  return { ok: true, value: { jobId: id } };
}

export function deleteJob(lab: LabState, ctx: TxContext, jobId: string, actor: string): Result {
  const job = lab.jenkins.jobs[jobId];
  if (!job || !job.exists) return { ok: false, error: `No such job: ${jobId}` };
  job.exists = false;
  job.disabled = true;
  ctx.emit('jenkins.jobDeleted', { jobId, actor });
  return { ok: true, value: undefined };
}
