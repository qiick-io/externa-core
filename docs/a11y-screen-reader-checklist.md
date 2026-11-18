# Admin screen reader checklist (WCAG 2.2 AA)

Manual pass for Externa admin before each minor release (1.4.0+). Findings that are not trivial become follow-up issues — do not block the release checklist on fixing every note inside the same PR.

**Assistive tech targets**

| AT | Browser | OS |
|---|---|---|
| VoiceOver | Safari | macOS |
| NVDA | Firefox or Chrome | Windows |

Record AT version, browser version, OS version, date, and tester for each run at the bottom.

## Surfaces

Run each item with keyboard only first, then with the screen reader.

1. **Login + 2FA** — skip link, field labels, error announcements, OTP / recovery codes.
2. **Navigation + skip link** — Tab lands on skip → Enter focuses `#main-content`; sidebar / mobile sheet nav names; breadcrumbs.
3. **Collections list** — table/list headers, row actions, empty state, filters/search.
4. **Item create / edit with errors** — labels, `aria-invalid` / `aria-describedby`, required fields, save / discard.
5. **Files** — upload control name, grid/list selection, detail panel, folder navigation.
6. **Destructive confirmation** — AlertDialog title/description, confirm/cancel focus restore.
7. **Toasts and notifications** — live region politeness; notifications bell unread name.
8. **AI chat** — composer, message list, attachment controls, pending-tool approval (if enabled).
9. **Settings** — profile, appearance (theme + brand), project tabs; language switcher.
10. **Reduced motion** — toggle `Reduce motion`; no essential information only in animation.
11. **High contrast** — toggle `High contrast` (and dark + high contrast); text and focus still readable.
12. **400% zoom** — usable at ~320 CSS px / 400% zoom without horizontal scrolling for primary tasks (WCAG 1.4.10).

## Third-party limits

See [`a11y-third-party-limits.md`](./a11y-third-party-limits.md) for TipTap, CodeMirror, Leaflet, calendars, charts, SortableJS, and file icons. Confirm labelled wrappers and keyboard alternatives still work.

## Automation coverage (does not replace this pass)

- Oxlint's `jsx-a11y` rules on shared React code (`npm run lint:check`)
- Pest Browser axe smoke (`tests/Browser/A11ySmokeBrowserTest.php`) — critical/serious on key routes
- Theme token contrast (`npm run a11y:contrast`)
- `a11y.*` locale parity (`tests/Unit/I18nLocaleParityTest.php`)

## Run log

| Date | AT + version | Browser | OS | Result | Notes / follow-ups |
|---|---|---|---|---|---|
| _pending 1.4.0_ | | | | | Run once before release; open issues for non-trivial findings. |
