import { useId, type ReactNode } from 'react';
export interface TabItem { value: string; label: ReactNode; content: ReactNode; disabled?: boolean }
export function Tabs({ label, value, onChange, items }: {
  label: string; value: string; onChange: (value: string) => void; items: TabItem[];
}) {
  const id = useId();
  return <div className="ww-tabs">
    <div role="tablist" aria-label={label} className="ww-tab-list" onKeyDown={event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled)'));
      if (!buttons.length) return;
      event.preventDefault();
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next].focus(); buttons[next].click();
    }}>
      {items.map((item, index) => <button type="button" role="tab" key={item.value} id={`${id}-tab-${index}`}
        aria-selected={item.value === value} aria-controls={`${id}-panel-${index}`} disabled={item.disabled}
        tabIndex={item.value === value ? 0 : -1} onClick={() => onChange(item.value)}>{item.label}</button>)}
    </div>
    {items.map((item, index) => <div key={item.value} id={`${id}-panel-${index}`} role="tabpanel"
      aria-labelledby={`${id}-tab-${index}`} hidden={item.value !== value} tabIndex={0}>{item.content}</div>)}
  </div>;
}

/** Switches existing application views; uses navigation semantics, not fake tabs. */
export function ViewSwitcher<T extends string>({ label, value, onChange, items }: {
  label: string; value: T; onChange: (value: T) => void;
  items: { value: T; label: ReactNode; icon?: ReactNode }[];
}) {
  return <nav aria-label={label} className="ww-view-switcher">
    {items.map(item => <button type="button" key={item.value} aria-current={item.value === value ? 'page' : undefined}
      onClick={() => onChange(item.value)}>{item.icon}{item.label}</button>)}
  </nav>;
}
