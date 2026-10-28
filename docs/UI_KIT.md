# Treadfront UI kit (`src/ui/kit/`)

One design language for every screen. New screens use the kit and the tokens, not ad-hoc Tailwind colours.

## Tokens (`tokens.css`, the only place for them)
- **Surfaces** `--c-bg-0..3` (dark), `--c-line`, `--c-line-strong`; **text** `--c-text`, `--c-text-2`, `--c-text-3` (all >= 4.5:1 on `--c-bg-1`, tested in `test/ui_a11y.test.ts`).
- **Status** `--c-good|bad|warn|info`; **bars** `--c-hull|armor|xp`; **rarity** `--r-common..legendary` (same hex as `RARITY_CONFIGS`).
- **Accent roles** `--accent`, `--accent-2`, `--accent-ink`, `--accent-soft`, `--accent-line`. Default is the classic orange; `<html data-faction="coastal|highland|steppe">` switches them (`applyFactionTheme(faction)`).
- **Spacing** `--s-1..10` (4 px base), **type** `--t-xs..2xl` (never below 11 px), **radii** `--r-sm..pill`, **elevation** `--e-1..3` (box-shadow only), **motion** `--m-fast|med|slow` + `--ease-out` (0 ms with `prefers-reduced-motion` or `.reduced-motion` on `<html>`), **layers** `--z-hud < rail < window < modal < toast < tooltip < overlay`.

## Components (import from `src/ui/kit/index.ts`)
Panel (header/footer/art slot), Button (primary, secondary, danger, ghost, icon; loading, disabled, pressed), Tabs (roving tabindex, pips), SegmentedControl, Tooltip (hover, focus, 450 ms long-press on touch, flips and clamps), Badge, PipHost (dot or counter on any child), ProgressBar (with trailing ghost), Ring, CurrencyChip (painted icons), StatRow (green/red delta, `lowerIsBetter`), ItemCard + AffixList (rarity frame), VirtualList/VirtualGrid (thousands of rows, a few dozen DOM nodes), ToastHost + `toasts.push()`, Modal (focus trap, Escape, `sheet` for phones), EmptyState, Skeleton/SkeletonRows.

## Art slots
`art.tsx` lists optional painted files under `public/assets/ui/` (see `docs/bildprompts-ui.md`). A slot shows its image only when `manifest.json` lists the path; otherwise the CSS fallback is used and no request is made. To add art: copy the PNG, add its path to `public/assets/manifest.json`, done, no code change.

## Rules
- Touch targets >= 44 px (the global `pointer: coarse` rule and `--hit` handle it), text >= 11 px, animations only on `transform`/`opacity`, no `shadowBlur`.
- Everything visible goes through `tr()`/`nm()`; kit components take already translated props.
- Colour is never the only signal (deltas have arrows, rarity has a name in the accessible label).

## Gallery
`#/ui-gallery?faction=steppe&lang=de` shows every component in every state (lazy-loaded, does not affect the game bundle). `npm run gallery-shots` writes `docs/screenshots/ui-kit/<faction>_<lang>.png` and checks that the virtual list/grid stay small.

## Pure logic with tests (`test/ui_kit.test.ts`)
`rarityStyle`, `formatDelta`, `tooltipPosition`, `virtualRange`, `gridColumns`, `ringDash`, `compactNumber`.

## Painted art slots
Every slot falls back to CSS until `public/assets/ui/<file>.png` exists **and** is listed in `public/assets/manifest.json`. Prompts, sizes and the slot table are in `docs/bildprompts-ui.md`. Mechanics (`kit/art.tsx`): `useArt(path)` (boolean), `ArtSlot` (image or CSS children), `useArtFrame(path, slice)` (9-slice `border-image` attributes, spread on an element). Wired: Panel (`panel_frame`), WindowFrame float mode (`window_frame`), primary Button (4 states), Tabs (`tab_active` / `tab_idle`), Hotbar (`hotbar_frame`), ItemCard (5 rarity frames), Hangar preview (`hangar_bg`), title (`title_<faction>`), loading (`loading_1..6`), world map (`map_frame`, `parchment`), accent Badge (`badge_ribbon`), announce banner (`banner_ribbon`), Logo (`logo`).
Rule when adding a slot: call the hook **above** any early `return null` (a hook after it crashes with React error 310 the first time the window opens; layout-check reports page errors).

## Visual QA and budgets
- `npm run ui-shots` screenshots every screen (title, loading, recovery, ready, HUD, all windows, every settings tab) per language, viewport and faction theme into `docs/screenshots/ui/<lang>/<viewport>/<faction>_<screen>.png` (`--quick`, `--langs`, `--factions`, `--viewports`, `--screens`, `--format jpeg`). `--mask-canvas --diff <baseline>` compares against a baseline folder and exits 1 above `--threshold` percent changed pixels. The CI job `ui-shots` is opt-in (workflow input or PR label).
- `test/ui_a11y.test.ts`: WCAG contrast of the tokens for the default and all three faction themes. `layout-check` walks every window with the keyboard (accessible names, focus ring, focus trap on phones).
- `npm run budget`: gzip limits for the entry bundle (330 KB), all JS (360 KB) and CSS (24 KB); `npm run e2e` also checks first render (title screen under 5 s in software-rendered Chromium, first contentful paint under 3 s).
