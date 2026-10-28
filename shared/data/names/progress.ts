/** English + German names/descriptions for quests, talents, achievements, ranks and titles. */
import { ALL_QUESTS } from '../quests.ts';
import { TALENTS_CATALOG } from '../talents.ts';
import { ACHIEVEMENTS_CATALOG } from '../achievements.ts';
import { RANKS_CATALOG } from '../ranks.ts';
import type { Pair, Table } from './gear.ts';

// ------------------------------------------------------------------------------------------------ quests

const CHAPTER_DE = ['Kies und Rost', 'Die Überquerung', 'Schluchtenfeuer', 'Gefrorene Front', 'Die Alte Fernstraße', 'Grenzland', 'Ruinen von Vaelmar', 'Obsidiansande', 'Eiserne Krone', 'Das Brennende Tal'];
const STAGE_DE = ['Ankunft', 'Erster Kontakt', 'Bergung', 'Erkundung', 'Straße freiräumen', 'Bessere Ausrüstung', 'Elitejagd', 'Tiefer hinein', 'Nachschub', 'Finale'];
const STAGE_EN = ['Arrival', 'First Contact', 'Salvage', 'Scouting', 'Clear the Road', 'Better Gear', 'Elite Hunt', 'Deeper In', 'Supplies', 'Finale'];

const TUTORIAL_DE: Record<string, string> = { drive: 'Fahren', lock: 'Ziel erfassen', fire: 'Feuern', loot: 'Beute einsammeln', garage: 'Garage', equip: 'Ausrüsten', levelup: 'Stufenaufstieg', portal: 'Portal' };

const ENEMY_SHORT_DE: Record<string, string> = {
  scout_buggy: 'Aufklärungsbuggy', gunner_truck: 'Kanonentruck', artillery: 'Artillerie', bunker_turret: 'Bunkergeschütz', flak_wagon: 'Flak-Wagen', engineer: 'Kampfpionier',
  loot_convoy: 'Frachtkonvoi', ice_tank: 'Frostgleiter', swamp_crawler: 'Morastkriecher', lava_truck: 'Glutbrecher', sandstorm_raider: 'Dünengleiter',
};
const ORE_DE: Record<string, string> = { iron: 'Eisen', copper: 'Kupfer', titanium: 'Titan', crystal: 'Kristall' };

/** Fixed German names of the pooled quests, keyed by the last part of the nameKey. */
const POOL_DE: Record<string, string> = {
  'daily.any_kill_50': 'Aufräumtrupp', 'daily.elite_2': 'Zwei Elite-Gegner', 'daily.elite_5': 'Elite-Säuberung', 'daily.boss_1': 'Einen Boss erlegen', 'daily.gate_1': 'Ein Tor räumen',
  'daily.craft_1': 'Werkstattarbeit', 'daily.upgrade_3': 'Feinabstimmung', 'daily.upgrade_6': 'Schwere Aufrüstung', 'daily.portal_3': 'Portalspringer', 'daily.escort_1': 'Konvoi-Geleit',
  'daily.deliver_scrap': 'Nachschubabwurf', 'daily.arena_1': 'Arena-Debüt', 'daily.explore_1': 'Entdecker', 'daily.mixed_a': 'Patrouillendienst', 'daily.mixed_b': 'Frontlinie',
  'daily.ore_any_80': 'Große Ausbeute', 'daily.elite_1': 'Ein Elite-Gegner', 'daily.mixed_c': 'Bergungsfahrt',
  'weekly.slayer': 'Wöchentlicher Schlächter', 'weekly.elite_hunter': 'Elite-Jäger', 'weekly.miner': 'Wöchentlicher Minenarbeiter', 'weekly.dungeon_runner': 'Torläufer',
  'weekly.boss_breaker': 'Bossbezwinger', 'weekly.smith': 'Meisterschmied', 'weekly.arena_climber': 'Arena-Aufsteiger', 'weekly.globetrotter': 'Weltenbummler', 'weekly.convoy_guard': 'Konvoiwache',
};
const BOUNTY_DE: Record<string, string> = { rust_baron: 'Rostbaron', dust_widow: 'Staubwitwe', iron_hound: 'Eisenhund', frost_wraith: 'Frostgeist', mire_king: 'Moorkönig', ash_reaper: 'Aschenschnitter' };
const FACTION_DE: Record<string, string> = { coastal: 'Küstenbund', highland: 'Hochlandbund', steppe: 'Steppenkarawane' };
const CLAN_DE: Record<string, string> = { 'quest.clan_hunt': 'Clan-Jagd', 'quest.clan_mine': 'Clan-Bergbau', 'quest.clan_gates': 'Clan-Tore' };

