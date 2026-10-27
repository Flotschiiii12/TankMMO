/** Free season pass (design doc section 5): 8-week seasons, 50 tiers, points from daily/weekly activity (capped per day). */
export const SEASON_LENGTH_SECONDS = 8 * 7 * 86400;
export const SEASON_TIERS = 50;
export const SEASON_POINTS_PER_TIER = 100;
export const SEASON_DAILY_POINT_CAP = 150;

export interface SeasonReward {
  tier: number;
  scrap?: number;
  fragments?: number;
  ore?: number;
  seasonMarks?: number;
  gateKeys?: number;
  title?: string;
  skin?: string;
}

function buildRewards(): SeasonReward[] {
  const out: SeasonReward[] = [];
  for (let tier = 1; tier <= SEASON_TIERS; tier++) {
    const r: SeasonReward = { tier, scrap: 500 + tier * 150 };
    if (tier % 2 === 0) r.fragments = 10 + tier;
    if (tier % 5 === 0) { r.ore = 50 + tier * 4; r.seasonMarks = 10; }
    if (tier % 10 === 0) r.gateKeys = 1;
    if (tier === 25) r.skin = 'skin_season_ember';
    if (tier === 40) r.title = 'Season Veteran';
    if (tier === 50) { r.skin = 'skin_season_crown'; r.title = 'Season Champion'; r.seasonMarks = 100; }
    out.push(r);
  }
  return out;
}

export const SEASON_REWARDS: SeasonReward[] = buildRewards();
