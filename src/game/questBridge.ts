import { UserProfile } from '../save/profile.ts';
import * as Q from '../../shared/rules/quests.ts';
import { QUEST_BY_ID } from '../../shared/data/quests.ts';
import { nm } from '../i18n.ts';

export const nowSeconds = (): number => Math.floor(Date.now() / 1000);

/** Feeds a game event to the quest log; returns the new profile and the quests that just became claimable. */
export function applyQuestEvent(profile: UserProfile, ev: Q.QuestEvent): { profile: UserProfile; ready: string[] } {
  const next = structuredClone(profile);
  const ready = Q.onQuestEvent(next.character, ev);
  const changed = ready.length > 0 || Object.keys(next.character.quests.active).length > 0;
  return { profile: changed ? next : profile, ready };
}

export function questName(id: string): string {
  const q = QUEST_BY_ID.get(id);
  return q ? nm(q.nameKey, q.name) : id;
}

/** Rotates daily/weekly quests when the (real) day changed; no-op otherwise. */
export function rotateQuests(profile: UserProfile): UserProfile {
  const next = structuredClone(profile);
  const { dailyChanged, weeklyChanged } = Q.refreshQuests(next.character, nowSeconds());
  return dailyChanged || weeklyChanged ? next : profile;
}
