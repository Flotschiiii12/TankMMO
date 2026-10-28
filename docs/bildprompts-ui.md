# Treadfront: Bild-Prompts für die UI (Rahmen, Buttons, Titel, Ladebilder, Karte)

**Wofür:** Die neue Oberfläche (Aufgabe 1-10 des UI-Overhauls) läuft komplett mit CSS. Jede Stelle hat aber einen **Art-Slot**: Sobald eine Datei unter `public/assets/ui/` liegt **und** in `public/assets/manifest.json` (Liste `sprites`) eingetragen ist, wird sie automatisch geladen. Fehlt die Datei oder der Eintrag, bleibt das CSS-Aussehen. Es gibt keine 404-Requests für fehlende Dateien. Kein Code ändern, nur Datei ablegen und eintragen.

**Ablauf je Bild:** Prompt kopieren, Stilreferenz `00_stil_referenz.jpg` anhängen, Ergebnis auf die angegebene Größe bringen, Dateiname exakt übernehmen, in `manifest.json` eintragen (Beispiel unten), Seite neu laden. Die Bild-Werkzeuge und Schneide-Skripte liegen auf deinem Server, nicht im Repo.

**Freistellen:** Bildgeneratoren liefern meist kein Alpha. Wo "transparent" steht, Prompt-Zusatz `on a flat pure magenta #FF00FF background` bleibt drin; danach Magenta per Skript entfernen und als PNG mit Alpha speichern.

**Lesbarkeit zuerst:** Über Rahmen und Flächen liegt Text (hell `#e8eef9` auf dunkel). Die Mitte von Panels, Fenstern und Buttons muss **ruhig und dunkel** bleiben (Navy/Schiefer `#0d131d` bis `#1c2638`), ohne Muster mit hohem Kontrast. Zierrat gehört an die Ränder.

**Eintrag in `public/assets/manifest.json`** (die Datei hat ein Feld `"sprites": [ "/assets/...png", ... ]`, Pfade alphabetisch halten):

```json
"/assets/ui/panel_frame.png",
"/assets/ui/window_frame.png"
```

## Übersicht: Datei -> Größe -> Slot im Code

| Datei (unter `public/assets/ui/`) | Größe (px) | Wird geladen von | Darstellung |
|---|---|---|---|
| `panel_frame.png` | 192x192 | `Panel` (kit/Panel.tsx), alle Karten und Unterfenster | 9-Slice, Ecke 28 px, Mitte wird als Hintergrund gefüllt |
| `window_frame.png` | 256x256 | `WindowFrame` (wm/WindowFrame.tsx), schwebende Fenster am Desktop (Handy-Vollbild bleibt CSS) | 9-Slice, Ecke 36 px, Mitte gefüllt |
| `btn_primary.png` | 192x56 | `Button variant="primary"` im Normalzustand | gestreckt auf die Button-Größe |
| `btn_primary_hover.png` | 192x56 | Primary-Button bei Hover (optional) | gestreckt |
| `btn_primary_down.png` | 192x56 | Primary-Button gedrückt (optional) | gestreckt |
| `btn_primary_off.png` | 192x56 | Primary-Button deaktiviert (optional) | gestreckt |
| `tab_active.png` | 160x44 | `Tabs`, gewählter Reiter (auch Einstellungen, Hangar, Sozial ...) | gestreckt |
| `tab_idle.png` | 160x44 | `Tabs`, nicht gewählte Reiter (optional: ohne die Datei bleiben inaktive Reiter im CSS-Look) | gestreckt |
| `hotbar_frame.png` | 256x96 | `Hotbar` (hud/Hotbar.tsx), Leiste für Maus und Tastatur | 9-Slice, Ecke 24 px |
| `frame_common.png`, `frame_uncommon.png`, `frame_rare.png`, `frame_epic.png`, `frame_legendary.png` | je 128x128 | `ItemCard` (kit/ItemCard.tsx): Rahmen um jedes Item im Inventar, Hangar, Markt | gestreckt über die Karte, Mitte transparent |
| `hangar_bg.png` | 1200x800 | Hangar-Vorschau (hangar/HangarPreview.tsx), hinter dem Fahrzeug | `cover`, Mitte frei |
| `title_coastal.png`, `title_highland.png`, `title_steppe.png` | je 1920x1080 | Titel- und Login-Bildschirm (OnlineGate), passend zur gewählten Fraktion | `cover` |
| `loading_1.png` ... `loading_6.png` | je 1920x1080 | Ladebildschirm (title/LoadingScreen.tsx), zufällig eines pro Start | `cover`, mit 55 % Deckkraft unter dem Text |
| `map_frame.png` | 512x512 | Weltkarte (WorldMapModal), Rahmen um die Karte | 9-Slice, Ecke 40 px, Mitte transparent |
| `parchment.png` | 1600x1000 | Weltkarte, Hintergrund hinter den Zonen | `cover` |
| `badge_ribbon.png` | 96x28 | `Badge tone="accent"` (kit/Indicators.tsx), z. B. "Update" in den News | 9-Slice, Ecke 12 px |
| `banner_ribbon.png` | 640x120 | Level-up-, Rang- und Quest-Banner (motion/AnnounceHost.tsx) | gestreckt |
| `logo.png` | 800x240 | `Logo` (title/Logo.tsx), Titelbildschirm und Ladebildschirm, ersetzt Symbol + Schriftzug | Höhe max. 96 px, Alpha |

