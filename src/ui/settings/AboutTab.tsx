import React from 'react';
import { tr } from '../../i18n.ts';
import { serverBase } from '../../net/connect.ts';
import { PROTOCOL_VERSION } from '../../../shared/protocol.ts';
import { Row } from './parts.tsx';

const LEGAL: Array<[string, string]> = [['terms', 'Terms of use'], ['privacy', 'Privacy policy'], ['youth', 'Youth protection'], ['imprint', 'Imprint']];

export const AboutTab: React.FC<{ onFeedback?: () => void }> = ({ onFeedback }) => (
  <div className="st-body st-about" data-testid="about-tab">
    <Row title="Treadfront" hint={tr('An online tank MMO. Your progress lives on the server.')}>
      <span className="tabular-nums" data-testid="app-version">v{typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0'} · {typeof __BUILD_DATE__ === 'string' ? __BUILD_DATE__ : ''}</span>
    </Row>
    <Row title={tr('Protocol')} hint={tr('Client and server must match to play together.')}><span className="tabular-nums">{PROTOCOL_VERSION}</span></Row>
    <Row title={tr('Legal')} hint={tr('Opens as plain text in a new tab.')}>
      {LEGAL.map(([id, label]) => <a key={id} href={`${serverBase()}/legal/${id}`} target="_blank" rel="noopener noreferrer">{tr(label)}</a>)}
    </Row>
    {onFeedback && <Row title={tr('Send feedback')} hint={tr('Tell us about bugs and ideas.')}><button type="button" className="k-btn" onClick={onFeedback}>{tr('Send feedback')}</button></Row>}
  </div>
);
