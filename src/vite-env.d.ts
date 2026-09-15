/// <reference types="vite/client" />

import type { CollaborationHarness } from './runtime/collaborationHarness';
import type { LoopbackWeWorkHost, WeWorkHost, RuntimeCoordinator } from './runtime/weworkHost';

declare global {
  interface Window {
    weworkHost?: (WeWorkHost | LoopbackWeWorkHost) & { onCloseLayer?: (listener: () => void) => () => void };
    runtimeCoordinator?: RuntimeCoordinator;
    collaborationHarness?: CollaborationHarness;
  }
}
