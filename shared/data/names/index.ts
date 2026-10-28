/**
 * Every display name and description that comes from the data tables, in English and German, keyed by the `nameKey` /
 * `descriptionKey` / `descKey` / `titleKey` of the definition. Ids never change; text is looked up by key and falls back
 * to the English `name` of the definition. `test/names.test.ts` fails when a key used in `shared/data` has no German text.
 */
import { buildGearNames } from './gear.ts';
import { buildWorldNames } from './world.ts';
import { buildProgressNames, TITLE_DE } from './progress.ts';
import { buildStoryNames } from './story.ts';
import type { Table } from './gear.ts';

export { TITLE_DE };

export const NAME_TABLE: Table = { ...buildGearNames(), ...buildWorldNames(), ...buildProgressNames(), ...buildStoryNames() };

const split = (side: 'en' | 'de'): Record<string, string> => Object.fromEntries(Object.entries(NAME_TABLE).map(([k, v]) => [k, v[side]]));
export const NAMES_EN: Record<string, string> = split('en');
export const NAMES_DE: Record<string, string> = split('de');

/** English display text -> key, for entity names the simulation builds from the definitions (enemies, bosses, gate bosses). */
export const KEY_BY_ENGLISH: ReadonlyMap<string, string> = new Map(
  Object.entries(NAME_TABLE).filter(([k]) => /^(enemy\.[^.]+\.name|boss\.[^.]+\.name|gate\.[^.]+\.boss)$/.test(k)).map(([k, v]) => [v.en, k]),
);
