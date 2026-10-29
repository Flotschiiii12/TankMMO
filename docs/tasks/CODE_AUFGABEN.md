# Bogen 1: Code-Aufgaben für den VS-Code-Agenten (SSH-Fenster)

Fenster: VS Code per **Remote-SSH**, Ordner `/root/treadfront-dev/TankMMO`. Agent-Modus im Copilot-Chat.
Reihenfolge einhalten, **eine Aufgabe nach der anderen**, nach jeder im Browser ansehen (`npm run dev`, Port 3000 wird von VS Code weitergeleitet).

## Vorspann (jede Aufgabe beginnt damit)

```
Arbeite im Dev-Checkout auf `claude/unify-client`. Lies zuerst AGENTS.md und CLAUDE.md und halte dich daran.
Kein Deploy, kein Push, nicht nach /root/treadfront-live schreiben. Nach jedem Teilschritt `npm run lint` und
`npm test`, beides muss grün bleiben. Committe pro Teilaufgabe einzeln (englische Commit-Messages) und trage am
Ende einen datierten Eintrag in docs/PROGRESS.md ein. Visuelle Änderungen prüfst du mit `npm run ui-shots` bei
844x390 (DE und EN). Alles muss auf einem normalen Handy flüssig laufen: es gibt einen Qualitätsschalter
(hoch / niedrig / aus), jeder neue Effekt hängt daran und ist bei "niedrig" abgeschaltet oder stark reduziert.
Kein `shadowBlur` pro Sprite, keine Live-Blur-Filter pro Entität. `shared/sim` bleibt deterministisch (kein
Math.random, Date, DOM); alle Effekte leben nur im Client (`src/`). Respektiere prefers-reduced-motion.
Messe bei Render-Änderungen die Frame-Zeit vorher und nachher und nenne die Zahlen. Schreibe am Ende einen
kurzen Bericht auf Deutsch: was geändert, was gemessen, was du nicht geschafft hast.
```

---

## A. Look

### A1. Licht und Schatten  (zuerst, größter Effekt)
```
Baue ein einheitliches Lichtsystem im Renderer. (1) Eine feste Sonnenrichtung pro Karte (Daten in der Kartendefinition,
mit Standardwert). (2) Weiche Schlagschatten für Fahrzeuge, Gebäude, Bäume und Felsen in diese Richtung, als
vorberechnete und gecachte Schatten-Sprites (Silhouette aus dem Sprite, abgedunkelt, leicht verzerrt), keine
Live-Blur. (3) Tageszeit pro Karte (Morgen, Mittag, Abend, Nacht) als sanfter Farbfilter über der Welt, mit
langsamem Übergang. (4) Nachts: Mündungsfeuer, Fahrzeug-Scheinwerfer und Explosionen als additive Lichtkegel
(vorberechnete Radial-Gradient-Sprites). Bei Qualität "niedrig": nur einfache Ellipsen-Schatten und kein Nachtlicht.
```

### A2. Effekte (Staub, Mündungsfeuer, Einschläge, Explosionen)
```
Überarbeite die Effekte im Client mit einem Partikel-Pool (feste Obergrenze pro Qualitätsstufe):
Staub und Dreck hinter den Ketten (Farbe nach Bodentextur, Menge nach Tempo); Mündungsfeuer mit Funken und kurzem
Rückstoß-Zucken des Fahrzeugs; Einschlag mit Druckwelle, Splittern, Rauchfahne und einem Einschlagkrater, der
langsam verblasst; Explosionen mit Feuerball, Funken und Rauch; Wracks qualmen. Treffer auf Gegner zeigen einen
kurzen weißen Blitz auf dem Sprite. Alles deterministisch irrelevant (nur Optik), aber nie mehr als die Pool-Größe.
```

### A3. Nachbearbeitung (Vignette, Farbkorrektur, Bloom)
```
Füge eine leichte Nachbearbeitung hinzu (eine Canvas- oder WebGL-Schicht über der Welt, nicht über der UI):
Vignette, Farbkorrektur pro Karte (Daten pro Karte, mit Standardwert) und ein sanftes Bloom nur auf Mündungsfeuer
und Explosionen. Aus bei Qualität "niedrig" und bei prefers-reduced-motion. Miss die Frame-Zeit vorher und nachher;
liegt der Mehraufwand auf einem Handy-Profil über 2 ms pro Frame, mache die Schicht standardmäßig aus.
```

### A4. Wetter
```
Wetter pro Karte (Zuordnung aus dem Kartenkonzept, docs/GDD.md): Regen, Schnee, Sandsturm, Nebel, Gewitter mit
Blitzen. Partikel nur im Kamerabereich, Pool-begrenzt, mit Einfluss auf Licht (A1) und Sichtweite (Nebel). Wetter
hat keinen Einfluss auf Spielwerte, nur Optik. Bei "niedrig": stark reduzierte Partikel, Nebel als einfache Tönung.
```

