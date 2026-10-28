import React from 'react';
import { currentLang, tr } from '../../i18n.ts';
import { Badge } from '../kit/Indicators.tsx';
import type { NewsItem } from './useServerInfo.ts';

const TAG_TONE = { update: 'accent', event: 'warn', info: 'neutral' } as const;
const TAG_LABEL = { update: 'Update', event: 'Event', info: 'News' } as const;

/** Patch notes and announcements. Items are plain text from the server (edited on the admin page) and are never rendered as HTML. */
export const NewsPanel: React.FC<{ items: NewsItem[] }> = ({ items }) => (
  <section className="tt-news" aria-label={tr('News')}>
    <h2 className="tt-news__head">{tr('News')}</h2>
    {items.length === 0 ? <p className="tt-news__empty">{tr('No news right now.')}</p> : (
      <ul className="tt-news__list">
        {items.map((n) => (
          <li key={n.id} className="tt-news__item">
            <div className="tt-news__meta">
              {n.tag && <Badge tone={TAG_TONE[n.tag]}>{tr(TAG_LABEL[n.tag])}</Badge>}
              {n.date && <time dateTime={n.date}>{n.date}</time>}
            </div>
            <h3>{n.title[currentLang] || n.title.en || n.title.de}</h3>
            <p>{n.body[currentLang] || n.body.en || n.body.de}</p>
          </li>
        ))}
      </ul>
    )}
  </section>
);
