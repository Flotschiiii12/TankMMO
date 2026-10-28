/**
 * English + German display names and descriptions for vehicles and items, keyed by the `nameKey` / `descriptionKey`
 * of the data tables. Names are composed from small tables so a new tier or family needs one new row, not 50 strings.
 */
import { VEHICLE_CATALOG, TIER_CONFIGS } from '../vehicles.ts';
import { ITEM_CATALOG } from '../items.ts';
import { AFFIX_POOL } from '../affixes.ts';

export type Pair = { en: string; de: string };
export type Table = Record<string, Pair>;

const CLASS_NAME: Record<string, Pair> = {
  scout: { en: 'Scout', de: 'Aufklärer' },
  medium: { en: 'Medium', de: 'Kampfpanzer' },
  heavy: { en: 'Heavy', de: 'Schwerpanzer' },
  artillery: { en: 'Artillery', de: 'Artillerie' },
  support: { en: 'Support', de: 'Unterstützer' },
};

const CLASS_BLURB: Record<string, Pair> = {
  scout: { en: 'Fast and light. Dash to close in or break away.', de: 'Schnell und leicht. Mit dem Spurt kommst du ran oder wieder weg.' },
  medium: { en: 'Balanced all-rounder with Overcharge.', de: 'Ausgewogener Allrounder mit Überlastung.' },
  heavy: { en: 'Slow, thick armor and extra slots. Fortify to hold the line.', de: 'Langsam, dick gepanzert und mit Extra-Plätzen. Mit der Festung hältst du die Linie.' },
  artillery: { en: 'Long range splash damage, fragile. Barrage hits a marked area.', de: 'Große Reichweite und Flächenschaden, aber zerbrechlich. Das Sperrfeuer trifft ein markiertes Gebiet.' },
  support: { en: 'Repair aura and radar for the group, low damage.', de: 'Reparaturfeld und Radar für die Gruppe, wenig Schaden.' },
};

const TIER_NAME_DE = ['Flickwerk', 'Drifter', 'Wanderer', 'Wächter', 'Stürmer', 'Bollwerk', 'Eroberer', 'Behemoth', 'Titan', 'Koloss'];
const TIER_FLAVOR: Pair[] = [
  { en: 'Welded together from scrap.', de: 'Aus Schrott zusammengeschweißt.' },
  { en: 'A rugged road warrior.', de: 'Ein zäher Straßenkämpfer.' },
  { en: 'Built for long patrols.', de: 'Gebaut für lange Patrouillen.' },
  { en: 'Holds the front line.', de: 'Hält die Front.' },
  { en: 'Hits hard and fast.', de: 'Schlägt hart und schnell zu.' },
  { en: 'A rolling fortress.', de: 'Eine rollende Festung.' },
  { en: 'Made to take territory.', de: 'Gebaut, um Gebiete zu erobern.' },
  { en: 'Massive and relentless.', de: 'Gewaltig und unaufhaltsam.' },
  { en: 'Very little stops it.', de: 'Kaum etwas hält ihn auf.' },
  { en: 'The pinnacle of tank engineering.', de: 'Der Gipfel der Panzerbaukunst.' },
];

