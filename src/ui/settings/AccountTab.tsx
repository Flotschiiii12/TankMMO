import React, { useState } from 'react';
import { RefreshCcw } from 'lucide-react';
import { tr } from '../../i18n.ts';
import { clearCredential, deleteAccount, exportAccount, getCredential, requestRecoveryCode } from '../../net/connect.ts';
import { Button } from '../kit/Button.tsx';
import { Row } from './parts.tsx';

/** Recovery code, data export, delete account (typed confirmation), sign out. Reset progress stays for the offline sandbox. */
export const AccountTab: React.FC<{ playerName: string; online: boolean; onResetProgress: () => void; onClose: () => void }> = ({ playerName, online, onResetProgress, onClose }) => {
  const cred = getCredential();
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [confirm, setConfirm] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const download = async () => {
    if (!cred) return;
    setBusy('export'); setMsg('');
    const data = await exportAccount(cred);
    setBusy('');
    if (!data) { setMsg(tr('That did not work')); return; }
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'treadfront-data.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  return (
    <div className="st-body" data-testid="account-tab">
      <Row title={tr('Pilot name')} hint={online ? tr('Your guest account lives on this device. Save a recovery code to play on other devices.') : tr('Offline sandbox: progress is stored on this device only.')}><strong>{playerName}</strong></Row>
      {online && cred && (
        <>
          <Row title={tr('Recovery code')} hint={tr('Keep it private: anyone with the code can sign in as you.')}>
            {code ? <span className="st-code" data-testid="recovery-code">{code}</span> : <Button loading={busy === 'code'} onClick={async () => { setBusy('code'); setCode(await requestRecoveryCode(cred)); setBusy(''); }}>{tr('Show recovery code')}</Button>}
          </Row>
          <Row title={tr('Export my data')} hint={tr('Downloads everything stored about your account as a JSON file.')}>
            <Button loading={busy === 'export'} onClick={() => void download()}>{tr('Download')}</Button>
          </Row>
          <Row title={tr('Sign out on this device')} hint={tr('Without a recovery code you cannot get back into this account.')}>
            <Button onClick={() => { if (window.confirm(tr('Sign out? Make sure you saved your recovery code.'))) { clearCredential(); window.location.reload(); } }}>{tr('Sign out')}</Button>
          </Row>
          <Row danger title={tr('Delete account')} hint={tr('Permanently deletes your account and progress. This cannot be undone.')}>
            {deleting ? (
              <>
                <input className="tt-input" style={{ width: 150 }} value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={tr('Type DELETE')} aria-label={tr('Type DELETE')} autoComplete="off" />
                <Button variant="danger" disabled={confirm.trim().toUpperCase() !== 'DELETE'} loading={busy === 'delete'} onClick={async () => {
                  setBusy('delete');
                  if (await deleteAccount(cred)) { clearCredential(); window.location.reload(); } else { setBusy(''); setMsg(tr('That did not work')); }
                }}>{tr('Delete forever')}</Button>
                <Button variant="ghost" onClick={() => { setDeleting(false); setConfirm(''); }}>{tr('Cancel')}</Button>
              </>
            ) : <Button variant="danger" onClick={() => setDeleting(true)}>{tr('Delete account')}</Button>}
          </Row>
        </>
      )}
      {msg && <p className="tt-error" role="alert">{msg}</p>}
      {!online && (
        <Row danger title={tr('Reset Game Progress')} hint={tr('Clears saved vehicles, scrap, and returns profile to starter Patchwork Scout.')}>
          {confirmReset ? (
            <><Button variant="danger" onClick={() => { onResetProgress(); setConfirmReset(false); onClose(); }}>{tr('Confirm Reset')}</Button><Button variant="ghost" onClick={() => setConfirmReset(false)}>{tr('Cancel')}</Button></>
          ) : <Button variant="danger" onClick={() => setConfirmReset(true)}><RefreshCcw size={14} aria-hidden /> {tr('Reset Progress')}</Button>}
        </Row>
      )}
    </div>
  );
};