### A5. Fahrzeugbewegung
```
Verbessere das Fahrgefühl visuell: Wanne neigt sich leicht in Kurven und beim Beschleunigen/Bremsen (nur Optik,
Sprite-Skalierung und -Versatz), Turm dreht mit Trägheit und leichtem Nachschwingen, Kettenspuren im Boden die
langsam verblassen, leichtes Wippen beim Fahren. Die Simulation (`shared/`) bleibt unverändert.
```

---

## B. Spielgefühl

### B1. Kampf-Feedback
```
Treffer-Rückmeldung: Schadenszahlen (Größe nach Schaden, Farbe nach Krit, kurzes Hochfliegen und Ausblenden),
Lebensbalken über Gegnern, deutliche Zielmarkierung am anvisierten Ziel, Kamerawackeln bei starken Treffern und
bei eigenen Schüssen (in den Einstellungen abschaltbar und in der Stärke einstellbar), Warnmarkierung am
Bildschirmrand in Richtung des Beschusses, Treffer-Ton. Die Schüsse treffen immer (Spielregel, nicht ändern).
```

### B2. Kamera
```
Kamera mit weichem Nachlaufen, leichtem Vorausschauen in Fahrtrichtung, sanftem Zoom bei Kämpfen und beim
Anvisieren, Überblendung beim Kartenwechsel statt hartem Schnitt. Alles in den Einstellungen reduzierbar.
Prüfe, dass bei 667x375 und 926x428 nichts Wichtiges vom Bildschirmrand verdeckt wird.
```

### B3. Touch-Steuerung
```
Prüfe und verbessere die Touch-Steuerung: Joystick-Totzone und -Kurve, Zielknopf-Kranz, Vibration bei Treffer
(wenn vom Gerät unterstützt, abschaltbar), große Tippflächen, kein versehentliches Antippen am Rand, Knopfgröße
in den Einstellungen einstellbar. Layouts bei 667x375, 844x390 und 926x428 mit ui-shots belegen.
```

---

## D. Wirkung und Inhalt

### D1. Titelbild und Hangar
```
Mach den Titelbildschirm und den Hangar zu einem Schauplatz: sich langsam drehendes Fahrzeug mit Licht und
Partikeln, Hintergrund pro Fraktion, weiche Übergänge. Der Spieler sieht beim Start sofort etwas Hochwertiges.
Die Fahrzeug-Sprites der Stufen 7-10 liegen jetzt in public/assets/vehicles (zeige sie im Karussell).
```

### D2. Ton
```
Verbessere den Ton (alles ist synthetisch erzeugt, src/audio): Lautstärkeverhältnisse, Kanonenschuss mit Tiefe
und Nachhall, Motorbrummen nach Fahrzeuggewicht, Umgebungsatmosphäre pro Karte, adaptive Musik. Kein Ton startet
ohne Nutzerinteraktion (Browser-Regel). Schreibe einen kurzen Hörtest-Ablauf für mich (welche Einstellungen
ich anhören soll), denn du kannst nichts hören.
```

### D3. Belohnungsgefühl
```
Mehr Wumms bei Belohnungen: Level-Up, seltene Beute (Lichtstrahl nach Seltenheit), Quest-Abschluss,
Boss-Kill (kurze Zeitlupe, abschaltbar), Fanfare, kurzer Bildschirmblitz (abschaltbar). Alles hinter dem
Qualitätsschalter und prefers-reduced-motion.
```

---

## E. Spielbarkeit

### E1. Qualitätsstufen und Performance
```
Prüfe das Qualitätssystem: eine klare Einstellung "Grafik: Hoch / Mittel / Niedrig / Aus" (Aus = nur das
Nötigste), automatische Wahl beim ersten Start anhand einer kurzen Messung, und eine einfache Anzeige der FPS
(Debug, in den Einstellungen). Alle neuen Effekte aus A1-A5, B1-B2 und D1-D3 hängen daran. Messe bei Stufe
"Niedrig" und "Hoch" mit `npm run budget` und dem E2E-Lauf und dokumentiere die Zahlen in docs/MOBILE.md.
```

### E2. Die ersten zehn Minuten
```
Gehe die ersten zehn Minuten eines neuen Spielers durch (Titel, Fraktionswahl, Tutorial, erste Gegner, erste
Beute, erste Quest) mit den vorhandenen E2E-Skripten oder einem neuen. Finde Stellen, an denen man hängt, etwas
nicht versteht oder die UI überlädt. Behebe die 5 wichtigsten und schreibe die übrigen in docs/PROGRESS.md
unter "Known gaps". Nutze die deutschen Texte (src/ui/title/tips.ts) und prüfe sie auf natürlichen Klang.
```

### E3. Stabilität und Fehler
```
Suche nach Abstürzen und stillen Fehlern im Client: Fehlergrenze (React Error Boundary) mit freundlicher
Meldung und "Neu laden"-Knopf, Reconnect nach Verbindungsabbruch (Handy wechselt WLAN/Mobilfunk) mit klarer
Anzeige, nicht endlos hängende Ladebildschirme. Schreibe Tests, wo es geht.
```