const FAMILY: Record<string, Pair & { desc: Pair }> = {
  cannon: { en: 'Cannon', de: 'Kanone', desc: { en: 'Balanced main gun: solid damage, medium reload and range.', de: 'Ausgewogene Hauptwaffe: solider Schaden, mittlere Nachladezeit und Reichweite.' } },
  rapid_fire: { en: 'Rapid-Fire Gun', de: 'Schnellfeuergeschütz', desc: { en: 'Very fast reload, but shorter range.', de: 'Sehr schnelles Nachladen, dafür kürzere Reichweite.' } },
  rocket: { en: 'Rocket Launcher', de: 'Raketenwerfer', desc: { en: 'Heavy-hitting rockets with a slow reload and good range.', de: 'Wuchtige Raketen mit langsamer Nachladezeit und guter Reichweite.' } },
  mortar: { en: 'Mortar', de: 'Mörser', desc: { en: 'Very long range with a slow reload.', de: 'Sehr große Reichweite bei langsamer Nachladezeit.' } },
  railgun: { en: 'Railgun', de: 'Schienenkanone', desc: { en: 'Highest damage and longest range, but a very slow reload.', de: 'Höchster Schaden und größte Reichweite, aber sehr langsames Nachladen.' } },
  flamethrower: { en: 'Flamethrower', de: 'Flammenwerfer', desc: { en: 'Very short range, relentless fire.', de: 'Sehr kurze Reichweite, dafür unablässiges Feuer.' } },
  machine_gun: { en: 'Machine Gun', de: 'Maschinengewehr', desc: { en: 'Secondary gun for steady extra damage.', de: 'Sekundärwaffe für stetigen Zusatzschaden.' } },
  flak: { en: 'Flak Gun', de: 'Flak-Geschütz', desc: { en: 'Secondary flak battery for extra damage.', de: 'Sekundäre Flak-Batterie für Zusatzschaden.' } },
  mine_layer: { en: 'Mine Layer', de: 'Minenleger', desc: { en: 'Secondary mine layer for extra damage.', de: 'Sekundärer Minenleger für Zusatzschaden.' } },
  arc_coil: { en: 'Arc Coil', de: 'Lichtbogenspule', desc: { en: 'Secondary arc coil for extra damage.', de: 'Sekundäre Lichtbogenspule für Zusatzschaden.' } },
  reactive_armor: { en: 'Reactive Armor', de: 'Reaktivpanzerung', desc: { en: 'Armor plating that adds protection to your vehicle.', de: 'Panzerplatten, die deinem Fahrzeug zusätzlichen Schutz geben.' } },
  composite_armor: { en: 'Composite Armor', de: 'Verbundpanzerung', desc: { en: 'Layered armor plating with plenty of protection.', de: 'Geschichtete Panzerplatten mit viel Schutz.' } },
  sloped_armor: { en: 'Sloped Armor', de: 'Schrägpanzerung', desc: { en: 'Angled armor plating for extra protection.', de: 'Schräge Panzerplatten für zusätzlichen Schutz.' } },
  cage_armor: { en: 'Cage Armor', de: 'Gitterpanzerung', desc: { en: 'Standoff cage armor for extra protection.', de: 'Gitterpanzerung auf Abstand für zusätzlichen Schutz.' } },
  speed_engine: { en: 'Speed Engine', de: 'Sprintmotor', desc: { en: 'Engine upgrade for a higher top speed.', de: 'Motor-Upgrade für eine höhere Höchstgeschwindigkeit.' } },
  torque_engine: { en: 'Torque Engine', de: 'Drehmomentmotor', desc: { en: 'Engine upgrade for stronger acceleration.', de: 'Motor-Upgrade für kräftigere Beschleunigung.' } },
  efficiency_engine: { en: 'Efficiency Engine', de: 'Sparmotor', desc: { en: 'Engine upgrade for steady all-round performance.', de: 'Motor-Upgrade für gleichmäßige Leistung auf ganzer Linie.' } },
};

const MODULE: Record<string, Pair & { desc: Pair }> = {
  auto_repair: { en: 'Auto Repair', de: 'Selbstreparatur', desc: { en: 'Boosts your hull.', de: 'Erhöht deinen Rumpf.' } },
  radar_range: { en: 'Radar Range', de: 'Radarverstärker', desc: { en: 'Utility module for a bigger radar range.', de: 'Hilfsmodul für eine größere Radarreichweite.' } },
  loot_magnet: { en: 'Loot Magnet', de: 'Beutemagnet', desc: { en: 'Utility module that pulls loot in from further away.', de: 'Hilfsmodul, das Beute aus größerer Entfernung anzieht.' } },
  smoke_amplifier: { en: 'Smoke Amplifier', de: 'Nebelverstärker', desc: { en: 'Utility module for longer smoke screens.', de: 'Hilfsmodul für länger anhaltende Nebelwände.' } },
  targeting_aid: { en: 'Targeting Aid', de: 'Zielhilfe', desc: { en: 'Raises your critical hit chance.', de: 'Erhöht deine Chance auf kritische Treffer.' } },
  emergency_shield: { en: 'Emergency Shield', de: 'Notfallschild', desc: { en: 'Boosts your hull and unlocks the Emergency Shield ability.', de: 'Erhöht deinen Rumpf und schaltet die Fähigkeit Notfallschild frei.' } },
  camo_net: { en: 'Camo Net', de: 'Tarnnetz', desc: { en: 'Utility module that makes you harder to spot.', de: 'Hilfsmodul, das dich schwerer zu entdecken macht.' } },
  fuel_saver: { en: 'Fuel Saver', de: 'Spritsparer', desc: { en: 'Gives a little extra speed.', de: 'Gibt ein wenig zusätzliches Tempo.' } },
  ammo_drum: { en: 'Ammo Drum', de: 'Munitionstrommel', desc: { en: 'Raises your damage output.', de: 'Erhöht deinen Schadensausstoß.' } },
  reinforced_tracks: { en: 'Reinforced Tracks', de: 'Verstärkte Ketten', desc: { en: 'Raises your top speed.', de: 'Erhöht deine Höchstgeschwindigkeit.' } },
  stabilizer: { en: 'Stabilizer', de: 'Stabilisator', desc: { en: 'Extends your main gun range.', de: 'Vergrößert die Reichweite deiner Hauptwaffe.' } },
  fire_extinguisher: { en: 'Fire Extinguisher', de: 'Feuerlöscher', desc: { en: 'Utility module against burning.', de: 'Hilfsmodul gegen Brände.' } },
  overclocker: { en: 'Overclocker', de: 'Übertakter', desc: { en: 'Speeds up your reload.', de: 'Beschleunigt dein Nachladen.' } },
  energy_absorber: { en: 'Energy Absorber', de: 'Energieabsorber', desc: { en: 'Reduces every hit by a flat amount.', de: 'Verringert jeden Treffer um einen festen Betrag.' } },
  blast_shield: { en: 'Blast Shield', de: 'Explosionsschild', desc: { en: 'Reduces every hit by a flat amount.', de: 'Verringert jeden Treffer um einen festen Betrag.' } },
  optics_suite: { en: 'Optics Suite', de: 'Optikpaket', desc: { en: 'Extends your main gun range.', de: 'Vergrößert die Reichweite deiner Hauptwaffe.' } },
  plating_hardener: { en: 'Plating Hardener', de: 'Panzerungshärter', desc: { en: 'Boosts your armor.', de: 'Erhöht deine Panzerung.' } },
  salvage_arm: { en: 'Salvage Arm', de: 'Bergungsarm', desc: { en: 'Utility module for salvaging.', de: 'Hilfsmodul zum Bergen von Material.' } },
  drone_beacon: { en: 'Drone Beacon', de: 'Drohnenbake', desc: { en: 'Utility module that supports your drones.', de: 'Hilfsmodul, das deine Drohnen unterstützt.' } },
  stealth_jammer: { en: 'Stealth Jammer', de: 'Tarnstörsender', desc: { en: 'Utility module that disturbs enemy targeting.', de: 'Hilfsmodul, das das gegnerische Zielen stört.' } },
};

