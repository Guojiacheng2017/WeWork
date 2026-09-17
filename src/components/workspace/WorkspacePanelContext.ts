import { createContext } from 'react';

// A canvas can place its existing inspector in the shared workspace without
// transferring ownership of its editing state or persistence logic.
export const WorkspacePanelContext = createContext<{
  target: HTMLDivElement | null;
  openInspector: () => void;
  closeInspector: () => void;
} | null>(null);