function questDe(nameKey: string): string {
  let m = nameKey.match(/^quest\.tutorial\.(\w+)$/);
  if (m) return `Tutorial: ${TUTORIAL_DE[m[1]]}`;
  m = nameKey.match(/^quest\.story\.c(\d+)\.q(\d+)$/);
  if (m) return `${CHAPTER_DE[Number(m[1]) - 1]}: ${STAGE_DE[Number(m[2]) - 1]}`;
  m = nameKey.match(/^quest\.daily\.kill_many_(\w+)$/);
  if (m) return `Säuberung: ${ENEMY_SHORT_DE[m[1]]}`;
  m = nameKey.match(/^quest\.daily\.kill_(\w+)$/);
  if (m) return `Jagd: ${ENEMY_SHORT_DE[m[1]]}`;
  m = nameKey.match(/^quest\.daily\.ore_(iron|copper|titanium|crystal)$/);
  if (m) return `${ORE_DE[m[1]]} abbauen`;
  m = nameKey.match(/^quest\.(daily|weekly)\.(\w+)$/);
  if (m && POOL_DE[`${m[1]}.${m[2]}`]) return POOL_DE[`${m[1]}.${m[2]}`];
  m = nameKey.match(/^quest\.bounty\.bounty_(\w+)$/);
  if (m) return `Kopfgeld: ${BOUNTY_DE[m[1]]}`;
  m = nameKey.match(/^quest\.explorer\.map_(\d+)$/);
  if (m) return `Entdecker: Karte ${m[1]}`;
  m = nameKey.match(/^quest\.faction\.(\w+)\.(\d+)$/);
  if (m) return `${FACTION_DE[m[1]]}: Dienst ${m[2]}`;
  return CLAN_DE[nameKey];
}

// ------------------------------------------------------------------------------------------------ talents

