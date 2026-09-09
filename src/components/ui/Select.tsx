import { useCallback, useEffect, useId, useRef, useState, type ComponentPropsWithRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';

export interface SelectOption { value: string; label: string; icon?: ReactNode; disabled?: boolean }
export interface SelectProps extends Omit<ComponentPropsWithRef<'button'>, 'value' | 'onChange' | 'children'> {
  label?: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  appearance?: 'inline' | 'field';
}

/** One popup implementation for both project cells and ordinary form fields. */
export function Select({ label, value, options, onChange, disabled = false, appearance = 'inline', className = '', ref, ...props }: SelectProps) {
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number; width: number; maxHeight: number }>();
  const id = useId();
  const selected = options.find(option => option.value === value);
  const available = options.some(option => !option.disabled);
  const triggerRef = useCallback((node: HTMLButtonElement | null) => {
    trigger.current = node;
    if (typeof ref === 'function') return ref(node);
    if (ref) ref.current = node;
  }, [ref]);
  const close = (restore = false) => { setPosition(undefined); if (restore) trigger.current?.focus(); };
  const open = () => {
    if (disabled || !available || !trigger.current || trigger.current.matches(':disabled')) return;
    const rect = trigger.current.getBoundingClientRect();
    const width = Math.min(Math.max(rect.width, 220), window.innerWidth - 16);
    const below = window.innerHeight - rect.bottom - 12;
    const above = rect.top - 12;
    const maxHeight = Math.max(40, Math.min(280, Math.max(below, above)));
    const height = Math.min(options.length * 36 + 12, maxHeight);
    setPosition({ left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)), top: below >= height ? rect.bottom + 6 : Math.max(8, rect.top - height - 6), width, maxHeight });
  };
  useEffect(() => {
    if (!position) return;
    const buttons = Array.from(list.current?.querySelectorAll<HTMLButtonElement>('[role="option"]:not(:disabled)') ?? []);
    (buttons.find(button => button.getAttribute('aria-selected') === 'true') ?? buttons[0])?.focus({ preventScroll: true });
    const outside = (event: Event) => {
      if (!trigger.current?.contains(event.target as Node) && !list.current?.contains(event.target as Node)) setPosition(undefined);
    };
    const resize = () => setPosition(undefined);
    const scroll = (event: Event) => { if (!list.current?.contains(event.target as Node)) setPosition(undefined); };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    document.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', resize);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', outside);
      document.removeEventListener('scroll', scroll, true);
      window.removeEventListener('resize', resize);
    };
  }, [position]);
  useEffect(() => { if (disabled || !available) setPosition(undefined); }, [disabled, available]);
  return <>
    <button {...props} ref={triggerRef} type="button" data-ui="button" data-appearance={appearance} disabled={disabled || !available}
      aria-label={label ?? props['aria-label']} aria-haspopup="listbox" aria-expanded={Boolean(position)} aria-controls={position ? id : undefined}
      className={`ww-select-trigger ${className}`} onClick={event => { props.onClick?.(event); if (!event.defaultPrevented) { if (position) close(); else open(); } }}
      onKeyDown={event => {
        props.onKeyDown?.(event);
        if (!event.defaultPrevented && ['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); open(); }
      }}>
      {selected?.icon && <span className="ww-select-icon">{selected.icon}</span>}<span className="ww-select-label">{selected?.label ?? '请选择'}</span><ChevronDown aria-hidden="true" size={14} />
    </button>
    {position && createPortal(<div ref={list} id={id} role="listbox" aria-label={label ?? props['aria-label'] ?? '选项'} style={position} className="ww-select-menu"
      onKeyDown={event => {
        const buttons = Array.from(list.current!.querySelectorAll<HTMLButtonElement>('[role="option"]:not(:disabled)'));
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); }
        else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) && buttons.length) {
          event.preventDefault();
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
          buttons[next]?.focus();
        } else if (event.key === 'Tab') { close(true); }
      }}>
      {options.map(option => <button key={option.value} type="button" role="option" tabIndex={-1} disabled={option.disabled} aria-selected={option.value === value}
        onClick={() => { close(true); onChange(option.value); }}>
        {option.icon && <span className="ww-select-icon">{option.icon}</span>}<span className="ww-select-label">{option.label}</span>{option.value === value && <Check aria-hidden="true" size={16} />}
      </button>)}
    </div>, document.body)}
  </>;
}
