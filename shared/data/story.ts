/** Story scenes derived from the text table: which quest event opens which scene, and the translation keys of every line. */
import { SPEAKERS, STORY_TEXT } from './storyText.ts';

export { SPEAKERS };

export interface StoryLine { who: string; key: string }
export interface StoryChoice { key: string; replyKey: string }
export interface StoryScene {
  id: string; // scn_c3_2
  chapter: number;
  index: number; // 1-based position inside the chapter
  on: 'accept' | 'claim';
  questId: string; // story_c3_q4
  lines: StoryLine[];
  choices: StoryChoice[];
}

export const STORY_SCENES: StoryScene[] = Object.entries(STORY_TEXT).flatMap(([chapter, ct]) =>
  ct.scenes.map((s, i) => ({
    id: `scn_c${chapter}_${i + 1}`,
    chapter: Number(chapter),
    index: i + 1,
    on: s.on,
    questId: `story_c${chapter}_q${s.q}`,
    lines: s.lines.map(([who], j) => ({ who, key: `story.c${chapter}.s${i + 1}.l${j + 1}` })),
    choices: (s.choices ?? []).map((_, k) => ({ key: `story.c${chapter}.s${i + 1}.c${k + 1}`, replyKey: `story.c${chapter}.s${i + 1}.r${k + 1}` })),
  })),
).sort((a, b) => a.chapter - b.chapter || a.index - b.index);

export const SCENE_BY_ID = new Map(STORY_SCENES.map((s) => [s.id, s]));
export const chapterSummaryKey = (chapter: number): string => `story.c${chapter}.summary`;
export const sceneSeenFlag = (id: string): string => id;