const TALENT: Record<string, [string, string, string, string]> = {
  // id: [EN name, DE name, EN desc, DE desc]
  off_kinetic_power: ['Kinetic Power', 'Kinetische Kraft', 'Raises main gun damage.', 'Erhöht den Schaden der Hauptwaffe.'],
  off_rapid_cycling: ['Rapid Cycling', 'Schnelles Nachladen', 'Shortens the reload time.', 'Verkürzt die Nachladezeit.'],
  off_precision_optics: ['Precision Optics', 'Präzisionsoptik', 'Raises critical hit chance.', 'Erhöht die Chance auf kritische Treffer.'],
  off_high_explosive: ['High Explosive', 'Hochexplosiv', 'Raises critical hit damage.', 'Erhöht den Schaden kritischer Treffer.'],
  off_rifled_bore: ['Rifled Bore', 'Gezogener Lauf', 'Makes shells fly faster.', 'Lässt Geschosse schneller fliegen.'],
  off_extended_barrel: ['Extended Barrel', 'Verlängerter Lauf', 'Extends the main gun range.', 'Vergrößert die Reichweite der Hauptwaffe.'],
  off_armor_punch: ['Armor Punch', 'Panzerbrecher', 'Shells pierce more of the target armor.', 'Geschosse durchdringen mehr von der Panzerung des Ziels.'],
  off_ammo_conservation: ['Ammo Conservation', 'Munitionssparer', 'Special ammunition lasts longer.', 'Spezialmunition hält länger.'],
  off_splash_amplification: ['Splash Amplification', 'Streuwirkung', 'Enlarges the splash radius.', 'Vergrößert den Explosionsradius.'],
  off_execute_protocol: ['Execute Protocol', 'Hinrichtungsprotokoll', 'Extra damage against badly damaged targets.', 'Zusatzschaden gegen stark beschädigte Ziele.'],
  off_overcharge_mastery: ['Overcharge Mastery', 'Überlastungs-Meisterschaft', 'Overcharge lasts longer.', 'Die Überlastung hält länger an.'],
  off_barrage_salvo: ['Barrage Salvo', 'Sperrfeuer-Salve', 'Barrage deals more damage.', 'Das Sperrfeuer richtet mehr Schaden an.'],
  def_composite_plating: ['Composite Plating', 'Verbundbeschichtung', 'Raises maximum armor.', 'Erhöht die maximale Panzerung.'],
  def_reinforced_hull: ['Reinforced Hull', 'Verstärkter Rumpf', 'Raises maximum hull.', 'Erhöht den maximalen Rumpf.'],
  def_fast_capacitors: ['Fast Capacitors', 'Schnelle Kondensatoren', 'Armor regenerates faster.', 'Die Panzerung regeneriert schneller.'],
  def_sloped_glacis: ['Sloped Glacis', 'Schräge Bugplatte', 'Deflects more frontal hits.', 'Lenkt mehr Treffer von vorn ab.'],
  def_hardened_bulkheads: ['Hardened Bulkheads', 'Gehärtete Schotten', 'Every hit is reduced by a flat amount.', 'Jeder Treffer wird um einen festen Betrag verringert.'],
  def_anti_emp_insulation: ['Anti-EMP Insulation', 'EMP-Isolierung', 'Better resistance against stuns.', 'Bessere Widerstandskraft gegen Betäubung.'],
  def_rapid_repair_crew: ['Rapid Repair Crew', 'Schnelle Reparaturcrew', 'Repair kits heal more.', 'Reparatursätze heilen mehr.'],
  def_shield_overcharge: ['Shield Overcharge', 'Schildüberladung', 'The emergency shield lasts longer.', 'Das Notfallschild hält länger.'],
  def_thermal_dissipation: ['Thermal Dissipation', 'Wärmeableitung', 'Better resistance against burning.', 'Bessere Widerstandskraft gegen Brände.'],
  def_bastion_stance: ['Bastion Stance', 'Bastionshaltung', 'Fortify gives more armor.', 'Die Festung gibt mehr Panzerung.'],
  def_reactive_armor_pulse: ['Reactive Armor Pulse', 'Reaktiver Panzerimpuls', 'Less damage from hits to the rear.', 'Weniger Schaden durch Treffer von hinten.'],
  def_last_stand: ['Last Stand', 'Letztes Aufgebot', 'Less damage taken at low hull.', 'Weniger erlittener Schaden bei niedrigem Rumpf.'],
  log_turbocharged_drive: ['Turbocharged Drive', 'Turbo-Antrieb', 'Raises top speed.', 'Erhöht die Höchstgeschwindigkeit.'],
  log_salvage_efficiency: ['Salvage Efficiency', 'Bergungseffizienz', 'More scrap from kills.', 'Mehr Schrott von Abschüssen.'],
  log_deep_scanners: ['Deep Scanners', 'Tiefenscanner', 'Extends your radar range.', 'Vergrößert die Reichweite deines Radars.'],
  log_rapid_hydraulics: ['Rapid Hydraulics', 'Schnelle Hydraulik', 'The chassis turns faster.', 'Das Fahrgestell dreht schneller.'],
  log_ability_tuning: ['Ability Tuning', 'Fähigkeiten-Tuning', 'Abilities recharge faster.', 'Fähigkeiten laden schneller auf.'],
  log_ore_prospector: ['Ore Prospector', 'Erzsucher', 'More ore from mining.', 'Mehr Erz beim Abbau.'],
  log_expanded_bay: ['Expanded Bay', 'Erweiterter Laderaum', 'Adds inventory slots.', 'Schafft zusätzliche Inventarplätze.'],
  log_hangar_discount: ['Hangar Discount', 'Hangar-Rabatt', 'Cheaper repairs.', 'Günstigere Reparaturen.'],
  log_market_broker: ['Market Broker', 'Marktmakler', 'Lower trade tax.', 'Niedrigere Handelssteuer.'],
  log_drone_uplink: ['Drone Uplink', 'Drohnen-Verbindung', 'Drones work more efficiently.', 'Drohnen arbeiten effizienter.'],
  log_master_artisan: ['Master Artisan', 'Meisterhandwerker', 'Cheaper crafting.', 'Günstigeres Herstellen.'],
  log_apex_scavenger: ['Apex Scavenger', 'Spitzen-Plünderer', 'Better luck with rare drops.', 'Mehr Glück bei seltener Beute.'],
};

