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
- **Contrast:** light and dark themes must both pass WCAG 2.2 AA, meaning 4.5:1 for text and 3:1 for UI components, borders and focus indicators. Never convey status by color alone; pair it with text or an icon. Measured key pairs live in [`docs/a11y-contrast-pairs.md`](./docs/a11y-contrast-pairs.md) (light, dark, `html.high-contrast`, `html.high-contrast.dark`). Keep `prefers-contrast: more` and `html.high-contrast` token blocks in sync.
- **Accessibility (WCAG 2.2 AA):** expand the checklist below for every UI PR. Tracking detail: [#252](https://github.com/qiick-io/externa-core/issues/252)–[#255](https://github.com/qiick-io/externa-core/issues/255).
  - Decorative Lucide icons: `aria-hidden="true"` unless the icon alone carries meaning (then `role="img"` + translated `aria-label`).
  - Icon-only controls: accessible name from `a11y.*` (or feature) keys in **en / de / it**.
  - Prefer native elements (`<button>`, `<nav>`, `<main>`, `<ul>`) over ARIA roles on `div`/`span`.
  - Forms: every control has a programmatic label; errors use `aria-invalid` + `aria-describedby` (shadcn `Field*` — #231); help text via `FieldDescription`.
  - Focus: visible ring (≥3:1) on every interactive element; restore focus after dialogs/drawers close (#254).
  - Live regions for async feedback; no status by colour alone.
  - Skip link first focusable → `#main-content`; exactly one `<main>` per page.
  - Test at 320px width and ~400% zoom; never set `maximum-scale` / `user-scalable=no` on the viewport meta.
  - One a11y concern per PR when practical (rules, landmarks, forms, tooling).

Tracking issues: [#226](https://github.com/qiick-io/externa-core/issues/226) (qiick tokens mapped onto the shadcn variables), [#242](https://github.com/qiick-io/externa-core/issues/242) (AI accent), [#243](https://github.com/qiick-io/externa-core/issues/243) (theme presets), and the rest of the 1.4.0 UI audit (#227–#241).

## Release shipping (agents & maintainers)

**Do not auto-ship to `main`.** Opening a `develop` → `main` release PR (full body + assignee + milestone) is fine. **Maintainers** merge that PR, create the `vX.Y.Z` tag, and publish the GitHub Release.

Agents must **not** merge the release PR, create git tags, or run `gh release create` unless the user explicitly asks. Docs: [Releasing & versions](https://docs.externa.qiick.io/docs/releasing).
