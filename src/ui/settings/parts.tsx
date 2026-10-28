import React from 'react';
import { tr } from '../../i18n.ts';
import { soundEngine } from '../../audio/soundEngine.ts';

/** One settings row: title and hint on the left, the control on the right. Stacks on very narrow screens. */
export const Row: React.FC<{ title: string; hint?: string; children: React.ReactNode; danger?: boolean }> = ({ title, hint, children, danger }) => (
  <div className={`st-row ${danger ? 'st-row--danger' : ''}`}>
    <div className="st-row__text"><span className="st-row__title">{title}</span>{hint && <span className="st-row__hint">{hint}</span>}</div>
    <div className="st-row__ctl">{children}</div>
  </div>
);

export const Toggle: React.FC<{ on: boolean; onChange: (v: boolean) => void; label: string; setting: string; onText?: string; offText?: string }> = ({ on, onChange, label, setting, onText, offText }) => (
  <button type="button" role="switch" aria-checked={on} aria-label={label} data-setting={setting} className={`st-toggle ${on ? 'st-toggle--on' : ''}`}
    onClick={() => { soundEngine.playUIClick(); onChange(!on); }}>
    {on ? onText ?? tr('ON') : offText ?? tr('OFF')}
  </button>
);

export const Slider: React.FC<{ value: number; min: number; max: number; step: number; onChange: (v: number) => void; label: string; setting: string; format?: (v: number) => string }> = ({ value, min, max, step, onChange, label, setting, format }) => (
  <div className="st-slider">
    <input type="range" min={min} max={max} step={step} value={value} aria-label={label} data-setting={setting} onChange={(e) => onChange(Number(e.target.value))} />
    <span className="st-slider__val tabular-nums">{format ? format(value) : String(value)}</span>
  </div>
);