Fraktions-Akzentfarben der UI (die Bilder dürfen darauf abgestimmt sein): Küstenbund himmelblau `#38bdf8`, Hochlandbund orange `#fb923c` mit Waldgrün, Steppenkarawane gelb `#fbbf24` mit Rot.

---

## Gemeinsamer Stil-Vorspann (in jedem Prompt enthalten)

```
Hand-painted gouache and ink illustration with visible brush texture and slightly uneven
hand-drawn dark outlines, in a bright, warm, natural storybook style. Fresh, saturated but
harmonious colors, clean readable shapes, friendly and a little rugged, never dirty or grim.
No neon, no glossy 3D render, no photorealism, no lens flares, no glow effects, no airbrushed
gradients. No text, no letters, no numbers, no watermark.
```

---

## 1. Panel- und Fensterrahmen

### `panel_frame.png` (192x192, 9-Slice Ecke 28)

```
Hand-painted gouache and ink illustration with visible brush texture and slightly uneven
hand-drawn dark outlines, in a bright, warm, natural storybook style. Fresh, saturated but
harmonious colors, clean readable shapes, friendly and a little rugged, never dirty or grim.
No neon, no glossy 3D render, no photorealism, no lens flares, no glow effects, no airbrushed
gradients. No text, no letters, no numbers, no watermark. A square UI panel frame for a
tank game, seen straight from the front, 192 by 192 pixels. A slim hand-painted border of
riveted weathered steel plates in muted blue-grey with small brass corner brackets and a
thin lighter inner edge line. The border is about 24 pixels thick on all four sides and
must be perfectly symmetric so it can be cut into a 3x3 grid: four identical-style corners
and four plain edges that tile without visible seams. The CENTER is a calm, flat, very dark
navy slate (#0d131d to #141c2a) with only a faint paper-like brush texture, no pattern, no
details, because UI text will be placed on it. Nothing outside the frame, frame touches the
image border on all sides.
```

### `window_frame.png` (256x256, 9-Slice Ecke 36)

