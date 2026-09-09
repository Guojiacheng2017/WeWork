import { cloneElement, useId, type ComponentPropsWithRef, type ReactElement, type ReactNode } from 'react';

export function Input(props: ComponentPropsWithRef<'input'>) {
  return <input {...props} data-ui="field" />;
}
export function Textarea(props: ComponentPropsWithRef<'textarea'>) {
  return <textarea {...props} data-ui="field" />;
}
export { FormSelect as NativeSelect } from './FormSelect';

type FieldControl = { id?: string; required?: boolean; 'aria-describedby'?: string; 'aria-invalid'?: boolean | 'true' | 'false' | 'grammar' | 'spelling' };
/** Associates visible labels, hints and errors with exactly one form control. */
export function Field({ label, hint, error, children, className = '' }: {
  label: ReactNode; hint?: ReactNode; error?: ReactNode; children: ReactElement<FieldControl>; className?: string;
}) {
  const generated = useId();
  const id = children.props.id ?? generated;
  const description = [children.props['aria-describedby'], hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined;
  return <div className={`ww-field ${className}`}>
    <label htmlFor={id}>{label}{children.props.required && <span aria-hidden="true"> *</span>}</label>
    {cloneElement(children, { id, 'aria-describedby': description, 'aria-invalid': error ? true : children.props['aria-invalid'] })}
    {hint && <p id={`${id}-hint`} className="ww-field-hint">{hint}</p>}
    {error && <p id={`${id}-error`} className="ww-field-error" role="alert">{error}</p>}
  </div>;
}
