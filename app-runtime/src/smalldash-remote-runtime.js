import { HostError } from './host/errors.js';
const unavailable = () => { throw new HostError('HARNESS_ADAPTER_UNAVAILABLE', 'Unsupported execution adapter', 409); };
export const executeRemoteSmalldashRun = unavailable;
export const buildRemoteSdhPersona = unavailable;
export const buildRemoteSdhBusinessSkills = unavailable;