```
Hand-painted gouache and ink illustration with visible brush texture and slightly uneven
hand-drawn dark outlines, in a bright, warm, natural storybook style. Fresh, saturated but
harmonious colors, clean readable shapes, friendly and a little rugged, never dirty or grim.
No neon, no glossy 3D render, no photorealism, no lens flares, no glow effects, no airbrushed
gradients. No text, no letters, no numbers, no watermark. A square window frame for a game
UI window, front view, 256 by 256 pixels. A sturdier border than a simple panel: a painted
riveted iron frame with a double line, brass corner plates with small bolts, a slightly
thicker top edge (a header bar area, plain, no decoration in it). Border thickness about 32
pixels on all sides, perfectly symmetric, ready to be cut into a 3x3 grid, edges tile without
seams. The CENTER is a flat, very dark navy slate (#0d131d) with a faint brush texture and
no details at all. Frame touches the image border on all sides.
```

### Fraktionsvarianten (optional, später): `panel_frame` und `window_frame` bleiben neutral blau-grau, die Akzentfarbe kommt aus dem UI. Falls du Fraktionsrahmen willst, bitte melden, dann kommt ein Slot pro Fraktion dazu.

---

## 2. Buttons

Alle Button-Bilder: gleiche Größe 192x56, gleiche Form, nur Zustand und Helligkeit ändern. Sie werden auf die jeweilige Button-Größe **gestreckt** (80-340 px breit): darum keine feinen Details an den Enden, gerade Ober- und Unterkante.

### `btn_primary.png` (Normal)

```
Hand-painted gouache and ink illustration with visible brush texture and slightly uneven
hand-drawn dark outlines, in a bright, warm, natural storybook style. Fresh, saturated but
harmonious colors, clean readable shapes, friendly and a little rugged, never dirty or grim.
No neon, no glossy 3D render, no photorealism, no lens flares, no glow effects, no airbrushed
gradients. No text, no letters, no numbers, no watermark. A wide rounded button plate for a
game UI, front view, 192 by 56 pixels, as a flat painted shape: a bright sky-blue (#38bdf8)
hand-painted metal plate with a darker blue outline, a thin light highlight line along the
top edge, a slightly darker lower edge, and two tiny rivets, one near each end. The middle
is a calm flat color so a dark label can be written on it. Straight top and bottom edges,
simple rounded ends without ornaments, so it can be stretched horizontally. On a flat pure
magenta #FF00FF background.
```

### `btn_primary_hover.png`

```
(same prompt as btn_primary.png, but) the plate is a little brighter and lighter (#7dd3fc
face), the highlight line is stronger. Same size, same shape, same rivets.
```

### `btn_primary_down.png`

```
(same prompt as btn_primary.png, but) the plate looks pressed in: slightly darker face
(#0ea5e9), the highlight line is gone, a thin darker shadow line along the top edge instead
of the bottom. Same size, same shape, same rivets.
```

### `btn_primary_off.png`

```
(same prompt as btn_primary.png, but) a dull grey-blue (#475569) plate, no highlight, no
rivet shine, flat and matte, clearly inactive. Same size, same shape.
```

### `tab_active.png` (160x44)

```
Hand-painted gouache and ink illustration with visible brush texture and slightly uneven
hand-drawn dark outlines, in a bright, warm, natural storybook style. Fresh, saturated but
harmonious colors, clean readable shapes, friendly and a little rugged, never dirty or grim.
No neon, no glossy 3D render, no photorealism, no lens flares, no glow effects, no airbrushed
gradients. No text, no letters, no numbers, no watermark. A tab for a game UI, front view,
160 by 44 pixels: a dark navy slate plate (#1c2638) with slightly rounded top corners and a
flat bottom edge, a bright sky-blue (#38bdf8) painted strip along the bottom edge (the
"selected" mark), thin steel outline. Calm flat middle for a label. Straight left and right
sides so it can be stretched. On a flat pure magenta #FF00FF background.
```

### `tab_idle.png`

```
(same as tab_active.png, but) darker (#0d131d) plate, no blue strip, a thin dull steel
outline, clearly less prominent. Same size and shape.
```

---

## 3. Hotbar-Rahmen

