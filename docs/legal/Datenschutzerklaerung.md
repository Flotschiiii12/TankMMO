# Datenschutzerklärung (Entwurf) – Treadfront

> **ENTWURF – MUSS VOR DER VERÖFFENTLICHUNG RECHTLICH GEPRÜFT WERDEN.** Dieser Text ist eine technische Vorlage, die genau beschreibt, was der Code speichert (Stand: Branch `claude/cloud-batch-3`). Er ist keine Rechtsberatung. Eckige Klammern `[...]` sind vom Betreiber auszufüllen.

## 1. Verantwortlicher
[Name, Anschrift, E-Mail des Betreibers – siehe Impressum]

## 2. Welche Daten das Spiel speichert
Alle Daten liegen in einer SQLite-Datenbank auf dem Server des Betreibers ([Hoster/Standort eintragen]). Es gibt keine Werbe- oder Tracking-Dienste von Dritten und keine externen Analyse-Skripte.

| Zweck | Daten | Speicherdauer |
|---|---|---|
| Spielkonto | Konto-ID (zufällig), Spielername, gehashtes Zugangsgeheimnis (`secret_hash`) und gehashter Wiederherstellungscode, Erstellungszeit, letzter Besuch, Startfraktion, Bestätigung „mindestens 13 Jahre alt" (ja/nein), Sperr-/Stummschaltungszeit | bis zur Kontolöschung |
| Spielstand | Charakter, Inventar, Fahrzeuge, Fortschritt, Quests, Erfolge, Bestenlisten-Werte, Ranglistenwerte (Arena, Ehre, Fraktionskrieg) | bis zur Kontolöschung |
| Soziales | Freundes- und Blockierlisten, Gruppen-/Clan-Zugehörigkeit, Post, Handels- und Auktionsdaten | bis zur Kontolöschung |
| Chat | Text und Absendername der Chatnachrichten (global, Clan, Gruppe, privat), Zeitstempel | [Aufbewahrungsfrist festlegen – der Code löscht Chatverläufe derzeit nicht automatisch, das muss vor dem Start entschieden und umgesetzt werden] |
| Moderation | Spielerberichte (Melder, Gemeldeter, Grund), Protokoll von Admin-Aktionen | [Frist festlegen] |
| Beta-Statistik (anonym) | Ereignis-Art aus fester Liste (Konto erstellt, Tutorial-Schritt, erster Abschuss, erstes Herstellen, Level 5/10/20/30, Tor betreten/geschafft, erster Kauf, Sitzungsbeginn, Sitzungsende mit Dauer in Sekunden), Zeitstempel, **gesalzener Hash** der Konto-ID (16 Hex-Zeichen, Salz nur in der Datenbank) | 180 Tage, danach automatische Löschung |
| Feedback-Meldungen | Freitext, den du selbst eingibst (max. 1000 Zeichen), Art (Fehler/Idee/Sonstiges), gehashte Konto-ID, Karte, Level, Spielversion, die letzten 20 Fehlercodes des Servers | bis zur Bearbeitung, spätestens [Frist festlegen] |

## 3. Was *nicht* gespeichert wird
- keine IP-Adressen in der Datenbank (die IP wird nur kurzzeitig im Arbeitsspeicher für Anmelde-Begrenzungen gehalten und beim Neustart verworfen; [prüfen, ob der Reverse-Proxy/Hoster IPs in Zugriffsprotokollen führt und das hier ergänzen]),
- keine Geräte-IDs, keine Standortdaten, keine Kontakte, keine Chat-Inhalte in der Beta-Statistik,
- keine E-Mail-Adresse und kein Klarname – Konten sind Gast-Konten mit Zugangsschlüssel.

## 4. Rechtsgrundlagen
Vertragserfüllung (Art. 6 Abs. 1 lit. b DSGVO) für Konto, Spielstand und soziale Funktionen; berechtigtes Interesse (Art. 6 Abs. 1 lit. f) für Missbrauchsschutz, Moderation und die anonyme Beta-Statistik zur Verbesserung des Spiels. [Prüfen, ob für die Statistik stattdessen eine Einwilligung eingeholt werden soll.]

## 5. Deine Rechte
Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit, Widerspruch, Beschwerde bei einer Aufsichtsbehörde. Im Spiel: *Daten exportieren* und *Konto löschen* (löscht Konto, Spielstand, Beta-Statistik-Einträge und Feedback dieses Kontos). Sonst per E-Mail an [Kontakt].

## 6. Kinder und Jugendliche
Siehe Jugendschutz: Das Spiel ist ab 13 Jahren; bei der Kontoerstellung muss das Alter bestätigt werden.

## 7. Weitergabe
Keine Weitergabe an Dritte außer dem Hoster als Auftragsverarbeiter ([AV-Vertrag abschließen]). Zahlungen gibt es derzeit nicht (die Premium-Währung ist abgeschaltet). Falls Zahlungen eingeführt werden, muss dieser Text erweitert werden.

## 8. Änderungen
Der Betreiber kann diese Erklärung anpassen, wenn sich das Spiel ändert. Stand: [Datum].
