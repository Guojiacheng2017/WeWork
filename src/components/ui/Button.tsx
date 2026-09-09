import { LoaderCircle } from 'lucide-react';
import type { ComponentPropsWithRef, ReactNode } from 'react';

export interface ButtonProps extends ComponentPropsWithRef<'button'> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'icon';
  loading?: boolean;
}

/** Native button semantics, with shared size, intent and pending state. */
export function Button({ variant, size, loading = false, disabled, className = '', children, ...props }: ButtonProps) {
  return <button {...props} data-ui="button" data-variant={variant} data-size={size}
    disabled={disabled || loading} aria-busy={loading || props['aria-busy']}
    className={`ww-button ${className}`}>
    {loading && <LoaderCircle aria-hidden="true" className="ww-spinner" />}{children}
  </button>;
}

export function IconButton({ label, ...props }: Omit<ButtonProps, 'children'> & { label: string; children: ReactNode }) {
  return <Button type="button" variant="ghost" size="icon" {...props} aria-label={label} />;
}
