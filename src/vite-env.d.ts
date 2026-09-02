/// <reference types="vite/client" />

import type { CollaborationHarness } from './runtime/collaborationHarness';
import type { LoopbackWeWorkHost, WeWorkHost, RuntimeCoordinator } from './runtime/weworkHost';

declare global {
  interface Window {
    weworkHost?: WeWorkHost | LoopbackWeWorkHost;
    runtimeCoordinator?: RuntimeCoordinator;
    collaborationHarness?: CollaborationHarness;
  }
}