// ------------------------------------------------------------------------------------------------ achievements

const ACH: Record<string, [string, string, string, string]> = {
  // suffix: [EN name, DE name, EN desc, DE desc]; {n} = target value
  first_blood: ['First Blood', 'Erstes Blut', 'Destroy your first enemy.', 'Zerstöre deinen ersten Gegner.'],
  kills_50: ['Scrap Collector', 'Schrottsammler', 'Destroy {n} enemies.', 'Zerstöre {n} Gegner.'],
  kills_250: ['Eliminator', 'Auslöscher', 'Destroy {n} enemies.', 'Zerstöre {n} Gegner.'],
  kills_1000: ['Iron Reaper', 'Eiserner Schnitter', 'Destroy {n} enemies.', 'Zerstöre {n} Gegner.'],
  kills_5000: ['Armored Scourge', 'Gepanzerte Geißel', 'Destroy {n} enemies.', 'Zerstöre {n} Gegner.'],
  crit_strikes_100: ['Sharpshooter', 'Scharfschütze', 'Land {n} critical hits.', 'Lande {n} kritische Treffer.'],
  flank_master: ['Flank Master', 'Flankenmeister', 'Hit enemies in the rear {n} times.', 'Triff Gegner {n} Mal von hinten.'],
  boss_slayer_1: ['Boss Slayer', 'Bossbezwinger', 'Defeat a boss.', 'Besiege einen Boss.'],
  boss_slayer_10: ['Goliath Bane', 'Goliath-Schreck', 'Defeat {n} bosses.', 'Besiege {n} Bosse.'],
  world_boss_conqueror: ['World Boss Conqueror', 'Weltboss-Bezwinger', 'Defeat {n} world bosses.', 'Besiege {n} Weltbosse.'],
  reach_level_10: ['Rookie Driver', 'Fahranfänger', 'Reach level {n}.', 'Erreiche Stufe {n}.'],
  reach_level_25: ['Seasoned Driver', 'Erfahrener Fahrer', 'Reach level {n}.', 'Erreiche Stufe {n}.'],
  reach_level_50: ['Veteran Driver', 'Veteranenfahrer', 'Reach level {n}.', 'Erreiche Stufe {n}.'],
  reach_level_75: ['Elite Driver', 'Elitefahrer', 'Reach level {n}.', 'Erreiche Stufe {n}.'],
  reach_level_100: ['Tank Master', 'Panzermeister', 'Reach level {n}.', 'Erreiche Stufe {n}.'],
  talent_points_10: ['Specialist', 'Spezialist', 'Spend {n} talent points.', 'Gib {n} Talentpunkte aus.'],
  talent_points_50: ['Grand Machinist', 'Großmeister der Technik', 'Spend {n} talent points.', 'Gib {n} Talentpunkte aus.'],
  garage_fleet_3: ['Small Fleet', 'Kleine Flotte', 'Own {n} vehicles.', 'Besitze {n} Fahrzeuge.'],
  garage_fleet_8: ['Hangar Marshal', 'Hangar-Marschall', 'Own {n} vehicles.', 'Besitze {n} Fahrzeuge.'],
  mastery_rank_10: ['Vehicle Master', 'Fahrzeugmeister', 'Reach mastery rank {n} with a vehicle.', 'Erreiche mit einem Fahrzeug Meisterschaftsrang {n}.'],
  maps_visited_5: ['Wanderer', 'Wanderer', 'Visit {n} different maps.', 'Besuche {n} verschiedene Karten.'],
  maps_visited_15: ['Traveler', 'Reisender', 'Visit {n} different maps.', 'Besuche {n} verschiedene Karten.'],
  maps_visited_30: ['Frontier Cartographer', 'Grenzland-Kartograf', 'Visit all {n} maps.', 'Besuche alle {n} Karten.'],
  portal_jumps_25: ['Portal Hopper', 'Portalspringer', 'Use portals {n} times.', 'Nutze Portale {n} Mal.'],
  crates_collected_100: ['Crate Hunter', 'Kistenjäger', 'Collect {n} crates.', 'Sammle {n} Kisten ein.'],
  landmarks_discovered_10: ['Sightseer', 'Sehenswürdigkeiten-Jäger', 'Discover {n} landmarks.', 'Entdecke {n} Wahrzeichen.'],
  mining_nodes_50: ['Prospector', 'Schürfer', 'Mine {n} ore nodes.', 'Baue {n} Erzvorkommen ab.'],
  gates_cleared_6: ['Dungeon Breaker', 'Torbrecher', 'Clear {n} gates.', 'Räume {n} Tore.'],
  upgrade_item_5: ['Tinkerer', 'Tüftler', 'Upgrade an item to +{n}.', 'Rüste einen Gegenstand auf +{n} auf.'],
  upgrade_item_10: ['Engineer', 'Ingenieur', 'Upgrade an item to +{n}.', 'Rüste einen Gegenstand auf +{n} auf.'],
  upgrade_item_15: ['Perfectionist', 'Perfektionist', 'Upgrade an item to +{n}.', 'Rüste einen Gegenstand auf +{n} auf.'],
  items_dismantled_50: ['Scrapper', 'Verwerter', 'Dismantle {n} items.', 'Zerlege {n} Gegenstände.'],
  items_crafted_10: ['Apprentice Smith', 'Schmiedelehrling', 'Craft {n} items.', 'Stelle {n} Gegenstände her.'],
  fusion_success_5: ['Fusion Expert', 'Fusionsexperte', 'Fuse items successfully {n} times.', 'Fusioniere Gegenstände {n} Mal erfolgreich.'],
  reroll_affix_10: ['Gambler', 'Glücksspieler', 'Reroll item properties {n} times.', 'Würfle Gegenstandseigenschaften {n} Mal neu.'],
  legendary_equipped: ['Golden Core', 'Goldener Kern', 'Equip a legendary item.', 'Rüste einen legendären Gegenstand aus.'],
  scrap_earned_10k: ['Pocket Change', 'Kleingeld', 'Earn {n} scrap.', 'Verdiene {n} Schrott.'],
  scrap_earned_100k: ['Scrap Baron', 'Schrottbaron', 'Earn {n} scrap.', 'Verdiene {n} Schrott.'],
  scrap_earned_1m: ['Merchant Prince', 'Handelsfürst', 'Earn {n} scrap.', 'Verdiene {n} Schrott.'],
  market_sales_5: ['Street Vendor', 'Straßenhändler', 'Sell {n} items on the auction house.', 'Verkaufe {n} Gegenstände im Auktionshaus.'],
  market_sales_25: ['Market Regular', 'Marktstammgast', 'Sell {n} items on the auction house.', 'Verkaufe {n} Gegenstände im Auktionshaus.'],
  ore_stockpile_500: ['Ore Hoarder', 'Erzhorter', 'Hold {n} ore at once.', 'Halte {n} Erz gleichzeitig.'],
  reputation_level_7: ['Trusted Trader', 'Vertrauenswürdiger Händler', 'Reach reputation level {n}.', 'Erreiche Ansehensstufe {n}.'],
  pvp_kills_1: ['Border Skirmisher', 'Grenzscharmützler', 'Defeat a player in PvP.', 'Besiege einen Spieler im PvP.'],
  pvp_kills_25: ['Border Hunter', 'Grenzjäger', 'Defeat {n} players in PvP.', 'Besiege {n} Spieler im PvP.'],
  pvp_kills_100: ['Warlord', 'Kriegsherr', 'Defeat {n} players in PvP.', 'Besiege {n} Spieler im PvP.'],
  honor_rank_captain: ['Captain', 'Hauptmann', 'Reach the honor rank Captain.', 'Erreiche den Ehrenrang Hauptmann.'],
  honor_rank_general: ['General', 'General', 'Reach the honor rank General.', 'Erreiche den Ehrenrang General.'],
  control_point_caps_10: ['Point Taker', 'Punkteeroberer', 'Capture control points {n} times.', 'Erobere Kontrollpunkte {n} Mal.'],
  arena_wins_10: ['Arena Contender', 'Arena-Anwärter', 'Win {n} arena matches.', 'Gewinne {n} Arena-Matches.'],
  arena_gold_league: ['Gladiator Prime', 'Gladiator Prime', 'Reach the Gold league in the arena.', 'Erreiche die Gold-Liga in der Arena.'],
};

