# Admin contrast pairs (WCAG 2.2 AA)

Source tokens: `resources/css/app.css` (`:root`, `.dark`, `html.high-contrast`, `html.high-contrast.dark`).
Ratios measured from resolved hex (WCAG relative luminance). **Text** needs ≥4.5:1; **UI / border / focus** needs ≥3:1.

Brand override (`--brand-primary` / `--brand-primary-dark`): `ContrastingForeground` picks fg; if a project brand fails 3:1 against the surface, settings should warn or fall back (#243).

`prefers-contrast: more` mirrors the `html.high-contrast` (+ `.dark`) blocks — keep them identical when editing.

## Light (`:root`)

| Pair | Foreground | Background | Ratio | Need | Status |
|---|---|---|---|---|---|
| foreground / background | `#0e171e` (ink-950) | `#ffffff` | 18.10 | 4.5 | PASS |
| muted-foreground / background | `#516370` (ink-600) | `#ffffff` | 6.23 | 4.5 | PASS |
| muted-foreground / card | `#516370` | `#ffffff` | 6.23 | 4.5 | PASS |
| primary-foreground / primary | `#ffffff` | `#0e7c86` (teal-600) | 4.95 | 4.5 | PASS |
| destructive-foreground / destructive | `#ffffff` | `#bd1f2c` (red-600) | 6.18 | 4.5 | PASS |
| success-foreground / success | `#ffffff` | `#15803d` (green-600) | 5.02 | 4.5 | PASS |
| warning-foreground / warning | `#ffffff` | `#b45309` (amber-600) | 5.02 | 4.5 | PASS |
| info-foreground / info | `#ffffff` | `#2563eb` (blue-600) | 5.17 | 4.5 | PASS |
| input / background (UI) | `#8195a2` (ink-400) | `#ffffff` | 3.11 | 3.0 | PASS |
| ring / background (focus) | `#1a95a2` (teal-500) | `#ffffff` | 3.58 | 3.0 | PASS |
| sidebar-foreground / sidebar | `#516370` | `#f8fdfe` (ink-50) | 6.08 | 4.5 | PASS |

## Dark (`.dark`)

| Pair | Foreground | Background | Ratio | Need | Status |
|---|---|---|---|---|---|
| foreground / background | `#ebf3f6` (ink-100) | `#0e171e` (ink-950) | 16.11 | 4.5 | PASS |
| muted-foreground / background | `#d2dde5` (ink-200) | `#0e171e` | 13.12 | 4.5 | PASS |
| muted-foreground / card | `#d2dde5` | `#17232c` (ink-900) | 11.59 | 4.5 | PASS |
| primary-foreground / primary | `#0e171e` | `#1a95a2` (teal-500) | 5.06 | 4.5 | PASS |
| destructive-foreground / destructive | `#0e171e` | `#f0848c` (red-300) | 7.23 | 4.5 | PASS |
| success-foreground / success | `#0e171e` | `#3bb872` (green-400) | 7.14 | 4.5 | PASS |
| warning-foreground / warning | `#0e171e` | `#f09a1a` (amber-400) | 8.05 | 4.5 | PASS |
| info-foreground / info | `#0e171e` | `#8ec0ff` (blue-300) | 9.60 | 4.5 | PASS |
| input / background (UI) | `#637683` (ink-500) | `#0e171e` | 3.84 | 3.0 | PASS |
| ring / background (focus) | `#66d3db` (teal-300) | `#0e171e` | 10.26 | 3.0 | PASS |

## High contrast (`html.high-contrast`)

| Pair | Notes | Need | Status |
|---|---|---|---|
| foreground / background | ink-950 on white | 4.5 | PASS |
| muted-foreground / background | ink-700 on white (~8.6:1) | 4.5 | PASS |
| input / background | ink-600 on white (~6.2:1) | 3.0 | PASS |
| ring / background | teal-700 on white (~6.8:1) | 3.0 | PASS |

## High contrast dark (`html.high-contrast.dark`)

| Pair | Notes | Need | Status |
|---|---|---|---|
| foreground / background | white on ink-950 | 4.5 | PASS |
| muted-foreground / background | ink-200 on ink-950 | 4.5 | PASS |
| input / background | ink-300 on ink-950 | 3.0 | PASS |
| ring / background | teal-300 on ink-950 | 3.0 | PASS |

## CI

`npm run a11y:contrast` (`scripts/a11y-contrast.mjs`) resolves these pairs from `resources/css/app.css` and fails below the thresholds above. Runs in the `quality` lint workflow (#255).

## Related

- Token mapping: #226
- Focus ring / input borders: #227
- Semantic status Badge/Alert: #235
- AI accent pair: #242 (add when that lands)
- Automation / axe / screen reader checklist: #255