const DRONE: Record<string, Pair & { desc: Pair }> = {
  guardian: { en: 'Guardian Drone', de: 'Wächter-Drohne', desc: { en: 'Defensive drone that stays close to you.', de: 'Verteidigungsdrohne, die in deiner Nähe bleibt.' } },
  sentinel: { en: 'Sentinel Drone', de: 'Posten-Drohne', desc: { en: 'Drone that keeps watch and supports you in combat.', de: 'Drohne, die Wache hält und dich im Kampf unterstützt.' } },
  repair_bot: { en: 'Repair Bot Drone', de: 'Reparaturdrohne', desc: { en: 'Drone that helps repair your vehicle.', de: 'Drohne, die bei der Reparatur deines Fahrzeugs hilft.' } },
  recon: { en: 'Recon Drone', de: 'Aufklärungsdrohne', desc: { en: 'Scouting drone for a wider view.', de: 'Aufklärungsdrohne für einen weiteren Überblick.' } },
  arc_drone: { en: 'Arc Drone', de: 'Lichtbogendrohne', desc: { en: 'Attack drone with electric arcs.', de: 'Angriffsdrohne mit Lichtbögen.' } },
  sapper: { en: 'Sapper Drone', de: 'Pionierdrohne', desc: { en: 'Support drone for dirty work at the front.', de: 'Unterstützungsdrohne für die Drecksarbeit an der Front.' } },
  interceptor: { en: 'Interceptor Drone', de: 'Abfangdrohne', desc: { en: 'Drone that helps against incoming fire.', de: 'Drohne, die gegen anfliegendes Feuer hilft.' } },
  aegis: { en: 'Aegis Drone', de: 'Aegis-Drohne', desc: { en: 'Drone that adds a protective field.', de: 'Drohne, die ein Schutzfeld hinzufügt.' } },
};

const AFFIX: Record<string, Pair> = {
  dps: { en: 'Damage', de: 'Schaden' }, hull: { en: 'Hull', de: 'Rumpf' }, armor: { en: 'Armor', de: 'Panzerung' }, speed: { en: 'Speed', de: 'Tempo' },
  crit_chance: { en: 'Crit chance', de: 'Krit-Chance' }, flat_reduction: { en: 'Flat reduction', de: 'Schadensminderung' }, reload_speed: { en: 'Reload speed', de: 'Nachladetempo' }, range: { en: 'Range', de: 'Reichweite' },
};

export function buildGearNames(): Table {
  const out: Table = {};
  for (const a of AFFIX_POOL) out[a.nameKey] = AFFIX[a.stat];
  for (const v of VEHICLE_CATALOG) {
    const tierEn = TIER_CONFIGS[v.tier - 1].name;
    const cls = CLASS_NAME[v.vehicleClass];
    out[v.nameKey] = { en: `${tierEn} ${cls.en}`, de: `${TIER_NAME_DE[v.tier - 1]}-${cls.de}` };
    const fl = TIER_FLAVOR[v.tier - 1]; const bl = CLASS_BLURB[v.vehicleClass];
    out[v.descriptionKey] = { en: `${bl.en} ${fl.en}`, de: `${bl.de} ${fl.de}` };
  }
  for (const it of ITEM_CATALOG) {
    if (it.family === 'module') {
      const id = it.id.replace(/^mod_/, ''); const m = MODULE[id];
      if (m) { out[it.nameKey] = { en: m.en, de: m.de }; out[it.descriptionKey] = m.desc; }
    } else if (it.family === 'drone') {
      const id = it.id.replace(/^drn_/, '').replace(/_t\d+$/, ''); const d = DRONE[id];
      if (d) { out[it.nameKey] = { en: d.en, de: d.de }; out[it.descriptionKey] = d.desc; }
    } else {
      const f = FAMILY[it.family];
      if (f) { out[it.nameKey] = { en: `${f.en} T${it.tier}`, de: `${f.de} T${it.tier}` }; out[it.descriptionKey] = f.desc; }
    }
  }
  return out;
}
