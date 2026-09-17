import { HostError } from './errors.js';
const unavailable = () => { throw new HostError('HARNESS_ADAPTER_UNAVAILABLE', 'Unsupported execution adapter', 409); };
export class SdhConnectionStore { async get() { return { baseUrl: '', configured: false }; } async set() { return unavailable(); } }
export class RemoteSdhClient { constructor() { return unavailable(); } }
export const remoteSdhCapabilities = () => ({ streaming: false, resumeSession: false, cancellation: false, workspace: false, tools: false });
