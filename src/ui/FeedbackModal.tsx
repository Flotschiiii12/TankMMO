import { WindowFrame } from './wm/WindowFrame.tsx';
import React, { useState } from 'react';
import { tr } from '../i18n.ts';
import { PROTOCOL_VERSION } from '../../shared/protocol.ts';

interface Props {
  open: boolean;
  onClose: () => void;
  /** null when offline: the form then explains that feedback needs a connection */
  send: ((req: { kind: string; text: string; version: string }) => Promise<{ ok: boolean; error?: string }>) | null;
}

const KINDS = [['bug', 'Bug'], ['idea', 'Idea'], ['other', 'Other']] as const;
const ERRORS: Record<string, string> = { too_short: 'Please write a little more.', rate_limited: 'Too many reports in the last hour, thank you! Try again later.' };

/** Beta feedback / bug report. The server adds map, level and the last error codes itself; nothing else is sent. */
export const FeedbackModal: React.FC<Props> = ({ open, onClose, send }) => {
  const [kind, setKind] = useState('bug');
  const [text, setText] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | string>('idle');
  if (!open) return null;
  const submit = async () => {
    if (!send) return;
    setState('sending');
    const r = await send({ kind, text, version: PROTOCOL_VERSION });
    if (r.ok) { setState('sent'); setText(''); } else setState(`error:${r.error ?? 'failed'}`);
  };
  return (
    <WindowFrame id="feedback" width="min(480px, 94vw)" height="auto">
        {!send ? <p className="text-sm text-slate-400">{tr('Feedback needs an online connection.')}</p> : state === 'sent' ? <p className="text-sm text-emerald-300">{tr('Thank you! Your report was sent.')}</p> : (
          <>
            <div className="flex gap-2 mb-2">
              {KINDS.map(([k, label]) => (
                <button key={k} onClick={() => setKind(k)} className={`min-h-[44px] px-3 rounded-lg text-sm border ${kind === k ? 'bg-orange-500 text-white border-orange-400' : 'bg-slate-800 border-slate-700'}`}>{tr(label)}</button>
              ))}
            </div>
            <textarea value={text} maxLength={1000} onChange={(e) => setText(e.target.value)} rows={5} placeholder={tr('What happened? What did you expect?')} className="w-full rounded-lg bg-slate-800 border border-slate-700 p-2 text-base" />
            <p className="text-xs text-slate-400 mt-1">{tr('Sent along: the map, your level, the game version and the last error codes. No chat, no personal data.')}</p>
            {state.startsWith('error:') && <p className="text-sm text-red-300 mt-1">{tr(ERRORS[state.slice(6)] ?? 'Sending failed, please try again.')}</p>}
          </>
        )}
        <div className="mt-3 flex justify-end gap-2">
          {send && state !== 'sent' && <button disabled={state === 'sending' || text.trim().length < 3} onClick={submit} className="min-h-[44px] px-4 rounded-lg bg-orange-500 disabled:opacity-40 text-white text-sm font-medium">{tr('Send')}</button>}
          <button onClick={() => { setState('idle'); onClose(); }} className="min-h-[44px] px-4 rounded-lg bg-slate-800 text-white text-sm">{tr('Close')}</button>
        </div>
    </WindowFrame>
  );
};
