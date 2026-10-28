/** English + German texts of the story scenes (see shared/data/storyText.ts). */
import { STORY_TEXT } from '../storyText.ts';
import { CHAPTERS } from '../quests.ts';

const CHAPTER_TITLE_DE = ['Kies und Rost', 'Die Überquerung', 'Schluchtenfeuer', 'Gefrorene Front', 'Die Alte Fernstraße', 'Grenzland', 'Ruinen von Vaelmar', 'Obsidiansande', 'Eiserne Krone', 'Das Brennende Tal'];
import type { Table } from './gear.ts';

export function buildStoryNames(): Table {
  const out: Table = {};
  for (const [c, ch] of Object.entries(STORY_TEXT)) {
    out[`story.c${c}.summary`] = { en: ch.summary[0], de: ch.summary[1] };
    ch.scenes.forEach((s, i) => {
      s.lines.forEach(([, en, de], j) => { out[`story.c${c}.s${i + 1}.l${j + 1}`] = { en, de }; });
      (s.choices ?? []).forEach(([en, de, ren, rde], k) => {
        out[`story.c${c}.s${i + 1}.c${k + 1}`] = { en, de };
        out[`story.c${c}.s${i + 1}.r${k + 1}`] = { en: ren, de: rde };
      });
    });
  }
  for (const c of CHAPTERS) out[`story.c${c.chapter}.title`] = { en: c.name, de: CHAPTER_TITLE_DE[c.chapter - 1] };
  out['story.speaker.you'] = { en: 'You', de: 'Du' };
  out['story.speaker.varga'] = { en: 'Commander Varga', de: 'Kommandantin Varga' };
  out['story.speaker.mira'] = { en: 'Mira', de: 'Mira' };
  out['story.speaker.dunmore'] = { en: 'Dunmore', de: 'Dunmore' };
  out['story.speaker.ael'] = { en: 'Sister Ael', de: 'Schwester Ael' };
  out['story.speaker.rook'] = { en: 'Rook', de: 'Rook' };
  out['story.speaker.narrator'] = { en: '', de: '' };
  return out;
}
