import React from 'react';
import { ART, useArt } from './art.tsx';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'icon';
export interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant?: ButtonVariant; loading?: boolean; pressed?: boolean; large?: boolean; children?: React.ReactNode;
  /** icon buttons need a text label for screen readers and tooltips */
  label?: string;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ variant = 'secondary', loading, pressed, large, disabled, className = '', children, label, onClick, style, ...rest }, ref) => {
  const primary = variant === 'primary';
  const idle = useArt(primary ? ART.buttonPrimary : undefined); const hover = useArt(primary ? ART.buttonHover : undefined); const down = useArt(primary ? ART.buttonDown : undefined); const off = useArt(primary ? ART.buttonOff : undefined);
  const artStyle = idle ? ({ '--art-idle': `url(${ART.buttonPrimary})`, ...(hover ? { '--art-hover': `url(${ART.buttonHover})` } : {}), ...(down ? { '--art-down': `url(${ART.buttonDown})` } : {}), ...(off ? { '--art-off': `url(${ART.buttonOff})` } : {}), ...style } as React.CSSProperties) : style;
  return (
  <button ref={ref} type="button" {...rest} data-art={idle ? 'yes' : undefined} style={artStyle} aria-label={label ?? rest['aria-label']} title={label ?? rest.title} aria-pressed={pressed} aria-busy={loading || undefined} disabled={disabled || loading}
    className={`k-btn ${variant === 'secondary' ? '' : `k-btn--${variant}`} ${large ? 'k-btn--lg' : ''} ${className}`} onClick={onClick}>
    {loading && <span className="k-btn__spin" aria-hidden />}
    {children}
  </button>
  );
});
Button.displayName = 'Button';
