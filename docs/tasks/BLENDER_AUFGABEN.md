# Bogen 2: Blender-Aufgaben (LOKALES VS-Code-Fenster)

Fenster: VS Code **lokal** (ohne SSH), Ordner `C:\treadfront-blender\`. Blender muss laufen, im Reiter
"MCP for Blender" (Taste N) ist der Server gestartet. Agent-Modus, MCP-Server `blender` aktiv.
Die fertigen Bilder lädst du danach per Ziehen in den Explorer des SSH-Fensters nach
`/root/treadfront-assets/blender/` hoch. Zuschneiden und Einbauen macht Claude.

## Vorspann (jede Aufgabe beginnt damit)
```
Du arbeitest in Blender über das MCP-Werkzeug. Ziel: graue Formvorlagen für ein Panzerspiel (2D von oben).
Die Bilder dienen nur als Vorlage für eine KI, die sie malerisch ausmalt. Sie brauchen klare Silhouetten und
deutliche Plattenkanten, aber KEINE Farbe und keine Texturen. Regeln: Speichere die .blend-Datei unter
C:\treadfront-blender\ und nach jedem Schritt. Schreibe alle Skripte als Dateien nach C:\treadfront-blender\scripts\
(wiederholbar). Material: mattes mittleres Grau, Bevel an allen Kanten, weiches Licht von oben links, Orthogonal-
kamera exakt von oben, Hintergrund transparent, PNG 1024x1024, Objekt füllt etwa 85 Prozent des Bildes.
Ausgabeordner: C:\treadfront-blender\out\. Erzeuge am Ende ein Übersichtsbild overview_<aufgabe>.png mit allen
Ergebnissen und nenne mir die Dateipfade. Baue zuerst EIN Beispiel und warte auf meine Freigabe, bevor du den
Rest baust. Prüfe selbst, dass sich die Objekte deutlich unterscheiden, und melde Probleme.
```

---

## C0. Zustand prüfen (einmal)
```
Prüfe die Verbindung: nenne mir die Blender-Version, die Objekte in der Szene und ob das Ausgabeverzeichnis
C:\treadfront-blender\out existiert (lege es an, falls nicht). Speichere die Datei als panzer.blend.
```

## C1. Elite-Gegner und Bosse (Silhouetten)
```
Baue Formvorlagen für die Gegner, Nase nach RECHTS (anders als die Fahrzeug-Wannen, wie die bestehenden
Gegner-Sprites): scout_buggy, gunner_truck, artillery, bunker_turret, convoy_escort, engineer, flak_wagon,
ice_tank, lava_truck, loot_convoy, sandstorm_raider, swamp_crawler. Je zwei Varianten: "normal" und "elite"
(Elite ist 25 Prozent größer, mit zusätzlichen Panzerplatten, Dornen und einem Aufbau). Dateinamen:
enemy_<name>_normal.png und enemy_<name>_elite.png. Bei Bunker-Turm von oben rund mit drehbarem Rohr.
```

## C2. Bosse
```
Baue Formvorlagen für die Bosse: boss_cape_warden, boss_eagle_colossus, boss_highway_behemoth,
boss_storm_coast_leviathan, boss_windmill_goliath und die sechs Festungs-Bosse gate_frozen_foundry,
gate_glowworm_sump, gate_iron_crown_vault, gate_quarry_hold, gate_rusted_depot, gate_windmill_bastion.
Bosse sind sehr groß und einzigartig: jede Silhouette muss sich klar von allen anderen unterscheiden und zum
Namen passen (z. B. Adler-Koloss mit Flügelplatten, Windmühlen-Goliath mit Rotorarmen, Sturmküsten-Leviathan
mit Rumpf und Flossen). Nase nach rechts, 1024x1024, Objekt füllt 90 Prozent. Dateinamen wie die Namen.
```

## C3. Landmarken
```
Baue für die 30 Karten je eine große Landmarke als Formvorlage in einheitlicher Schrägsicht von oben (Winkel
45 Grad, Orthogonalkamera), Dateinamen landmark_01.png bis landmark_30.png. Konzept in docs/GDD.md (die
Landmarken pro Karte stehen dort; wenn du die Datei nicht lesen kannst, frage mich nach der Liste). Jede
Landmarke hat eine einzigartige Silhouette (Leuchtturm, Windmühle, Burg, Brücke, Steinbogen, Wasserturm,
Ruinenstadt, Obsidianspitze usw.). Arbeite in Gruppen zu 6 und zeige mir jeweils die Übersicht.
```

## C4. Schadenszustände der Fahrzeuge
```
Erzeuge aus den vorhandenen Fahrzeug-Wannen in C:\treadfront-blender\out\ (Dateien {tier}_{klasse}_hull.png,
Tiers 7-10) je eine Variante "beschädigt" (Dellen, fehlende Panzerplatte, Brandspur als dunkle Fläche) und
"wrack" (Turmring leer, Ketten abgerissen, Panzerplatten verbogen) als Formvorlage. Dateien
{tier}_{klasse}_hull_damaged.png und {tier}_{klasse}_hull_wreck.png. Erst eine Klasse zeigen, dann den Rest.
```

## C5. Bodenplatten und Requisiten (optional)
```
Baue 20 Requisiten als Formvorlage von oben (Felsen, Bäume, Sandsäcke, Container, Panzersperren, Wracks,
Fässer, Zaunstücke, Zelte, Kisten) mit je 3 Varianten. Dateinamen prop_<name>_<1..3>.png. Kein Boden darunter,
nur das Objekt, mit weichem Schlagschatten NICHT mitrendern.
```