### `hotbar_frame.png` (256x96, 9-Slice Ecke 24)

```
Hand-painted gouache and ink illustration with visible brush texture and slightly uneven
hand-drawn dark outlines, in a bright, warm, natural storybook style. Fresh, saturated but
harmonious colors, clean readable shapes, friendly and a little rugged, never dirty or grim.
No neon, no glossy 3D render, no photorealism, no lens flares, no glow effects, no airbrushed
gradients. No text, no letters, no numbers, no watermark. A wide low bar frame for a game
action bar, front view, 256 by 96 pixels. A slim painted steel border (about 18 pixels) with
small brass end caps on the left and right, rivets at the corners, symmetric so it can be
cut into a 3x3 grid, the top and bottom edges tile without seams. The CENTER is a flat,
semi-dark navy slate (#0d131d), calm, no details, because ability icons are placed on it.
The frame touches the image border on all sides.
```

---

## 4. Seltenheitsrahmen (5 Stück, je 128x128)

Rahmen um ein Item. Mitte **transparent** (Magenta), Rand ca. 8 px, gleiche Form in allen fünf Stufen, nur Farbe und Zierrat steigen. Sie werden quadratisch über die Item-Karte gestreckt (Karten sind 56-96 px groß).

Gemeinsamer Kern für alle fünf:

```
Hand-painted gouache and ink illustration with visible brush texture and slightly uneven
hand-drawn dark outlines, in a bright, warm, natural storybook style. Fresh, saturated but
harmonious colors, clean readable shapes, friendly and a little rugged, never dirty or grim.
No neon, no glossy 3D render, no photorealism, no lens flares, no glow effects, no airbrushed
gradients. No text, no letters, no numbers, no watermark. A square item frame for a game
inventory slot, front view, 128 by 128 pixels, only the border, about 8 pixels thick, with
rounded corners. The inside of the frame and everything outside is a flat pure magenta
#FF00FF background. Perfectly symmetric.
```

Dann je Stufe anhängen:

- **`frame_common.png`**: `Material: plain grey-silver (#94a3b8) painted metal, a single clean line, no decoration.`
- **`frame_uncommon.png`**: `Material: green (#22c55e) painted metal with a thin second inner line, tiny leaf-shaped corner marks.`
- **`frame_rare.png`**: `Material: blue (#3b82f6) painted metal with a double line and small rivets at the four corners.`
- **`frame_epic.png`**: `Material: purple (#a855f7) painted metal, double line, corner brackets with a small gem-like jewel at each corner.`
- **`frame_legendary.png`**: `Material: golden-yellow (#eab308) painted metal, ornate double line, bigger corner brackets with a jewel and small wing-like flourishes at the top corners. The most ornate of the five, but still thin and readable.`

---

## 5. Hangar-Hintergrund

### `hangar_bg.png` (1200x800)

```
Hand-painted gouache and ink illustration with visible brush texture and slightly uneven
hand-drawn dark outlines, in a bright, warm, natural storybook style. Fresh, saturated but
harmonious colors, clean readable shapes, friendly and a little rugged, never dirty or grim.
No neon, no glossy 3D render, no photorealism, no lens flares, no glow effects, no airbrushed
gradients. No text, no letters, no numbers, no watermark. The inside of a tank workshop
hangar, seen from the front at eye level, wide format 3:2. A concrete floor with a round
turntable platform in the exact center (empty, a clean painted pedestal with yellow-black
hazard edge), tool racks, hanging chains, a crane rail along the ceiling and crates along the
side walls, warm lamplight from above. The center and the lower third stay EMPTY and calm
because a vehicle and UI will be placed there. Colors slightly darker and muted at the edges
so it works behind a game window. No vehicles, no people.
```

---

## 6. Titel- und Login-Kunst (3 Fraktionen, je 1920x1080)

Links 40 % bleiben ruhig und dunkler (dort liegen Logo und News), die Szene lebt rechts. Keine Texte, kein Logo im Bild.

