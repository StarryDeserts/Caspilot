import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'ghost' | 'danger';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
  children?: ReactNode;
}

export function Button({
  variant = 'primary',
  loading = false,
  disabled,
  className,
  children,
  ...rest
}: ButtonProps) {
  const cls = ['btn', `btn-${variant}`, loading ? 'is-loading' : '', className]
    .filter(Boolean)
    .join(' ');
  return (
    <button className={cls} disabled={disabled || loading} {...rest}>
      {loading && <span className="spinner" aria-hidden="true" />}
      {children}
    </button>
  );
}
