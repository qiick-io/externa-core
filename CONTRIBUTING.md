# Contributing to externa-core

Operators who only deploy via Packagist / Docker can ignore this file. **Contributors** developing externa-core should read on.

## Code of Conduct

Participation is governed by our [Code of Conduct](./CODE_OF_CONDUCT.md). Report violations through the channel described there and in [SECURITY.md](./SECURITY.md) — not via public issues.

## Pull requests

Open PRs against `develop` using the [pull request template](./.github/pull_request_template.md). Link the issue with `Closes #…`, keep one issue per PR, and follow the checklist in the template.

## Setup

```bash
git clone https://github.com/qiick-io/externa-core.git
cd externa-core
nvm use          # Node 24
composer install
npm ci           # prepare installs Lefthook hooks when .git is present
```

Docs: [Contributing](https://docs.externa.qiick.io/docs/contributing).

## Local git hooks (Lefthook)

| Hook | What runs |
| --- | --- |
| `pre-commit` | Pint on dirty PHP; ESLint + Prettier on staged JS/TS/CSS |
| `commit-msg` | commitlint (Conventional Commits) |
| `pre-push` | `pint --test` + `eslint` — **not** full Pest |

`npm` `prepare` runs `lefthook install` only when `.git` exists (clone/checkout). Docker/`npm ci` without a git checkout no-ops — image builds stay green.

**CI is authoritative.** Hooks can be skipped: `LEFTHOOK=0` or `git commit --no-verify` (emergency only).

Reinstall hooks: `npx lefthook install`.

## Quality gates

```bash
composer lint:check
composer analyse   # Larastan/PHPStan (baseline in phpstan-baseline.neon)
composer test
npm run lint:check && npm run format:check && npm run types:check
```

New PHPStan findings outside the baseline fail CI (`lint` workflow). Regenerate only intentionally: `composer analyse:baseline`.

## Commit messages

Conventional Commits (`feat:`, `fix:`, `docs:`, `ci:`, …) — aligns with CHANGELOG / release process.

## Official headless starters

New framework starters are **separate public repos** under `qiick-io` (not a monorepo). Shared naming, env vars, TypeScript bar, CI, and update cadence: [`docs/starters.md`](./docs/starters.md) (#156).

## UI contributions

Rules for changes to the admin UI (`resources/js`). The values live in the linked issues; treat them as the source of truth until they ship.

- **shadcn/ui is the base.** Customize through theme CSS variables, `cva` variants and composition, not by forking primitives. Before building a component, check the official shadcn registry (`field`, `switch`, `radio-group`, `select` / `native-select`, `alert-dialog`, `empty`, `pagination`, …) and add it with the shadcn CLI. Hand-build only when shadcn has no equivalent, and say why in the PR.
- **No raw native form controls** in the admin: no checkbox used as a toggle (use `Switch`), no bare native radios (use `RadioGroup`), no unstyled `<select>` (use `Select`, or `NativeSelect` for long lists and mobile).
- **Icons: `lucide-react` only.** No Heroicons, no other icon sets, no hand-drawn inline SVG icons. Brand logos are the only exception.
- **Colors come from theme tokens.** Never hard-code hex values or ad-hoc Tailwind palette colors (`bg-orange-500`, `text-emerald-600`, …) in components. Use the semantic roles:
  - `primary`: qiick teal by default, overridable per project via `--brand-primary` / `--brand-primary-dark` (#226), with built-in presets (#243);
  - `success`, `warning`, `danger`, `info`: status roles (#226);
  - `ai`: violet, the single accent for every AI surface such as the AI FAB, AI nav, translating fields and the AI pages (#242).
- **Type and spacing scale (#240).** Prefer Tailwind/qiick scale tokens in page code (`resources/js` outside `components/ui`):
  - Font size: `text-xs` … `text-4xl` (and weight/color for hierarchy). Do not use arbitrary `text-[Npx]` / `text-[Nrem]` under 12px.
  - Spacing: prefer `2` / `3` / `4` / `6` / `8` / `12` for `p` / `m` / `gap` / `space-*`. Avoid off-scale steps (`1.5`, `2.5`, `5`, `7`, `9`, `10`) unless layout-coupled (for example icon-offset `pl-9`).
  - `components/ui` stock primitives are exempt; leave their internals alone.
  - Guardrail: `npm run lint:ui-tokens` (also part of `npm run lint:check`) fails on new arbitrary font sizes and on new/increased raw palette or `#hex` in `className` outside `components/ui` (see `scripts/ui-token-baseline.txt` for existing debt to pay down).
- **Control sizes (#462, #472).** One height scale for every control, the antd scale, defined once in `resources/css/app.css` (`--spacing-control-sm` / `--spacing-control` / `--spacing-control-lg`, used as `h-control`, `size-control-sm`, `min-w-control-lg`, …):

  | Size | Height | Text / icons | Button / Toggle inline padding | Used by |
  | --- | --- | --- | --- | --- |
  | `sm` | 24px | `text-xs` / 14px (`size-3.5`) | `px-2` (`px-1.5` with an icon) / `px-1.5` | compact inline actions only: table row icon actions, table header menus, chips |
  | `default` | 32px | `text-sm` / 16px (`size-4`) | `px-4` (`px-3` with an icon) / `px-3` | everything else: app-header actions, page headers, list toolbars and filters, the item-edit header, sub-header and schedule bar, forms, settings sections, dialogs, drawers |
  | `lg` | 40px | `text-sm` / 16px (`size-4`) | `px-6` (`px-4` with an icon) / `px-4` | rare empty-state or hero CTAs; never in page headers |

  - Every control at one size shares height, `rounded-md`, text size and icon size: `Button` (`sm` / `default` / `lg`, icon-only `icon-sm` / `icon` / `icon-lg` are square), `Input`, `InputGroup` (its buttons are `h-control-sm` so they fit inside), `NativeSelect` and `SelectTrigger` (`size="sm"` or default; `SelectItem` rows are `min-h-control`), `Toggle` / `ToggleGroup` (icon-only items stay square), and the date-time picker trigger (`fieldControlHeight`).
  - Use the default size: don't pass `size="sm"` / `"icon-sm"` and don't override heights with `h-8` / `h-9` / `h-10` / `size-8` / `min-h-9` or shrink text with `text-xs` on a control. In one row every control has the same size, and primary (filled) buttons are never bigger than secondary ones ("Test sound" and "Save" in Settings are both 32px).
  - `sm` is for compact inline actions only and needs at least `gap-1` between targets. 24px meets the WCAG 2.2 SC 2.5.8 minimum target size (24 × 24px); every other step is above it.
  - `tests/Browser/ControlScaleBrowserTest.php` measures the header, toolbar and form controls on files, collections, items, item edit, settings and the activity log.

- **Contrast:** light and dark themes must both pass WCAG 2.2 AA, meaning 4.5:1 for text and 3:1 for UI components, borders and focus indicators. Never convey status by color alone; pair it with text or an icon. Measured key pairs live in [`docs/a11y-contrast-pairs.md`](./docs/a11y-contrast-pairs.md) (light, dark, `html.high-contrast`, `html.high-contrast.dark`); CI runs `npm run a11y:contrast`. Keep `prefers-contrast: more` and `html.high-contrast` token blocks in sync.
- **Accessibility (WCAG 2.2 AA):** expand the checklist below for every UI PR. Tracking detail: [#252](https://github.com/qiick-io/externa-core/issues/252)–[#255](https://github.com/qiick-io/externa-core/issues/255).
  - Decorative Lucide icons: `aria-hidden="true"` unless the icon alone carries meaning (then `role="img"` + translated `aria-label`).
  - Icon-only controls: accessible name from `a11y.*` (or feature) keys in **en / de / it**.
  - Prefer native elements (`<button>`, `<nav>`, `<main>`, `<ul>`) over ARIA roles on `div`/`span`.
  - Forms: every control has a programmatic label; errors use `aria-invalid` + `aria-describedby` (shadcn `Field*` — #231); help text via `FieldDescription`.
  - Focus: visible ring (≥3:1) on every interactive element; restore focus after dialogs/drawers close (#254).
  - Live regions for async feedback; no status by colour alone.
  - Reduced motion: OS `prefers-reduced-motion` always wins; `html.reduce-motion` can force on. Prefer targeted overlay `animation: none` over global `*` duration overrides so Radix/vaul Presence still unmounts (#254).
  - Skip link first focusable → `#main-content`; exactly one `<main>` per page.
  - Test at 320px width and ~400% zoom; never set `maximum-scale` / `user-scalable=no` on the viewport meta.
  - One a11y concern per PR when practical (rules, landmarks, forms, tooling).
  - Lint: `eslint-plugin-jsx-a11y` errors on `components/` / `layouts/` / `hooks/` (shadcn `components/ui/*` ignored — covered by axe); warnings elsewhere with `--max-warnings 0`.
  - Axe smoke: `tests/Browser/A11ySmokeBrowserTest.php` (critical/serious) gates the `browser` CI check on code PRs.
  - Manual AT pass: [`docs/a11y-screen-reader-checklist.md`](./docs/a11y-screen-reader-checklist.md) before release.
  - Third-party limits (TipTap, CodeMirror, Leaflet, …): [`docs/a11y-third-party-limits.md`](./docs/a11y-third-party-limits.md) — labelled wrappers + keyboard alternatives, no forks.

Tracking issues: [#226](https://github.com/qiick-io/externa-core/issues/226) (qiick tokens mapped onto the shadcn variables), [#242](https://github.com/qiick-io/externa-core/issues/242) (AI accent), [#243](https://github.com/qiick-io/externa-core/issues/243) (theme presets), and the rest of the 1.4.0 UI audit (#227–#241).

## Release shipping (agents & maintainers)

**Do not auto-ship to `main`.** Opening a `develop` → `main` release PR (full body + assignee + milestone) is fine. **Maintainers** merge that PR, create the `vX.Y.Z` tag, and publish the GitHub Release.

Agents must **not** merge the release PR, create git tags, or run `gh release create` unless the user explicitly asks. Docs: [Releasing & versions](https://docs.externa.qiick.io/docs/releasing).
