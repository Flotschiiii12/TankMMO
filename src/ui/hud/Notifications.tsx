import React, { useEffect, useSyncExternalStore } from 'react';
import { tr } from '../../i18n.ts';
import { controlStrip } from '../layoutStrip.ts';
import { WindowFrame } from '../wm/WindowFrame.tsx';
import { useShortScreen } from '../useShortScreen.ts';
import { EmptyState } from '../kit/States.tsx';
import { windows } from '../wm/windowStore.ts';
import { notifications, noticeText, type Notice } from './notify.ts';

export function useNotifications() { return useSyncExternalStore(notifications.subscribe, notifications.getSnapshot, notifications.getSnapshot); }

const GROUP_ICON: Record<Notice['group'], string> = { loot: '🎁', xp: '⭐', quest: '📜', system: 'ℹ' };
const GROUP_LABEL: Record<Notice['group'], string> = { loot: 'Loot', xp: 'Progress', quest: 'Quests', system: 'System' };

/** Grouped toasts above the chat strip (max 3, merged, auto expiring). */
export const NotificationHost: React.FC<{ leftHanded?: boolean; touchLayout: boolean; minimal?: boolean }> = ({ leftHanded, touchLayout, minimal }) => {
  const { active: all } = useNotifications(); const short = useShortScreen();
  const active = all.slice(short ? -1 : -3); // short screens have room for one line above the chat strip
  useEffect(() => { const id = setInterval(() => notifications.tick(), 1000); return () => clearInterval(id); }, []);
  if (!active.length) return null;
  const place: React.CSSProperties = touchLayout ? controlStrip(leftHanded, 'calc(max(0.75rem, var(--safe-bottom)) + 3.4rem)') : { left: 'max(0.75rem, var(--safe-left))', bottom: 'calc(max(0.75rem, var(--safe-bottom)) + 3.4rem)' };
  return (
    <div data-hud="notices" style={place} className="absolute z-20 flex flex-col items-start gap-1 pointer-events-none" role="log" aria-live="polite">
      {active.filter((n) => !minimal || n.kind !== 'info').map((n) => <div key={n.id} className="k-notice" data-group={n.group} data-kind={n.kind}><span aria-hidden>{n.icon ?? GROUP_ICON[n.group]}</span>{noticeText(n)}</div>)}
    </div>
  );
};

/** History window: the last 40 notices, newest first, grouped by day part is not needed: simple list with group labels. */
export const NotificationHistory: React.FC = () => {
  const { history } = useNotifications();
  useEffect(() => { const off = windows.subscribe(() => { if (windows.isOpen('notifications')) notifications.markRead(); }); return off; }, []);
  return (
    <WindowFrame id="notifications" width="min(460px, 94vw)" height="min(520px, 90vh)">
      {history.length === 0 ? <EmptyState icon="🔔" title={tr('No notifications yet')} text={tr('Loot, XP, quests and system messages show up here.')} /> : (
        <ul className="grid gap-1" aria-label={tr('Notifications')}>
          {history.map((n) => (
            <li key={n.id} className="flex items-center gap-2 text-sm py-1" style={{ borderBottom: '1px solid var(--c-line)' }}>
              <span aria-hidden>{n.icon ?? GROUP_ICON[n.group]}</span>
              <span className="flex-1 min-w-0 truncate">{noticeText(n)}</span>
              <span className="text-[11px]" style={{ color: 'var(--c-text-3)' }}>{tr(GROUP_LABEL[n.group])} · {new Date(n.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </li>
          ))}
        </ul>
      )}
    </WindowFrame>
  );
};