/** German names of the titles that achievements and the season pass hand out (keyed by the English title). */
export const TITLE_DE: Record<string, string> = {
  'Apex Centurion': 'Spitzen-Zenturio', 'Armored Scourge': 'Gepanzerte Geißel', 'Border Hunter': 'Grenzjäger', 'Dungeon Breaker': 'Torbrecher', 'Eliminator': 'Auslöscher',
  'Faction Honored': 'Fraktionsgeehrter', 'Flank Raider': 'Flankenräuber', 'Frontier Cartographer': 'Grenzland-Kartograf', 'Gladiator Prime': 'Gladiator Prime', 'Golden Core': 'Goldener Kern',
  'Goliath Bane': 'Goliath-Schreck', 'Grand Machinist': 'Großmeister der Technik', 'Hangar Marshal': 'Hangar-Marschall', 'Iron Reaper': 'Eiserner Schnitter', 'Merchant Prince': 'Handelsfürst',
  'Scrap Baron': 'Schrottbaron', 'Tank Master': 'Panzermeister', 'Titan Slayer': 'Titanentöter', 'Veteran Driver': 'Veteranenfahrer', 'Warlord': 'Kriegsherr',
  'Season Veteran': 'Saison-Veteran', 'Season Champion': 'Saison-Champion',
};