Gemeinsamer Kern:

```
Hand-painted gouache and ink illustration with visible brush texture and slightly uneven
hand-drawn dark outlines, in a bright, warm, natural storybook style. Fresh, saturated but
harmonious colors, clean readable shapes, friendly and a little rugged, never dirty or grim.
No neon, no glossy 3D render, no photorealism, no lens flares, no glow effects, no airbrushed
gradients. No text, no letters, no numbers, no watermark. Wide 16:9 key art for a tank game
title screen. The left 40 percent of the image is calm, darker and low in detail (a soft
vignette), the main scene is in the right 60 percent. Evening light, a small group of
three armored vehicles seen from slightly above and from the side, driving towards the
viewer's right.
```

Dann je Fraktion anhängen:

- **`title_coastal.png`**: `Setting: a harbour coast at dusk, calm sea with a lighthouse and fishing boats, wooden piers, salt marsh grass, sky in blue and turquoise tones with warm pink clouds. Vehicles in blue-white colors with a small wave emblem on the side.`
- **`title_highland.png`**: `Setting: a mountain pass with pine forest, stone bridges, waterfalls and snow caps in the distance, sky in orange and soft green tones. Vehicles in forest green with orange details and a small pine emblem.`
- **`title_steppe.png`**: `Setting: wide golden grass steppe with a caravan road, windmills, wagons with colorful canopies and distant dust, sky in warm yellow and red tones. Vehicles in sand-yellow with red details and a small wheel emblem.`

---

## 7. Ladebilder (6 Stück, je 1920x1080)

Szenen ohne Fahrzeug-Nahaufnahme, mehr Stimmung. Sie liegen mit 55 % Deckkraft unter Text und Ladebalken, also ruhig und ohne harte Kontraste in der Mitte. Gleicher Kern wie bei den Titelbildern (Stil-Vorspann, 16:9, linke Hälfte ruhig). Danach je Bild:

- **`loading_1.png`**: `Scene: a lone tank track field in morning fog, tread marks winding through green grass towards a distant red barn and a wind pump.`
- **`loading_2.png`**: `Scene: a mechanics yard at golden hour, a half-repaired tank with open hatches, tools and parts scattered neatly, a kettle on a fire.`
- **`loading_3.png`**: `Scene: a mountain road at night, a convoy of three small headlights far in the distance, starry sky, snow on the roadside.`
- **`loading_4.png`**: `Scene: a desert caravan stop at noon, tents, water barrels, a parked scout buggy and a heavy tank in the shade, heat haze.`
- **`loading_5.png`**: `Scene: a ruined stone fortress on a hill after rain, rainbow in the sky, moss on the walls, a small outpost flag.`
- **`loading_6.png`**: `Scene: a snowy foundry valley, chimneys with calm smoke, a rail line, a tank crossing a frozen river, warm window lights.`

---

## 8. Karte: Rahmen und Pergament

### `map_frame.png` (512x512, 9-Slice Ecke 40, Mitte transparent)

```
Hand-painted gouache and ink illustration with visible brush texture and slightly uneven
hand-drawn dark outlines, in a bright, warm, natural storybook style. Fresh, saturated but
harmonious colors, clean readable shapes, friendly and a little rugged, never dirty or grim.
No neon, no glossy 3D render, no photorealism, no lens flares, no glow effects, no airbrushed
gradients. No text, no letters, no numbers, no watermark. A square decorative frame for a
treasure-style world map, front view, 512 by 512 pixels: a wooden frame with brass corner
pieces and small compass-rose ornaments in the four corners, wood grain painted, border
about 36 pixels thick, perfectly symmetric for 3x3 slicing, edges tile without seams. The
inside and everything outside the frame is a flat pure magenta #FF00FF background.
```

### `parchment.png` (1600x1000)

