/** English + German names/descriptions for maps, enemies, bosses, gates and world events. */
import { MAP_METADATA_TABLE } from '../maps.ts';
import { ENEMY_ARCHETYPES, BOSS_CATALOG } from '../enemies.ts';
import { DUNGEONS } from '../dungeons.ts';
import { EVENT_RULES } from '../../sim/events.ts';
import type { Pair, Table } from './gear.ts';

const MAPS_DE: Record<number, [string, string]> = {
  1: ['Kiesbucht', 'Heimathafen des Küstenbunds. Sanfte Gezeiten und sandige Kiesflächen.'],
  2: ['Dünenpfad', 'Wellige Küstendünen, auf denen Plünderer-Buggys patrouillieren.'],
  3: ['Salzmarsch', 'Brackige Feuchtgebiete, in denen Fahrzeuge durch bremsende Wasserrinnen waten.'],
  4: ['Leuchtturmkap', 'Ein hoch aufragendes Leuchtturm-Kap, das den Tunnel nach Kreuzfeld bewacht.'],
  5: ['Birkental', 'Heimatbasis des Hochlandbunds, eingebettet in dichte Birkenhaine und Granithügel.'],
  6: ['Steinbruchtal', 'Ein alter Tagebau-Steinbruch voller Eisenerzadern.'],
  7: ['Nebelwald', 'Ein dichter Kiefernwald im Hochland, den ständiger Bergnebel einhüllt.'],
  8: ['Adlerpass', 'Ein befestigter Gebirgspass, der das Hochland mit den zentralen Ebenen verbindet.'],
  9: ['Weizenmeer', 'Heimatbasis der Steppenkarawane. Weite goldene Getreidefelder und Handelsdepots.'],
  10: ['Kupferschlucht', 'Gewundene rötliche Schluchtsohlen, reich an Kupfervorkommen.'],
  11: ['Salzpfannen', 'Blendend weiße Salzebenen, über die Staubteufel fegen.'],
  12: ['Windmühlenplateau', 'Ein hohes, windumtostes Tafelland voller Stromgeneratoren und Konvoi-Knoten.'],
  13: ['Kreuzfeld-Knotenpunkt', 'Die große zentrale Sicherheitsstadt. Mit Werkstatt, Auktionshaus und Arena-Portal.'],
  14: ['Grüne Kreuzung', 'Wichtiger Verkehrsknoten, auf dem regelmäßig Versorgungskonvois fahren.'],
  15: ['Flussdelta', 'Verzweigte Flussarme und schlammige Untiefen, die den Bodenhalt verschlechtern.'],
  16: ['Rote Schlucht', 'Hohe ockerfarbene Klippen, von denen verschanzte Artillerie die Straßen beschießt.'],
  17: ['Frostgrenze', 'Eisige Gebirgsausläufer, die von heftigen Schneestürmen heimgesucht werden.'],
  18: ['Gletscherseen', 'Kristallblaue Gletschertümpel und dünne Eisdecken, die die Beweglichkeit bremsen.'],
  19: ['Alte Fernstraße', 'Eine uralte, rissige Schnellstraße, auf der der umherziehende Weltboss erscheint.'],
  20: ['Glühwurmsumpf', 'Ein unheimlicher nächtlicher Sumpf mit leuchtenden Sporen und seltenen Ausrüstungsfunden.'],
  21: ['Brückenkopf Alpha', 'Umkämpfter Hängebrücken-Brückenkopf über dem Schluchtabgrund. Fraktions-PvP ist aktiv.'],
  22: ['Zollstation', 'Befestigter Grenzposten mit Wachtürmen und umkämpften Kontrollpunkten.'],
  23: ['Aschefeld', 'Dichte vulkanische Aschefelder mit extrem reichen Titan- und Kristalladern.'],
  24: ['Niemandsland', 'Das zerlöcherte Schlachtfeld des wöchentlichen Fraktionskriegs um Kontrollpunkte.'],
  25: ['Ruinenstadt Vaelmar', 'Eine gefallene Hightech-Metropole mit zerborstenen Wolkenkratzern und Elite-Mechs.'],
  26: ['Obsidianwüste', 'Glänzende schwarze Glasdünen, die von gewaltigen Silikatstürmen gepeitscht werden.'],
  27: ['Sturmküste', 'Tosende Taifun-Klippen mit zufälligen Blitzeinschlägen und dem Koloss-Boss.'],
  28: ['Eiserne Krone', 'Ein Ring aus glühenden Eisengießereien und Torbunkern.'],
  29: ['Das Brennende Tal', 'Die Endgame-Caldera, in der die legendärsten Kriegsmaschinen umherstreifen.'],
  30: ['Die Grube', 'Eine abgeschlossene Gladiatorenarena für Ranglistenkämpfe im 1v1, 3v3 und 5v5.'],
};

