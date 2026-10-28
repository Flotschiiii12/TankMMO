/**
 * Minimal UI translation: English text is the key, German the value. Unknown strings fall back to English.
 * The language is stored in localStorage; changing it reloads the page (simplest way to re-render every screen).
 */
export type Lang = 'en' | 'de';
const KEY = 'treadfront_lang';

export function getLang(): Lang {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'de' || v === 'en') return v;
  } catch { /* private mode */ }
  return typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('de') ? 'de' : 'en';
}
export function setLang(l: Lang): void { try { localStorage.setItem(KEY, l); } catch { /* ignore */ } window.location.reload(); }

const DE: Record<string, string> = {
  // generic
  'Back': 'Zurück', 'Close': 'Schließen', 'Send': 'Senden', 'Play': 'Spielen', 'Sign in': 'Anmelden', 'Try again': 'Erneut versuchen', 'Reconnect': 'Neu verbinden',
  'Disconnected': 'Verbindung getrennt', 'No connection': 'Keine Verbindung', 'Connecting…': 'Verbinde …', 'Looking for the server…': 'Suche den Server …',
  'An online tank MMO. Your progress lives on the server.': 'Ein Online-Panzer-MMO. Dein Fortschritt liegt auf dem Server.',
  'I already have an account': 'Ich habe schon ein Konto', 'I am at least 13 years old.': 'Ich bin mindestens 13 Jahre alt.',
  'Choose your faction (your start region):': 'Wähle deine Fraktion (Startregion):', 'Coastal Union': 'Küstenbund', 'Highland Union': 'Hochlandbund', 'Steppe Caravan': 'Steppenkarawane',
  // HUD
  'Safe Zone': 'Sichere Zone', 'Chat (Enter)': 'Chat (Enter)', 'Message… (/w Name text)': 'Nachricht … (/w Name Text)',
  'Open Garage': 'Garage öffnen', 'Quests (J)': 'Aufträge (J)', 'Social (friends, party, clan)': 'Soziales (Freunde, Gruppe, Clan)', 'Inventory & Loadout (I)': 'Inventar & Ausrüstung (I)',
  'World Map & Fast Travel (M)': 'Weltkarte & Schnellreise (M)',
  // inventory / workshop
  'Loadout & Workshop': 'Ausrüstung & Werkstatt', 'Gear': 'Ausrüstung', 'Craft': 'Herstellen', 'Equip': 'Anlegen', 'Unequip': 'Ablegen', 'Dismantle': 'Zerlegen', 'Safe mode': 'Sicherer Modus',
  'Select an item.': 'Wähle einen Gegenstand.', 'Nothing here yet. Enemies drop gear.': 'Noch nichts hier. Gegner lassen Ausrüstung fallen.', 'Scrap': 'Schrott', 'Iron': 'Eisen', 'Copper': 'Kupfer',
  'Titanium': 'Titan', 'Crystal': 'Kristall', 'Fragments': 'Fragmente', 'Hull': 'Hülle', 'Armor': 'Panzerung', 'Damage': 'Schaden', 'Reload': 'Nachladen', 'Range': 'Reichweite', 'Speed': 'Tempo',
  'Crit': 'Krit', 'Reduction': 'Reduzierung', 'Sold to vendor': 'An Händler verkauft', 'Equipped': 'Angelegt', 'Crafted': 'Hergestellt', 'Dismantled': 'Zerlegt', 'Fusion done': 'Fusion abgeschlossen',
  // quests
  'Quests': 'Aufträge', 'Accept': 'Annehmen', 'Claim': 'Abholen', 'Claimed': 'Abgeholt', 'Tier ': 'Stufe ', 'No active quests. Check the Available tab.': 'Keine aktiven Aufträge. Schau unter „Verfügbar“.',
  'Nothing available right now. Level up or finish your current quests.': 'Gerade nichts verfügbar. Steige auf oder schließe deine Aufträge ab.',
  // social
  'Social': 'Soziales', 'friends': 'Freunde', 'party': 'Gruppe', 'clan': 'Clan', 'ranking': 'Rangliste', 'market': 'Markt', 'arena': 'Arena', 'gates': 'Tore', 'career': 'Laufbahn',
  'Add friend': 'Freund hinzufügen', 'Invite to party': 'In Gruppe einladen', 'Remove': 'Entfernen', 'Block': 'Blockieren', 'Kick': 'Rauswerfen', 'Promote': 'Befördern', 'Invite': 'Einladen',
  'Leave party': 'Gruppe verlassen', 'Leave clan': 'Clan verlassen', 'Create': 'Gründen', 'Join': 'Beitreten', 'Buy': 'Kaufen', 'Queue': 'Anstellen', 'Enter': 'Betreten',
  'Donate 1,000': '1.000 spenden', 'Collect mail': 'Post abholen', 'My listings': 'Meine Angebote', 'List 24h': '24 h anbieten', 'No friends yet.': 'Noch keine Freunde.', 'No listings.': 'Keine Angebote.',
  'Faction war scores': 'Fraktionskrieg-Stand', 'Leave current gate': 'Aktuelles Tor verlassen', 'Create a clan (10,000 scrap) or accept an invite.': 'Gründe einen Clan (10.000 Schrott) oder nimm eine Einladung an.',
  // garage
  'Base Outpost Hangar': 'Hangar des Außenpostens', 'Safe Zone Depot': 'Depot der sicheren Zone', 'Vehicles': 'Fahrzeuge', 'Talents': 'Talente', 'Ammunition Depot': 'Munitionsdepot', 'Owned': 'Im Besitz',
  'Hull HP': 'Hüllen-HP', 'Armor HP': 'Panzerungs-HP', 'Top Speed': 'Höchsttempo', 'Deployed': 'Im Einsatz', 'Deploy Vehicle': 'Fahrzeug einsetzen',
  'all': 'Alle', 'main': 'Haupt', 'secondary': 'Neben', 'armor': 'Panzerung', 'engine': 'Motor', 'module': 'Modul', 'drone': 'Drohne', 'empty': 'leer', 'equipped': 'angelegt',
  // settings
  'Game Settings': 'Spieleinstellungen', 'Master Volume': 'Gesamtlautstärke', 'Reset Game Progress': 'Fortschritt zurücksetzen', 'Battlefield Camera Zoom': 'Kamera-Zoom',
  'Audio Effects & Engine Hum': 'Soundeffekte & Motorbrummen', 'Developer Diagnostics Overlay (F3)': 'Entwickler-Anzeige (F3)', 'Language': 'Sprache',
};

const lang = getLang();
/** Translate an English UI string. */
export function tr(s: string): string { return lang === 'de' ? DE[s] ?? s : s; }
export const currentLang = lang;
