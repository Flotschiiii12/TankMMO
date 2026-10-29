import React, { useState } from 'react';
import { Badge, Button, CurrencyChip, EmptyState, ItemCard, Modal, Panel, PipHost, ProgressBar, RARITIES, Ring, SegmentedControl, Skeleton, SkeletonRows, StatRow, Tabs, ToastHost, Tooltip, VirtualGrid, VirtualList, AffixList, toasts, FACTION_THEMES, applyFactionTheme } from './index.ts';
import { GameIcon } from '../GameIcon.tsx';

/** Dev gallery at `#/ui-gallery?faction=steppe&lang=de`: every kit component in every state. Screenshotted by scripts/gallery-shots.ts. */
const DE: Record<string, string> = {
  'UI kit gallery': 'UI-Kit-Galerie', Buttons: 'Schaltflächen', Primary: 'Primär', Secondary: 'Sekundär', Danger: 'Gefahr', Ghost: 'Dezent', Loading: 'Lädt', Disabled: 'Deaktiviert', Pressed: 'Gedrückt',
  'Tabs and segmented control': 'Tabs und Segmente', Inventory: 'Inventar', Workshop: 'Werkstatt', Market: 'Markt', Day: 'Tag', Week: 'Woche', Season: 'Saison',
  'Gauges and bars': 'Anzeigen und Balken', Hull: 'Rumpf', Armor: 'Panzerung', Experience: 'Erfahrung', Badges: 'Marken', Good: 'Gut', Warning: 'Warnung', Bad: 'Schlecht', 'New': 'Neu',
  Currencies: 'Währungen', 'Stat rows with deltas': 'Werte mit Vergleich', Damage: 'Schaden', 'Reload time': 'Nachladezeit', Range: 'Reichweite', Speed: 'Tempo', 'Item cards': 'Gegenstände', Empty: 'Leer',
  'Cannon T3': 'Kanone T3', Tooltips: 'Tooltips', 'Hover, focus or long-press me': 'Berühren, fokussieren oder lang drücken', 'Virtual list (5 000 rows)': 'Virtuelle Liste (5 000 Zeilen)',
  'Virtual grid (2 000 items)': 'Virtuelles Raster (2 000 Gegenstände)', Toasts: 'Hinweise', 'Show toast': 'Hinweis zeigen', 'Dialogs': 'Dialoge', 'Open dialog': 'Dialog öffnen', 'Open sheet': 'Sheet öffnen',
  'Empty states and loading': 'Leere Zustände und Laden', 'Nothing here yet': 'Noch nichts da', 'Loot some items and they will show up here.': 'Sammle Beute, dann erscheint sie hier.',
  'Dialog title': 'Dialogtitel', 'Close': 'Schließen', 'This dialog traps focus. Escape closes it.': 'Dieser Dialog hält den Fokus. Escape schließt ihn.', 'Armor plating': 'Panzerplatte', Level: 'Stufe',
  'Painted frame slot': 'Platz für gemalten Rahmen', 'Falls back to CSS when no image is listed.': 'Fällt auf CSS zurück, wenn kein Bild gelistet ist.', Theme: 'Thema', Language: 'Sprache',
};
const params = () => new URLSearchParams((location.hash.split('?')[1] ?? ''));

