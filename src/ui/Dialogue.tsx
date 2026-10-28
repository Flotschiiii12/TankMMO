import React, { useEffect, useState } from 'react';
import { tr, nm } from '../i18n.ts';
import { GameIcon } from './GameIcon.tsx';
import { SPEAKERS, STORY_SCENES, chapterSummaryKey, type StoryScene } from '../../shared/data/story.ts';
import { CHAPTERS } from '../../shared/data/quests.ts';
import { sceneSeen } from '../../shared/rules/quests.ts';
import type { CharacterState } from '../../shared/rules/character.ts';

const speakerName = (id: string): string => {
  const s = SPEAKERS[id];
  return s ? nm(`story.speaker.${id}`, s.name) : id;
};

/** NPC dialogue: speaker + portrait (an existing icon), text, Next / Skip, and optional flavour choices (no effect on rewards). */
export const DialogueModal: React.FC<{ scene: StoryScene | null; onDone: (sceneId: string) => void }> = ({ scene, onDone }) => {
  const [i, setI] = useState(0);
  const [reply, setReply] = useState<string | null>(null);
  useEffect(() => { setI(0); setReply(null); }, [scene?.id]);
  useEffect(() => {
    if (!scene) return;
    const onKey = (e: KeyboardEvent) => { if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); (document.querySelector('[data-testid="dialogue-next"]') as HTMLButtonElement | null)?.click(); } else if (e.code === 'Escape') onDone(scene.id); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [scene, onDone]);
  if (!scene) return null;
  const line = scene.lines[i];
  const last = i >= scene.lines.length - 1;
  const sp = SPEAKERS[line.who];
  const showChoices = last && scene.choices.length > 0 && reply === null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] flex justify-center p-3 pointer-events-none" data-testid="dialogue">
      <div className="pointer-events-auto w-full max-w-2xl rounded-xl border border-orange-500/50 bg-slate-950/95 p-3 shadow-2xl text-slate-200">
        <div className="flex gap-3">
          <div className="shrink-0 w-12 h-12 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center"><GameIcon name={sp?.icon ?? 'quests'} size={32} /></div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-orange-300">{speakerName(line.who)}</div>
            <p className="mt-1 text-sm leading-snug" data-testid="dialogue-text">{reply ?? nm(line.key, '')}</p>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
          {showChoices && scene.choices.map((c, k) => <button key={c.key} className="px-3 py-1.5 rounded border border-slate-600 text-xs hover:bg-slate-800" onClick={() => setReply(nm(c.replyKey, ''))}>{nm(c.key, '')}</button>)}
          <button className="text-[11px] text-slate-400 hover:text-white underline" onClick={() => onDone(scene.id)}>{tr('Skip')}</button>
          {!showChoices && <button data-testid="dialogue-next" className="px-3 py-1.5 rounded bg-orange-600/90 text-white text-xs font-semibold" onClick={() => (reply !== null || last ? onDone(scene.id) : setI(i + 1))}>{reply !== null || last ? tr('Close') : tr('Next')}</button>}
        </div>
      </div>
    </div>
  );
};

/** Quest journal: the story so far, chapter by chapter, with scenes that can be read again. */
export const StoryJournal: React.FC<{ ch: CharacterState; onReplay: (scene: StoryScene) => void }> = ({ ch, onReplay }) => {
  const reached = CHAPTERS.filter((c) => STORY_SCENES.some((s) => s.chapter === c.chapter && sceneSeen(ch, s.id)));
  if (!reached.length) return <div className="text-xs text-slate-500 p-3">{tr('Your story begins with the first story quest.')}</div>;
  return (
    <div className="space-y-2" data-testid="story-journal">
      {reached.map((c) => (
        <div key={c.chapter} className="rounded-lg border border-slate-800 bg-slate-950/40 p-2">
          <div className="text-xs font-semibold text-white">{tr('Chapter')} {c.chapter}: {nm(`story.c${c.chapter}.title`, c.name)}</div>
          <div className="mt-0.5 text-[11px] text-slate-300 leading-snug">{nm(chapterSummaryKey(c.chapter), '')}</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {STORY_SCENES.filter((s) => s.chapter === c.chapter && sceneSeen(ch, s.id)).map((s) => <button key={s.id} className="px-2 py-0.5 rounded border border-slate-700 text-[11px] text-slate-300 hover:bg-slate-800" onClick={() => onReplay(s)}>▶ {s.index}</button>)}
          </div>
        </div>
      ))}
    </div>
  );
};