const RANK_DE: Record<string, string> = {
  recruit: 'Rekrut', private: 'Gefreiter', corporal: 'Obergefreiter', sergeant: 'Unteroffizier', staff_sergeant: 'Stabsunteroffizier', master_sergeant: 'Oberstabsfeldwebel', warrant_officer: 'Stabsfeldwebel',
  second_lieutenant: 'Leutnant', lieutenant: 'Oberleutnant', captain: 'Hauptmann', major: 'Major', lieutenant_colonel: 'Oberstleutnant', colonel: 'Oberst', brigadier: 'Brigadegeneral',
  major_general: 'Generalmajor', lieutenant_general: 'Generalleutnant', general: 'General', field_marshal: 'Feldmarschall', marshal_of_the_realm: 'Reichsmarschall', high_marshal: 'Hochmarschall', supreme_marshal: 'Oberster Marschall',
};
const RANK_EN: Record<string, string> = {
  recruit: 'Recruit', private: 'Private', corporal: 'Corporal', sergeant: 'Sergeant', staff_sergeant: 'Staff Sergeant', master_sergeant: 'Master Sergeant', warrant_officer: 'Warrant Officer',
  second_lieutenant: 'Second Lieutenant', lieutenant: 'Lieutenant', captain: 'Captain', major: 'Major', lieutenant_colonel: 'Lieutenant Colonel', colonel: 'Colonel', brigadier: 'Brigadier',
  major_general: 'Major General', lieutenant_general: 'Lieutenant General', general: 'General', field_marshal: 'Field Marshal', marshal_of_the_realm: 'Marshal of the Realm', high_marshal: 'High Marshal', supreme_marshal: 'Supreme Marshal',
};

export function buildProgressNames(): Table {
  const out: Table = {};
  for (const q of ALL_QUESTS) out[q.nameKey] = { en: q.name, de: questDe(q.nameKey) };
  for (const t of TALENTS_CATALOG) {
    const x = TALENT[t.id];
    out[t.nameKey] = { en: x[0], de: x[1] };
    out[t.descKey] = { en: x[2], de: x[3] };
  }
  for (const a of ACHIEVEMENTS_CATALOG) {
    const x = ACH[a.id.replace(/^ach_/, '')];
    const n = a.targetValue.toLocaleString('en-US'); const nde = a.targetValue.toLocaleString('de-DE');
    out[a.nameKey] = { en: x[0], de: x[1] };
    out[a.descKey] = { en: x[2].replace('{n}', n), de: x[3].replace('{n}', nde) };
  }
  for (const r of RANKS_CATALOG) {
    const id = r.nameKey.replace(/^rank\./, '').replace(/\.name$/, '');
    out[r.nameKey] = { en: RANK_EN[id], de: RANK_DE[id] };
    out[r.titleKey] = { en: RANK_EN[id], de: RANK_DE[id] };
  }
  return out;
}

export type { Pair };