const ENEMY_DE: Record<string, [string, string, string]> = {
  // id: [German name, English description, German description]
  scout_buggy: ['Aufklärungsbuggy', 'Agile reconnaissance buggy armed with twin light machine guns.', 'Wendiger Erkundungsbuggy mit Zwillingsmaschinengewehren.'],
  gunner_truck: ['Kanonentruck', 'Armored gun truck with a high-caliber rapid autocannon.', 'Gepanzerter Truck mit schnellfeuernder Maschinenkanone.'],
  artillery: ['Belagerungsartillerie', 'Long-range mortar carrier capable of catastrophic bombardment.', 'Mörserträger mit großer Reichweite, der verheerendes Bombardement liefert.'],
  bunker_turret: ['Bunkerfestung', 'Heavily fortified stationary defense bunker guarding key sectors.', 'Schwer befestigter, ortsfester Verteidigungsbunker, der wichtige Sektoren bewacht.'],
  flak_wagon: ['Flak-Wagen', 'Multi-barrel flak battery designed for continuous suppression fire.', 'Mehrläufige Flak-Batterie für dauerhaftes Unterdrückungsfeuer.'],
  engineer: ['Kampfpionier', 'Specialized support vehicle deploying area denial mines.', 'Spezialisiertes Unterstützungsfahrzeug, das Minen zur Gebietssperrung legt.'],
  loot_convoy: ['Schwerer Frachtkonvoi', 'Armored supply transport laden with rare technology and ore caches.', 'Gepanzerter Versorgungstransport voller seltener Technik und Erzlager.'],
  ice_tank: ['Frostgleiter', 'Cold-adapted snow tank with cryogenic treads.', 'An die Kälte angepasster Schneepanzer mit Kryo-Ketten.'],
  swamp_crawler: ['Morastkriecher', 'All-terrain marsh vehicle outfitted with heavy plating.', 'Geländegängiges Sumpffahrzeug mit schwerer Panzerung.'],
  lava_truck: ['Glutbrecher', 'Heat-shielded assault vehicle built for the Burning Valley.', 'Hitzegeschütztes Sturmfahrzeug, gebaut für das Brennende Tal.'],
  sandstorm_raider: ['Dünengleiter', 'Lightweight hover-skimmer traversing sand dunes at breakneck speeds.', 'Leichter Schwebegleiter, der mit halsbrecherischem Tempo über Sanddünen fegt.'],
};

const BOSS_DE: Record<string, string> = {
  boss_cape_warden: 'Eiserner Wächter vom Kap der Einsamkeit',
  boss_eagle_colossus: 'Himmelsbrecher vom Adlerpass',
  boss_windmill_goliath: 'Herrscher der Steppenwindmühle',
  boss_highway_behemoth: 'Fernstraßen-Moloch Rex',
  boss_storm_coast_leviathan: 'Dreadnought der Sturmküste',
};

const GATE_DE: Record<string, [string, string]> = {
  gate_rusted_depot: ['Rostiges Depot', 'Depot-Aufseher'],
  gate_quarry_hold: ['Steinbruchfeste', 'Steinbruch-Brecher'],
  gate_windmill_bastion: ['Windmühlenbastion', 'Bastionsherr'],
  gate_frozen_foundry: ['Gefrorene Gießerei', 'Gießerei-Koloss'],
  gate_glowworm_sump: ['Glühwurm-Senke', 'Senken-Matriarchin'],
  gate_iron_crown_vault: ['Tresor der Eisernen Krone', 'Herrscher des Tresors'],
};

const EVENTS: Record<string, { name: Pair; notice: Pair }> = {
  invasion: { name: { en: 'Invasion', de: 'Invasion' }, notice: { en: 'Raiders are attacking the starter zones!', de: 'Plünderer greifen die Startgebiete an!' } },
  convoy_race: { name: { en: 'Convoy Race', de: 'Konvoi-Rennen' }, notice: { en: 'Supply convoys are racing across the central roads.', de: 'Versorgungskonvois rasen über die zentralen Straßen.' } },
  storm_event: { name: { en: 'Storm', de: 'Sturm' }, notice: { en: 'A violent storm sweeps the frozen lands.', de: 'Ein heftiger Sturm fegt über die Frostlande.' } },
  meteor_shower: { name: { en: 'Meteor Shower', de: 'Meteoritenschauer' }, notice: { en: 'Meteors are falling. Rare ore is up for grabs!', de: 'Meteoriten schlagen ein. Seltenes Erz liegt bereit!' } },
  weekend_xp: { name: { en: 'Weekend XP', de: 'Wochenend-EP' }, notice: { en: 'Weekend bonus: 50 % more experience.', de: 'Wochenend-Bonus: 50 % mehr Erfahrung.' } },
};

export const EVENT_KINDS = [...EVENT_RULES.map((r) => r.kind as string), 'weekend_xp'];

export function buildWorldNames(): Table {
  const out: Table = {};
  for (const m of Object.values(MAP_METADATA_TABLE)) {
    const de = MAPS_DE[m.id];
    out[m.nameKey] = { en: m.name, de: de[0] };
    out[`${m.nameKey}.desc`] = { en: m.description, de: de[1] };
  }
  for (const e of Object.values(ENEMY_ARCHETYPES)) {
    const de = ENEMY_DE[e.id];
    if (!de) continue;
    out[e.nameKey] = { en: e.displayName, de: de[0] };
    if (e.descriptionKey) out[e.descriptionKey] = { en: de[1], de: de[2] };
  }
  for (const b of BOSS_CATALOG) out[b.nameKey] = { en: b.name, de: BOSS_DE[b.id] };
  for (const d of DUNGEONS) {
    const de = GATE_DE[d.id];
    out[d.nameKey] = { en: d.name, de: de[0] };
    out[d.boss.nameKey] = { en: d.boss.name, de: de[1] };
  }
  for (const [kind, v] of Object.entries(EVENTS)) {
    out[`event.${kind}.name`] = v.name;
    out[`event.${kind}.notice`] = v.notice;
  }
  return out;
}
