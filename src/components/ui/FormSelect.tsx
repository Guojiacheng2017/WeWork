import { Children, Fragment, isValidElement, useCallback, useEffect, useId, useRef, useState, type ComponentPropsWithRef, type ReactNode } from 'react';
import { Select, type SelectOption } from './Select';

type Props = ComponentPropsWithRef<'select'>;
function textContent(node: ReactNode): string {
  return Children.toArray(node).map(child => isValidElement<{ children?: ReactNode }>(child)
    ? textContent(child.props.children) : String(child)).join('');
}
export function selectOptions(children: ReactNode, disabled = false): SelectOption[] {
  return Children.toArray(children).flatMap(child => {
    if (!isValidElement<{ value?: string | number; label?: string; disabled?: boolean; children?: ReactNode }>(child)) return [];
    if (child.type === Fragment || child.type === 'optgroup') return selectOptions(child.props.children, disabled || Boolean(child.props.disabled));
    if (child.type !== 'option') return [];
    const text = textContent(child.props.children);
    return [{ value: String(child.props.value ?? text), label: child.props.label ?? text, disabled: disabled || Boolean(child.props.disabled) }];
  });
}

/** Retain the original form-facing API while rendering the common UIKit popup. */
export function FormSelect(props: Props) {
  // Multi-select/listbox mode has different interaction semantics; no existing app form uses it.
  if (props.multiple || (props.size ?? 0) > 1) return <select {...props} data-ui="field" />;
  return <SingleFormSelect {...props} />;
}

function SingleFormSelect({ children, className = '', style, ref, onChange, onInvalid, ...props }: Props) {
  const native = useRef<HTMLSelectElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const generated = useId();
  const id = props.id ?? generated;
  const [uncontrolled, setUncontrolled] = useState(String(props.defaultValue ?? ''));
  const [validation, setValidation] = useState('');
  const options = selectOptions(children);
  const requested = String(props.value ?? uncontrolled);
  const value = options.some(option => option.value === requested) ? requested : options.find(option => !option.disabled)?.value ?? '';
  const nativeRef = useCallback((node: HTMLSelectElement | null) => {
    native.current = node;
    if (typeof ref === 'function') return ref(node);
    if (ref) ref.current = node;
  }, [ref]);
  useEffect(() => {
    const control = native.current;
    const form = control?.form;
    const reset = (event: Event) => queueMicrotask(() => {
      if (!event.defaultPrevented && control?.isConnected) { setUncontrolled(control.value); setValidation(''); }
    });
    form?.addEventListener('reset', reset);
    return () => form?.removeEventListener('reset', reset);
  }, [props.form]);
  useEffect(() => { setValidation(''); }, [props.value]);
  return <>
    <select {...props} id={`${id}-native`} autoFocus={false} aria-hidden="true" tabIndex={-1} className="ww-select-native" ref={nativeRef}
      onFocus={event => { trigger.current?.focus(); props.onFocus?.(event); }}
      onChange={event => { setUncontrolled(event.target.value); setValidation(''); onChange?.(event); }}
      onInvalid={event => { event.preventDefault(); setValidation(event.currentTarget.validationMessage); trigger.current?.focus(); onInvalid?.(event); }}>
      {children}
    </select>
    <Select ref={trigger} id={id} appearance="field" label={props['aria-label']} aria-labelledby={props['aria-labelledby']}
      aria-describedby={[props['aria-describedby'], validation && `${id}-error`].filter(Boolean).join(' ') || undefined}
      aria-invalid={validation ? true : props['aria-invalid']} aria-required={props.required} title={props.title}
      autoFocus={props.autoFocus} disabled={props.disabled} tabIndex={props.tabIndex} className={className} style={style}
      value={value} options={options} onChange={next => {
        const control = native.current;
        if (!control || control.matches(':disabled')) return;
        control.value = next;
        control.dispatchEvent(new Event('change', { bubbles: true }));
      }} />
    {validation && <span id={`${id}-error`} className="ww-field-error" role="alert">{validation}</span>}
  </>;
}