export default function Gallery() {
  const p = params();
  const [lang, setLang] = useState<'en' | 'de'>(p.get('lang') === 'de' ? 'de' : 'en');
  const [faction, setFaction] = useState<string>(FACTION_THEMES.includes(p.get('faction') as any) ? (p.get('faction') as string) : 'coastal');
  const [tab, setTab] = useState('inv'); const [seg, setSeg] = useState('day'); const [open, setOpen] = useState<'none' | 'dialog' | 'sheet'>('none');
  React.useEffect(() => { applyFactionTheme(faction); }, [faction]);
  const g = (s: string) => (lang === 'de' ? DE[s] ?? s : s);
  const rows = React.useMemo(() => Array.from({ length: 5000 }, (_, i) => i), []);
  const cells = React.useMemo(() => Array.from({ length: 2000 }, (_, i) => i), []);
  const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => <Panel title={g(title)} className="gal-section"><div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>{children}</div></Panel>;
  return (
    <div className="k-root" style={{ minHeight: '100dvh', background: 'var(--c-bg-0)', padding: 16, overflowY: 'auto', height: '100dvh' }} data-testid="ui-gallery">
      <ToastHost />
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <h1 style={{ fontSize: 'var(--t-2xl)', fontWeight: 800 }}>{g('UI kit gallery')}</h1>
        <span style={{ color: 'var(--c-text-2)' }}>{g('Theme')}</span><SegmentedControl label="Theme" value={faction} onChange={setFaction} options={FACTION_THEMES.map((f) => ({ id: f, label: f }))} />
        <span style={{ color: 'var(--c-text-2)' }}>{g('Language')}</span><SegmentedControl label="Language" value={lang} onChange={(v) => setLang(v as 'en' | 'de')} options={[{ id: 'en', label: 'EN' }, { id: 'de', label: 'DE' }]} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 12 }}>
        <Section title="Buttons">
          <Button variant="primary">{g('Primary')}</Button><Button>{g('Secondary')}</Button><Button variant="danger">{g('Danger')}</Button><Button variant="ghost">{g('Ghost')}</Button>
          <Button variant="icon" label="Settings"><GameIcon name="settings" size={20} /></Button><Button loading>{g('Loading')}</Button><Button disabled>{g('Disabled')}</Button><Button pressed>{g('Pressed')}</Button><Button variant="primary" large>{g('Primary')}</Button>
        </Section>
        <Section title="Tabs and segmented control">
          <div style={{ width: '100%' }}><Tabs value={tab} onChange={setTab} tabs={[{ id: 'inv', label: g('Inventory'), pip: 3 }, { id: 'work', label: g('Workshop'), pip: true }, { id: 'mk', label: g('Market') }, { id: 'x', label: 'Locked', disabled: true }]} /></div>
          <SegmentedControl value={seg} onChange={setSeg} options={[{ id: 'day', label: g('Day') }, { id: 'week', label: g('Week') }, { id: 'season', label: g('Season') }]} />
        </Section>
        <Section title="Gauges and bars">
          <div style={{ width: '100%', display: 'grid', gap: 8 }}>
            <ProgressBar kind="hull" value={640} max={960} label="640 / 960" large ghost={800} ariaLabel={g('Hull')} /><ProgressBar kind="armor" value={300} max={1240} ariaLabel={g('Armor')} /><ProgressBar kind="xp" value={45} max={100} ariaLabel={g('Experience')} />
          </div>
          <Ring kind="hull" value={70} max={100}>70</Ring><Ring kind="armor" value={35} max={100} size={48}>35</Ring><Ring kind="xp" value={90} max={100} size={64}>{g('Level')} 7</Ring>
        </Section>
        <Section title="Badges">
          <Badge>{g('Secondary')}</Badge><Badge tone="accent">{g('New')}</Badge><Badge tone="good">{g('Good')}</Badge><Badge tone="warn">{g('Warning')}</Badge><Badge tone="bad">{g('Bad')}</Badge>
          <PipHost count><Button variant="icon" label="Mail"><GameIcon name="mail" size={20} /></Button></PipHost><PipHost count={7}><Button variant="icon" label="Quests"><GameIcon name="quests" size={20} /></Button></PipHost><PipHost count={120}><Button variant="icon" label="Chat"><GameIcon name="chat" size={20} /></Button></PipHost>
        </Section>
        <Section title="Currencies"><CurrencyChip kind="scrap" value={12450} /><CurrencyChip kind="fragments" value={36} /><CurrencyChip kind="honor" value={1180} compact /><CurrencyChip kind="scrap" value={2_480_000} compact /><CurrencyChip kind="ore" value={540} label="Iron" /></Section>
        <Section title="Stat rows with deltas">
          <div style={{ width: '100%' }}><StatRow label={g('Damage')} value={168} compareTo={140} /><StatRow label={g('Reload time')} value={2.4} compareTo={2.1} unit="s" lowerIsBetter /><StatRow label={g('Range')} value={620} compareTo={620} /><StatRow label={g('Speed')} value={0.82} compareTo={0.9} percent /></div>
        </Section>
        <Section title="Item cards">
          {RARITIES.map((r, i) => <ItemCard key={r} rarity={r} name={g('Cannon T3')} icon={<GameIcon name="fam_cannon" size={26} />} tier={i + 1} upgrade={i * 2} />)}
          <ItemCard rarity="Common" name={g('Empty')} slot="armor" empty /><ItemCard rarity="Epic" name={g('Armor plating')} icon={<GameIcon name="slot_armor" size={26} />} selected />
          <div style={{ width: '100%' }}><AffixList affixes={[{ text: '+8% damage' }, { text: '-4% reload', tone: 'good' }, { text: '-6% speed', tone: 'bad' }]} /></div>
        </Section>
        <Section title="Tooltips"><Tooltip content={g('Falls back to CSS when no image is listed.')}><Button>{g('Hover, focus or long-press me')}</Button></Tooltip></Section>
        <Section title="Virtual list (5 000 rows)"><div style={{ width: '100%' }}><VirtualList items={rows} rowHeight={32} height={160} renderRow={(i) => <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--c-line)' }}>#{i + 1}</div>} /></div></Section>
        <Section title="Virtual grid (2 000 items)"><div style={{ width: '100%' }}><VirtualGrid items={cells} cell={64} height={150} renderCell={(i) => <ItemCard rarity={RARITIES[i % 5]} name={`#${i}`} />} /></div></Section>
        <Section title="Toasts"><Button onClick={() => toasts.push(g('Show toast'), 'success')}>{g('Show toast')}</Button><Button onClick={() => toasts.push('Warning', 'warn')}>{g('Warning')}</Button><Button onClick={() => toasts.push('Error', 'error')}>Error</Button></Section>
        <Section title="Dialogs"><Button onClick={() => setOpen('dialog')}>{g('Open dialog')}</Button><Button onClick={() => setOpen('sheet')}>{g('Open sheet')}</Button></Section>
        <Section title="Empty states and loading"><EmptyState title={g('Nothing here yet')} text={g('Loot some items and they will show up here.')} /><div style={{ width: '100%' }}><SkeletonRows rows={2} h={28} /></div><Skeleton w={120} h={20} /></Section>
      </div>
      <Modal open={open !== 'none'} sheet={open === 'sheet'} onClose={() => setOpen('none')} title={g('Dialog title')} closeLabel={g('Close')}><p>{g('This dialog traps focus. Escape closes it.')}</p></Modal>
    </div>
  );
}
