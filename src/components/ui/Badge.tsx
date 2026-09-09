import type { ComponentPropsWithoutRef } from 'react';
export function Badge({ tone = 'neutral', className = '', ...props }: ComponentPropsWithoutRef<'span'> & {
  tone?: 'neutral' | 'info' | 'success' | 'warning' | 'danger';
}) {
  return <span {...props} className={`ww-badge ${className}`} data-tone={tone} />;
}
