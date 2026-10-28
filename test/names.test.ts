import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { NAME_TABLE, NAMES_DE, NAMES_EN, KEY_BY_ENGLISH, TITLE_DE } from '../shared/data/names/index.ts';
import { TRANSLATIONS, t } from '../shared/data/i18n.ts';
import { VEHICLE_CATALOG } from '../shared/data/vehicles.ts';
import { ITEM_CATALOG } from '../shared/data/items.ts';
import { MAP_METADATA_TABLE } from '../shared/data/maps.ts';
import { ENEMY_ARCHETYPES, BOSS_CATALOG } from '../shared/data/enemies.ts';
import { DUNGEONS } from '../shared/data/dungeons.ts';
import { ALL_QUESTS } from '../shared/data/quests.ts';
import { TALENTS_CATALOG } from '../shared/data/talents.ts';
import { ACHIEVEMENTS_CATALOG } from '../shared/data/achievements.ts';
import { RANKS_CATALOG } from '../shared/data/ranks.ts';
import { EVENT_KINDS } from '../shared/data/names/world.ts';

/** Every key the data tables point at. */
function keysInUse(): Array<{ key: string; what: string }> {
  const k: Array<{ key: string; what: string }> = [];
  for (const v of VEHICLE_CATALOG) k.push({ key: v.nameKey, what: v.id }, { key: v.descriptionKey, what: v.id });
  for (const i of ITEM_CATALOG) k.push({ key: i.nameKey, what: i.id }, { key: i.descriptionKey, what: i.id });
  for (const m of Object.values(MAP_METADATA_TABLE)) k.push({ key: m.nameKey, what: `map ${m.id}` }, { key: `${m.nameKey}.desc`, what: `map ${m.id}` });
  for (const e of Object.values(ENEMY_ARCHETYPES)) { k.push({ key: e.nameKey, what: e.id }); if (e.descriptionKey) k.push({ key: e.descriptionKey, what: e.id }); }
  for (const b of BOSS_CATALOG) k.push({ key: b.nameKey, what: b.id });
  for (const d of DUNGEONS) k.push({ key: d.nameKey, what: d.id }, { key: d.boss.nameKey, what: `${d.id} boss` });
  for (const q of ALL_QUESTS) k.push({ key: q.nameKey, what: q.id });
  for (const x of TALENTS_CATALOG) k.push({ key: x.nameKey, what: x.id }, { key: x.descKey, what: x.id });
  for (const a of ACHIEVEMENTS_CATALOG) k.push({ key: a.nameKey, what: a.id }, { key: a.descKey, what: a.id });
  for (const r of RANKS_CATALOG) k.push({ key: r.nameKey, what: `rank ${r.level}` }, { key: r.titleKey, what: `rank ${r.level}` });
  for (const ev of EVENT_KINDS) k.push({ key: `event.${ev}.name`, what: ev }, { key: `event.${ev}.notice`, what: ev });
  return k;
}

