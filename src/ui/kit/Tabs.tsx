import React from 'react';

export interface TabItem { id: string; label: React.ReactNode; pip?: boolean | number; disabled?: boolean }

/** Roving-tabindex tab list: arrow keys move, Home/End jump. The panel itself is rendered by the caller. */
export const Tabs: React.FC<{ tabs: TabItem[]; value: string; onChange: (id: string) => void; className?: string; label?: string }> = ({ tabs, value, onChange, className = '', label }) => {
  const onKey = (e: React.KeyboardEvent) => {
    const enabled = tabs.filter((t) => !t.disabled); const i = enabled.findIndex((t) => t.id === value);
    let next = -1;
    if (e.key === 'ArrowRight') next = (i + 1) % enabled.length; else if (e.key === 'ArrowLeft') next = (i - 1 + enabled.length) % enabled.length;
    else if (e.key === 'Home') next = 0; else if (e.key === 'End') next = enabled.length - 1;
    if (next >= 0) { e.preventDefault(); onChange(enabled[next].id); (e.currentTarget.querySelectorAll('[role=tab]')[tabs.indexOf(enabled[next])] as HTMLElement | undefined)?.focus(); }
  };
  return (
    <div role="tablist" aria-label={label} className={`k-tabs ${className}`} onKeyDown={onKey}>
      {tabs.map((t) => (
        <button key={t.id} role="tab" type="button" aria-selected={t.id === value} tabIndex={t.id === value ? 0 : -1} disabled={t.disabled} className="k-tab" onClick={() => onChange(t.id)}>
          {t.label}
          {t.pip ? (typeof t.pip === 'number' ? <span className="k-counter">{t.pip > 99 ? '99+' : t.pip}</span> : <span className="k-pip" />) : null}
        </button>
      ))}
    </div>
  );
};

export const SegmentedControl: React.FC<{ options: Array<{ id: string; label: React.ReactNode }>; value: string; onChange: (id: string) => void; label?: string }> = ({ options, value, onChange, label }) => (
  <div role="radiogroup" aria-label={label} className="k-seg">
    {options.map((o) => <button key={o.id} role="radio" type="button" aria-checked={o.id === value} className="k-seg__opt" onClick={() => onChange(o.id)}>{o.label}</button>)}
  </div>
);
