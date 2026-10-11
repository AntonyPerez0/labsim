/** GP §2.3.5 pipeline id → Jenkins job path (Cur §0.6 jobs; PL7/PL8 are [illus.] additions). */
import type { PipelineId } from '@/core/state';

export const PIPELINE_JOBS: Readonly<Record<PipelineId, string>> = {
  PL1: 'Java/uia-relay-regression-flux',
  PL2: 'Java/uia-relay-tethered-tax',
  PL3: 'Java/parrot-android-sale-swipe',
  PL4: 'Java/uia-relay-regression-micro',
  PL5: 'Java/contact-canada-pin-sale',
  PL6: 'Java/go-sdk-sale-smoke',
  PL7: 'Java/uia-relay-duet-cfd',
  PL8: 'Java/paycrest-standalone-matrix',
};

export function pipelineForJob(jobId: string): PipelineId | null {
  for (const [pl, job] of Object.entries(PIPELINE_JOBS)) if (job === jobId) return pl as PipelineId;
  return null;
}
