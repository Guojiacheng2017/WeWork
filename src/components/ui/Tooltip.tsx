import { cloneElement, useId, useState, type ReactElement } from 'react';
/** The child must be a focusable control; tooltip is supplemental, never its label. */
export function Tooltip({ content, children }: { content: string; children: ReactElement<{ 'aria-describedby'?: string }> }) {
  const id = useId();
  const [dismissed, setDismissed] = useState(false);
  return <span className="ww-tooltip-anchor" data-dismissed={dismissed || undefined}
    onPointerEnter={() => setDismissed(false)} onFocus={() => setDismissed(false)}
    onKeyDown={event => { if (event.key === 'Escape') { setDismissed(true); event.stopPropagation(); } }}>
    {cloneElement(children, { 'aria-describedby': [children.props['aria-describedby'], id].filter(Boolean).join(' ') })}
    <span id={id} role="tooltip" className="ww-tooltip">{content}</span>
  </span>;
}
