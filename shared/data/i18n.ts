/**
 * Treadfront - Internationalization (i18n) Layer (Section 0)
 * Dual-language dictionary: English (en) and German (de).
 * All player-facing text keys resolve through here.
 */

import { NAMES_DE, NAMES_EN } from './names/index.ts';

export type LanguageCode = 'en' | 'de';

const HAND_WRITTEN: Record<LanguageCode, Record<string, string>> = {
  en: {
    // Classes
    'class.scout': 'Scout',
    'class.medium': 'Medium',
    'class.heavy': 'Heavy',
    'class.artillery': 'Artillery',
    'class.support': 'Support',

    // Tiers
    'tier.1': 'Patchwork',
    'tier.2': 'Drifter',
    'tier.3': 'Wanderer',
    'tier.4': 'Warden',
    'tier.5': 'Striker',
    'tier.6': 'Bulwark',
    'tier.7': 'Conqueror',
    'tier.8': 'Behemoth',
    'tier.9': 'Titan',
    'tier.10': 'Colossus',

    // Ammo
    'ammo.standard': 'Standard Solid Shell',
    'ammo.reinforced': 'Reinforced Heavy Munition',
    'ammo.armor_piercing': 'High-Velocity Sabot (AP)',
    'ammo.shaped_charge': 'Shaped Charge (HEAT)',
    'ammo.explosive': 'High-Explosive Splash (HE)',

    // Abilities
    'ability.smoke': 'Smoke Screen',
    'ability.repair_kit': 'Field Repair Kit',
    'ability.boost': 'Overdrive Booster',
    'ability.radar_pulse': 'Radar Pulse',
    'ability.emergency_shield': 'Emergency Shield',
    'ability.dash': 'Tactical Dash',
    'ability.overcharge': 'Reactor Overcharge',
    'ability.fortify': 'Fortify Stance',
    'ability.barrage': 'Artillery Barrage',
    'ability.repair_aura': 'Repair Nanite Field',

    // Enemies
    'enemy.scout_buggy.name': 'Scout Buggy',
    'enemy.scout_buggy.desc': 'Agile reconnaissance buggy armed with twin light machine guns.',
    'enemy.gunner_truck.name': 'Gunner Truck',
    'enemy.gunner_truck.desc': 'Armored gun truck with a high-caliber rapid autocannon.',
    'enemy.artillery.name': 'Siege Artillery',
    'enemy.artillery.desc': 'Long-range mortar carrier capable of catastrophic bombardment.',
    'enemy.bunker_turret.name': 'Bunker Fortress',
    'enemy.bunker_turret.desc': 'Heavily fortified stationary defense bunker guarding key sectors.',
    'enemy.flak_wagon.name': 'Flak Wagon',
    'enemy.flak_wagon.desc': 'Multi-barrel flak battery designed for continuous suppression fire.',
    'enemy.engineer.name': 'Combat Engineer',
    'enemy.engineer.desc': 'Specialized support vehicle deploying area denial mines.',
    'enemy.loot_convoy.name': 'Heavy Cargo Convoy',
    'enemy.loot_convoy.desc': 'Armored supply transport laden with rare technology and ore caches.',
    'enemy.ice_tank.name': 'Frost Glider',
    'enemy.ice_tank.desc': 'Cold-adapted snow tank with cryogenic treads.',
    'enemy.swamp_crawler.name': 'Muck Crawler',
    'enemy.swamp_crawler.desc': 'All-terrain marsh vehicle outfitted with heavy plating.',
    'enemy.lava_truck.name': 'Pyre Smasher',
    'enemy.lava_truck.desc': 'Heat-shielded assault vehicle built for the Burning Valley.',
    'enemy.sandstorm_raider.name': 'Dune Skimmer',
    'enemy.sandstorm_raider.desc': 'Lightweight hover-skimmer traversing sand dunes at breakneck speeds.',

    // Ranks
    'rank.recruit.name': 'Recruit',
    'rank.private.name': 'Private',
    'rank.corporal.name': 'Corporal',
    'rank.sergeant.name': 'Sergeant',
    'rank.staff_sergeant.name': 'Staff Sergeant',
    'rank.master_sergeant.name': 'Master Sergeant',
    'rank.warrant_officer.name': 'Warrant Officer',
    'rank.second_lieutenant.name': 'Second Lieutenant',
    'rank.lieutenant.name': 'Lieutenant',
    'rank.captain.name': 'Captain',
    'rank.major.name': 'Major',
    'rank.lieutenant_colonel.name': 'Lieutenant Colonel',
    'rank.colonel.name': 'Colonel',
    'rank.brigadier.name': 'Brigadier',
    'rank.major_general.name': 'Major General',
    'rank.lieutenant_general.name': 'Lieutenant General',
    'rank.general.name': 'General',
    'rank.field_marshal.name': 'Field Marshal',
    'rank.marshal_of_the_realm.name': 'Marshal of the Realm',
    'rank.high_marshal.name': 'High Marshal',
    'rank.supreme_marshal.name': 'Supreme Marshal',

    // UI
    'ui.target': 'TARGET',
    'ui.fire': 'FIRE',
    'ui.auto_fire': 'AUTO FIRE',
    'ui.hull': 'Hull',
    'ui.armor': 'Armor',
    'ui.level': 'Level',
    'ui.scrap': 'Scrap',
    'ui.ore': 'Ore',
    'ui.honor': 'Honor',
    'ui.safe_zone': 'SAFE ZONE',
    'ui.safe_zone_tip': 'Weapons offline. Automatic field repairs active.',
    'ui.garage': 'Garage',
    'ui.inventory': 'Inventory',
    'ui.workshop': 'Workshop',
    'ui.talents': 'Talents',
    'ui.world_map': 'World Map',
    'ui.quests': 'Quests',
    'ui.settings': 'Settings',
  },
  de: {
    // Classes
    'class.scout': 'Aufklärer',
    'class.medium': 'Mittlerer Panzer',
    'class.heavy': 'Schwerer Panzer',
    'class.artillery': 'Artillerie',
    'class.support': 'Unterstützer',

    // Tiers
    'tier.1': 'Flickwerk',
    'tier.2': 'Drifter',
    'tier.3': 'Wanderer',
    'tier.4': 'Wächter',
    'tier.5': 'Stürmer',
    'tier.6': 'Bollwerk',
    'tier.7': 'Eroberer',
    'tier.8': 'Behemoth',
    'tier.9': 'Titan',
    'tier.10': 'Koloss',

    // Ammo
    'ammo.standard': 'Standard-Vollgeschoss',
    'ammo.reinforced': 'Verstärkte Schwerlastmunition',
    'ammo.armor_piercing': 'Wuchtgeschoss (AP)',
    'ammo.shaped_charge': 'Hohlladungsgeschoss (HEAT)',
    'ammo.explosive': 'Sprenggranate (HE)',

    // Abilities
    'ability.smoke': 'Nebelwand',
    'ability.repair_kit': 'Feldreparatursatz',
    'ability.boost': 'Übersteuerungsbooster',
    'ability.radar_pulse': 'Radarimpuls',
    'ability.emergency_shield': 'Notfallschild',
    'ability.dash': 'Taktischer Spurt',
    'ability.overcharge': 'Reaktorüberlastung',
    'ability.fortify': 'Belagerungsfestung',
    'ability.barrage': 'Artillerie-Sperrfeuer',
    'ability.repair_aura': 'Reparatur-Nanitenfeld',

    // Enemies
    'enemy.scout_buggy.name': 'Aufklärungsbuggy',
    'enemy.scout_buggy.desc': 'Wendiger Erkundungsbuggy mit Zwillingsmaschinengewehren.',
    'enemy.gunner_truck.name': 'Kanonentruck',
    'enemy.gunner_truck.desc': 'Gepanzerter Truck mit schnellfeuernder Maschinenkanone.',
    'enemy.artillery.name': 'Belagerungsartillerie',
    'enemy.artillery.desc': 'Weit reichender Mörserträger für verheerenden Flächenbeschuss.',
    'enemy.bunker_turret.name': 'Bunkerfestung',
    'enemy.bunker_turret.desc': 'Schwer befestigter Verteidigungsturm an Schlüsselpositionen.',
    'enemy.flak_wagon.name': 'Flak-Geschützwagen',
    'enemy.flak_wagon.desc': 'Mehrläufige Flugabwehrbatterie für kontinuierliches Sperrfeuer.',
    'enemy.engineer.name': 'Kampfpionier',
    'enemy.engineer.desc': 'Spezialfahrzeug zur Verlegung defensiver Minenfelder.',
    'enemy.loot_convoy.name': 'Schwerer Frachtkonvoi',
    'enemy.loot_convoy.desc': 'Gepanzerter Versorgungstransporter mit seltenen Bauteilen und Erz.',
    'enemy.ice_tank.name': 'Frostgleiter',
    'enemy.ice_tank.desc': 'Kälteangepasster Schneepanzer mit kryogenen Gleisketten.',
    'enemy.swamp_crawler.name': 'Sumpfkriecher',
    'enemy.swamp_crawler.desc': 'Geländegängiges Marschfahrzeug mit dicker Zusatzpanzerung.',
    'enemy.lava_truck.name': 'Glutbrecher',
    'enemy.lava_truck.desc': 'Hitzebeständiges Sturmgeschütz für das Brennende Tal.',
    'enemy.sandstorm_raider.name': 'Dünengleiter',
    'enemy.sandstorm_raider.desc': 'Leichter Schweberäuber für blitzartige Überfälle in den Dünen.',

    // Ranks
    'rank.recruit.name': 'Rekrut',
    'rank.private.name': 'Gefreiter',
    'rank.corporal.name': 'Korporal',
    'rank.sergeant.name': 'Feldwebel',
    'rank.staff_sergeant.name': 'Oberfeldwebel',
    'rank.master_sergeant.name': 'Hauptfeldwebel',
    'rank.warrant_officer.name': 'Stabsfeldwebel',
    'rank.second_lieutenant.name': 'Leutnant',
    'rank.lieutenant.name': 'Oberleutnant',
    'rank.captain.name': 'Hauptmann',
    'rank.major.name': 'Major',
    'rank.lieutenant_colonel.name': 'Oberstleutnant',
    'rank.colonel.name': 'Oberst',
    'rank.brigadier.name': 'Brigadegeneral',
    'rank.major_general.name': 'Generalmajor',
    'rank.lieutenant_general.name': 'Generalleutnant',
    'rank.general.name': 'General',
    'rank.field_marshal.name': 'Generalfeldmarschall',
    'rank.marshal_of_the_realm.name': 'Reichsmarschall',
    'rank.high_marshal.name': 'Hochmarschall',
    'rank.supreme_marshal.name': 'Oberster Marschall',

    // UI
    'ui.target': 'ZIEL',
    'ui.fire': 'FEUER',
    'ui.auto_fire': 'DAUERFEUER',
    'ui.hull': 'Rumpf',
    'ui.armor': 'Panzerung',
    'ui.level': 'Stufe',
    'ui.scrap': 'Schrott',
    'ui.ore': 'Erz',
    'ui.honor': 'Ehre',
    'ui.safe_zone': 'SICHERHEITSZONE',
    'ui.safe_zone_tip': 'Waffen deaktiviert. Feldreparaturen laufen automatisch.',
    'ui.garage': 'Garage',
    'ui.inventory': 'Inventar',
    'ui.workshop': 'Werkstatt',
    'ui.talents': 'Talente',
    'ui.world_map': 'Weltkarte',
    'ui.quests': 'Aufträge',
    'ui.settings': 'Optionen',
  },
};

/** Hand-written UI/ability/ammo texts plus the generated data names (vehicles, items, maps, quests...); the generated ones win. */
export const TRANSLATIONS: Record<LanguageCode, Record<string, string>> = {
  en: { ...HAND_WRITTEN.en, ...NAMES_EN },
  de: { ...HAND_WRITTEN.de, ...NAMES_DE },
};

/**
 * Resolves localized string by key with fallback to English, then literal key.
 */
export function t(
  key: string,
  lang: LanguageCode = 'en',
  params?: Record<string, string | number>
): string {
  const dict = TRANSLATIONS[lang] || TRANSLATIONS.en;
  let text = dict[key] || TRANSLATIONS.en[key] || key;

  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }

  return text;
}
