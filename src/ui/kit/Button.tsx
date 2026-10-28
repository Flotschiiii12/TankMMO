import React from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'icon';
export interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant?: ButtonVariant; loading?: boolean; pressed?: boolean; large?: boolean; children?: React.ReactNode;
  /** icon buttons need a text label for screen readers and tooltips */
  label?: string;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ variant = 'secondary', loading, pressed, large, disabled, className = '', children, label, onClick, ...rest }, ref) => (
  <button ref={ref} type="button" {...rest} aria-label={label ?? rest['aria-label']} title={label ?? rest.title} aria-pressed={pressed} aria-busy={loading || undefined} disabled={disabled || loading}
    className={`k-btn ${variant === 'secondary' ? '' : `k-btn--${variant}`} ${large ? 'k-btn--lg' : ''} ${className}`} onClick={onClick}>
    {loading && <span className="k-btn__spin" aria-hidden />}
    {children}
  </button>
));
Button.displayName = 'Button';