describe('German names for data-driven content', () => {
  it('every nameKey / descriptionKey / descKey / titleKey used by the data tables has an English and a German text', () => {
    const missing = keysInUse().filter(({ key }) => !NAME_TABLE[key]?.de?.trim() || !NAME_TABLE[key]?.en?.trim());
    expect(missing.map((m) => `${m.key} (${m.what})`), 'keys without text').toEqual([]);
    expect(keysInUse().length).toBeGreaterThan(900);
  });

  it('literal keys written in shared/data/*.ts are covered too (guards against new data files that skip the table)', () => {
    const re = /\b(?:nameKey|descriptionKey|descKey|titleKey):\s*'([^'$]+)'/g;
    const missing: string[] = [];
    for (const f of readdirSync('shared/data').filter((n) => n.endsWith('.ts'))) {
      const text = readFileSync(`shared/data/${f}`, 'utf8');
      for (const m of text.matchAll(re)) if (!(m[1] in TRANSLATIONS.de) || !(m[1] in TRANSLATIONS.en)) missing.push(`${m[1]} (${f})`);
    }
    expect(missing).toEqual([]);
  });

  it('the English text equals the English name already in the data, so English players see no change', () => {
    for (const m of Object.values(MAP_METADATA_TABLE)) { expect(NAMES_EN[m.nameKey]).toBe(m.name); expect(NAMES_EN[`${m.nameKey}.desc`]).toBe(m.description); }
    for (const e of Object.values(ENEMY_ARCHETYPES)) expect(NAMES_EN[e.nameKey]).toBe(e.displayName);
    for (const b of BOSS_CATALOG) expect(NAMES_EN[b.nameKey]).toBe(b.name);
    for (const d of DUNGEONS) { expect(NAMES_EN[d.nameKey]).toBe(d.name); expect(NAMES_EN[d.boss.nameKey]).toBe(d.boss.name); }
    for (const q of ALL_QUESTS) expect(NAMES_EN[q.nameKey]).toBe(q.name);
  });

  it('no placeholder is lost or left over: {vars} match between English and German and none remain unresolved', () => {
    const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(',');
    for (const [key, v] of Object.entries(NAME_TABLE)) {
      expect(ph(v.de), key).toBe(ph(v.en));
      expect(v.en, key).not.toMatch(/\{\w+\}/);
    }
    // the hand-written tables keep working too
    expect(t('ammo.standard', 'de')).toBe('Standard-Vollgeschoss');
    expect(t('vehicle.heavy.4.name', 'de')).toBe('Wächter-Schwerpanzer');
    expect(t('vehicle.heavy.4.name', 'en')).toBe('Warden Heavy');
    expect(t('does.not.exist', 'de')).toBe('does.not.exist');
  });

  it('names are distinct where players pick between them and are real German, not copies of the English', () => {
    const vehicles = VEHICLE_CATALOG.map((v) => NAMES_DE[v.nameKey]);
    expect(new Set(vehicles).size).toBe(50);
    const items = ITEM_CATALOG.map((i) => NAMES_DE[i.nameKey]);
    expect(new Set(items).size).toBeGreaterThanOrEqual(ITEM_CATALOG.filter((i) => i.family !== 'drone').length - 30); // drones share a name over five tiers
    const maps = Object.values(MAP_METADATA_TABLE).map((m) => NAMES_DE[m.nameKey]);
    expect(new Set(maps).size).toBe(30);
    // most texts must differ from English (names such as "Titan" or "Wanderer" legitimately match)
    const same = Object.entries(NAME_TABLE).filter(([, v]) => v.en === v.de).length;
    expect(same / Object.keys(NAME_TABLE).length).toBeLessThan(0.1);
  });

  it('uses the informal "du" tone and no formal address', () => {
    for (const [key, text] of Object.entries(NAMES_DE)) expect(text, key).not.toMatch(/\b(Sie|Ihr|Ihre|Ihnen|Ihrem)\b/);
  });

  it('achievement titles have a German form and the entity-name lookup finds enemies, bosses and gate bosses', () => {
    for (const a of ACHIEVEMENTS_CATALOG) if (a.rewardTitle) expect(TITLE_DE[a.rewardTitle], a.rewardTitle).toBeTruthy();
    expect(KEY_BY_ENGLISH.get('Scout Buggy')).toBe('enemy.scout_buggy.name');
    expect(KEY_BY_ENGLISH.get('Depot Warden')).toBe('gate.rusted_depot.boss');
    expect(KEY_BY_ENGLISH.get('Cape Solitude Iron Warden')).toBe('boss.cape_warden.name');
  });
});

describe('client lookup helpers', () => {
  const load = async (lang: 'de' | 'en') => {
    (globalThis as any).localStorage = { getItem: () => lang, setItem: () => {} };
    const { vi } = await import('vitest');
    vi.resetModules();
    return import('../src/i18n.ts');
  };

  it('German: names come from the table, unknown keys and English keep the data name, enemy labels keep level and elite prefix', async () => {
    const de = await load('de');
    expect(de.nm('vehicle.scout.1.name', 'Patchwork Scout')).toBe('Flickwerk-Aufklärer');
    expect(de.nm('no.such.key', 'Fallback')).toBe('Fallback');
    expect(de.nm(undefined, 'Fallback')).toBe('Fallback');
    expect(de.localizeEntityName('Scout Buggy [Lv.5]')).toBe('Aufklärungsbuggy [Lv.5]');
    expect(de.localizeEntityName('Elite Gunner Truck [Lv.12]')).toBe('Elite-Kanonentruck [Lv.12]');
    expect(de.localizeEntityName('Cape Solitude Iron Warden')).toBe('Eiserner Wächter vom Kap der Einsamkeit');
    expect(de.localizeEntityName('SomePlayer')).toBe('SomePlayer');
    expect(de.titleText('Warlord')).toBe('Kriegsherr');
    delete (globalThis as any).localStorage;
  });

  it('English: nothing changes', async () => {
    const en = await load('en');
    expect(en.nm('vehicle.scout.1.name', 'Patchwork Scout')).toBe('Patchwork Scout');
    expect(en.localizeEntityName('Elite Gunner Truck [Lv.12]')).toBe('Elite Gunner Truck [Lv.12]');
    expect(en.titleText('Warlord')).toBe('Warlord');
    delete (globalThis as any).localStorage;
  });
});