```
Hand-painted gouache and ink illustration with visible brush texture and slightly uneven
hand-drawn dark outlines, in a bright, warm, natural storybook style. Fresh, saturated but
harmonious colors, clean readable shapes, friendly and a little rugged, never dirty or grim.
No neon, no glossy 3D render, no photorealism, no lens flares, no glow effects, no airbrushed
gradients. No text, no letters, no numbers, no watermark. An aged parchment sheet filling
the whole image, wide format, very low contrast: soft beige and tan paper with faint
fibres, light coffee stains at the corners only, a few thin faint fold lines, the middle
almost plain. It must stay calm and slightly dark-toned (map markers and labels are drawn
on top of it), no coastline or drawings.
```

---

## 9. Abzeichen und Banner

### `badge_ribbon.png` (96x28, 9-Slice Ecke 12)

```
Hand-painted gouache and ink illustration with visible brush texture and slightly uneven
hand-drawn dark outlines, in a bright, warm, natural storybook style. Fresh, saturated but
harmonious colors, clean readable shapes, friendly and a little rugged, never dirty or grim.
No neon, no glossy 3D render, no photorealism, no lens flares, no glow effects, no airbrushed
gradients. No text, no letters, no numbers, no watermark. A small ribbon label for a game
UI, front view, 96 by 28 pixels: a short painted cloth ribbon in sky-blue (#38bdf8) with a
darker outline and small swallow-tail notches at both ends, a calm flat middle for a short
word. On a flat pure magenta #FF00FF background.
```

### `banner_ribbon.png` (640x120)

```
Hand-painted gouache and ink illustration with visible brush texture and slightly uneven
hand-drawn dark outlines, in a bright, warm, natural storybook style. Fresh, saturated but
harmonious colors, clean readable shapes, friendly and a little rugged, never dirty or grim.
No neon, no glossy 3D render, no photorealism, no lens flares, no glow effects, no airbrushed
gradients. No text, no letters, no numbers, no watermark. A wide victory banner for a game
announcement, front view, 640 by 120 pixels: a dark navy cloth banner (#0d131d) with a
golden-brass thin border, folded ribbon tails with swallow-tail ends at the left and right
side, small brass stars at the ends. The middle is calm and dark for large light text. On a
flat pure magenta #FF00FF background.
```

---

## 10. Logo

### `logo.png` (800x240, Alpha)

```
Hand-painted gouache and ink illustration with visible brush texture and slightly uneven
hand-drawn dark outlines, in a bright, warm, natural storybook style. Fresh, saturated but
harmonious colors, clean readable shapes, friendly and a little rugged, never dirty or grim.
No neon, no glossy 3D render, no photorealism, no lens flares, no glow effects, no airbrushed
gradients. No watermark. A logo lockup for a tank MMO called TREADFRONT, wide format 10:3.
On the left a round emblem: a stylized tank track tread forming a ring around a small round
turret seen from above with a cannon pointing to the right, steel blue with brass trim. To
the right of the emblem the word "TREADFRONT" in bold, slightly weathered painted capital
letters, off-white (#e8eef9) with a dark navy outline and a subtle hand-painted brush edge,
letters evenly spaced. Nothing else, no tagline. On a flat pure magenta #FF00FF background.
```

---

## Prüfliste nach dem Einbau

1. Datei in `public/assets/ui/` ablegen, exakten Namen und Größe prüfen.
2. Pfad in `public/assets/manifest.json` unter `sprites` eintragen.
3. `npm run dev`, Seite neu laden, Fenster öffnen: Rahmen sitzt in den Ecken? Text gut lesbar?
4. `npm run ui-shots -- --quick` macht Bilder aller Bildschirme, `npm run layout-check` prüft Layout und Mindestgrößen.
5. Kontrast: Auf der Mitte von Panel, Fenster, Button und Hotbar muss heller Text `#e8eef9` mindestens 7:1 haben. Im Zweifel die Mitte dunkler malen.
