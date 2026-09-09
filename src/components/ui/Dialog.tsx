import { useId, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import { IconButton } from './Button';

export function Dialog({ open, onClose, title, description, children, busy = false, size = 'sm', className = '', icon }: {
  open: boolean; onClose: () => void; title: string; description?: ReactNode; children: ReactNode;
  busy?: boolean; size?: 'sm' | 'lg'; className?: string; icon?: ReactNode;
}) {
  const id = useId();
  const ref = useDialogFocus(open, () => { if (!busy) onClose(); });
  if (!open) return null;
  return createPortal(<div className="ww-dialog-backdrop ww-dialog-overlay" onMouseDown={event => {
    if (event.target === event.currentTarget && !busy) onClose();
  }}>
    <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`}
      aria-describedby={description ? `${id}-description` : undefined} tabIndex={-1}
      data-size={size} className={`ww-dialog ${className}`}>
      <header className="ww-dialog-header">
        <div className="ww-dialog-heading">{icon}<div><h3 id={`${id}-title`}>{title}</h3>{description && <p id={`${id}-description`}>{description}</p>}</div></div>
        <IconButton label={`关闭${title}`} disabled={busy} onClick={onClose}><X aria-hidden="true" size={16} /></IconButton>
      </header>
      {children}
    </div>
  </div>, document.body);
}
export function DialogFooter({ children }: { children: ReactNode }) {
  return <footer className="ww-dialog-footer">{children}</footer>;
}
