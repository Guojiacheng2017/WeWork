import { executePiRun } from './pi-runtime.js';
import { HostError } from './host/errors.js';

export async function executeHarness(spec, options) {
  if (spec.runtimeProfile?.adapter === 'pi') return executePiRun(spec, options);
  // Installation detection alone does not authorize an unverified protocol.
  throw new HostError('HARNESS_ADAPTER_UNAVAILABLE', 'This Harness has no verified WeWork execution adapter in this build.', 409);
}
