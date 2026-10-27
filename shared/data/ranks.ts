/**
 * Treadfront - Military Honor Ranks Data Tables (Section 5)
 * 21 Distinct Honor Ranks (Recruit to Supreme Marshal)
 * Cosmetic titles, badges, and honor thresholds.
 */

export interface RankDefinition {
  level: number;       // 1 to 21
  nameKey: string;
  honorRequired: number;
  badgeKey: string;
  titleKey: string;
}

export const RANKS_CATALOG: RankDefinition[] = [
  { level: 1,  nameKey: 'rank.recruit.name',            honorRequired: 0,        badgeKey: 'badge_rank_01', titleKey: 'title.recruit' },
  { level: 2,  nameKey: 'rank.private.name',            honorRequired: 250,      badgeKey: 'badge_rank_02', titleKey: 'title.private' },
  { level: 3,  nameKey: 'rank.corporal.name',            honorRequired: 600,      badgeKey: 'badge_rank_03', titleKey: 'title.corporal' },
  { level: 4,  nameKey: 'rank.sergeant.name',            honorRequired: 1200,     badgeKey: 'badge_rank_04', titleKey: 'title.sergeant' },
  { level: 5,  nameKey: 'rank.staff_sergeant.name',      honorRequired: 2100,     badgeKey: 'badge_rank_05', titleKey: 'title.staff_sergeant' },
  { level: 6,  nameKey: 'rank.master_sergeant.name',     honorRequired: 3400,     badgeKey: 'badge_rank_06', titleKey: 'title.master_sergeant' },
  { level: 7,  nameKey: 'rank.warrant_officer.name',     honorRequired: 5200,     badgeKey: 'badge_rank_07', titleKey: 'title.warrant_officer' },
  { level: 8,  nameKey: 'rank.second_lieutenant.name',   honorRequired: 7600,     badgeKey: 'badge_rank_08', titleKey: 'title.second_lieutenant' },
  { level: 9,  nameKey: 'rank.lieutenant.name',          honorRequired: 10800,    badgeKey: 'badge_rank_09', titleKey: 'title.lieutenant' },
  { level: 10, nameKey: 'rank.captain.name',             honorRequired: 15000,    badgeKey: 'badge_rank_10', titleKey: 'title.captain' },
  { level: 11, nameKey: 'rank.major.name',               honorRequired: 20500,    badgeKey: 'badge_rank_11', titleKey: 'title.major' },
  { level: 12, nameKey: 'rank.lieutenant_colonel.name',  honorRequired: 27500,    badgeKey: 'badge_rank_12', titleKey: 'title.lieutenant_colonel' },
  { level: 13, nameKey: 'rank.colonel.name',             honorRequired: 36500,    badgeKey: 'badge_rank_13', titleKey: 'title.colonel' },
  { level: 14, nameKey: 'rank.brigadier.name',           honorRequired: 48000,    badgeKey: 'badge_rank_14', titleKey: 'title.brigadier' },
  { level: 15, nameKey: 'rank.major_general.name',       honorRequired: 62500,    badgeKey: 'badge_rank_15', titleKey: 'title.major_general' },
  { level: 16, nameKey: 'rank.lieutenant_general.name',  honorRequired: 81000,    badgeKey: 'badge_rank_16', titleKey: 'title.lieutenant_general' },
  { level: 17, nameKey: 'rank.general.name',             honorRequired: 104500,   badgeKey: 'badge_rank_17', titleKey: 'title.general' },
  { level: 18, nameKey: 'rank.field_marshal.name',       honorRequired: 134000,   badgeKey: 'badge_rank_18', titleKey: 'title.field_marshal' },
  { level: 19, nameKey: 'rank.marshal_of_the_realm.name',honorRequired: 171000,   badgeKey: 'badge_rank_19', titleKey: 'title.marshal_of_the_realm' },
  { level: 20, nameKey: 'rank.high_marshal.name',        honorRequired: 218000,   badgeKey: 'badge_rank_20', titleKey: 'title.high_marshal' },
  { level: 21, nameKey: 'rank.supreme_marshal.name',     honorRequired: 280000,   badgeKey: 'badge_rank_21', titleKey: 'title.supreme_marshal' },
];

export function getRankForHonor(honor: number): RankDefinition {
  let highest = RANKS_CATALOG[0];
  for (const r of RANKS_CATALOG) {
    if (honor >= r.honorRequired) {
      highest = r;
    } else {
      break;
    }
  }
  return highest;
}
