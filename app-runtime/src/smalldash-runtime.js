import { HostError } from './host/errors.js';
const unavailable = () => { throw new HostError('HARNESS_ADAPTER_UNAVAILABLE', 'Unsupported execution adapter', 409); };
export const executeSmalldashRun = unavailable;
export const invokeSmalldashControl = unavailable;
export const buildSmalldashPersona = unavailable;
