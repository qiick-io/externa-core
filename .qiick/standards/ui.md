<!-- Generated from qiick-io/app-ui standards: do not edit, run the sync. The agent files hold the core of this page and point here. -->

# UI (qiick app UI)

No agent invents a layout, a component, a colour or a component position in a qiick app. The only exceptions are explicit overrides (rule 2).

## Before any UI change

Patterns come in two tiers. **Core** patterns bind every qiick app. **Optional** patterns are accepted solutions that bind only the apps that adopt them, by listing them in `qiick-standards.json` `patterns`. Optional patterns adopted in this repo: none.

1. Find the pattern in the tables in the details and read its page: each one names the registry items, and the reference app files where they are not in the registry yet.
2. Install it from the `@qiick` registry with `npx shadcn add @qiick/<name>`; do not rewrite it. The registry list: https://github.com/qiick-io/app-ui/blob/develop/registry/README.md
3. If the registry does not have it yet, copy it from the reference app the page names, file by file.
4. When a screen needs what an optional pattern solves and this app has not adopted it, ask the maintainer to adopt it (add it to `patterns`). Do not build a variant of your own.
5. If no core or optional pattern fits, **stop and ask the maintainer**. A new solution is proposed in app-ui as an optional pattern, never designed inside one app.

## Hard rules

1. **Source of truth.** The `@qiick` registry; until an item ships there, the reference app its pattern page names. Copy, never redesign.
2. **Overrides.** An intentional difference from the registry is listed in the app's `app-ui.overrides.json` with a reason per file. Any other difference fails the drift check in CI.
3. **Primitives.** shadcn components only (the registry `ui` items). Icons: `lucide-react` only. No Headless UI or other component libraries.
4. **Colours.** Theme tokens only (`bg-primary`, `text-muted-foreground`, `border-sidebar-border`, …). No hex and no raw palette classes (`bg-teal-600`, `text-neutral-500`) in `className`; no arbitrary font sizes (`text-[11px]`).
    - AI surfaces use the violet `ai` token set (`bg-ai`, `text-ai-text`, `border-ai-border`, …), never the brand primary.
    - Status colours (`success`, `warning`, `destructive`, `info`) carry status only; never use one as a brand or primary colour.
5. **Control scale.** `sm` 24px, default 32px, `lg` 40px. The default (32px) everywhere: headers, toolbars, forms, settings. `sm` only for compact inline actions (table row icons, chips); `lg` for rare large CTAs.
6. **Accessibility.** WCAG 2.2 AA in light, dark and high contrast: visible focus, keyboard reachability, labels / `aria-label` on icon-only controls, contrast. Check every UI change in light and dark.
7. **Positions are part of the pattern.** Where a control sits (primary action far right, filters left, pagination counter left / pages centre / rows per page right, …) is copied like the code.
8. **Presence.** shadcn `AvatarBadge` inside the `Avatar`, bottom-right. Users: green online, solid grey offline (never transparent). The realtime badge on the signed-in user: green connected, amber connecting, grey disabled, red only when the connection is lost. Member lists show avatars without presence, then `AvatarGroupCount` "+N".

## Theme

Tokens come from the `@qiick/theme` registry item: one shared base (surfaces, the two-tone shell, text, borders) plus brand-only presets (Teal = Externa, Blue = Excubia). An app picks its preset and never edits surface tokens. This repo's preset: **Teal**.

## Core pattern pages

| Pattern                                                          | Page                                                                        |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------- |
| App shell: two-tone sidebar, header, user menu, presence         | https://github.com/qiick-io/app-ui/blob/develop/docs/shell.md               |
| Page: `PageLayout`, header actions, view tabs, segmented filters | https://github.com/qiick-io/app-ui/blob/develop/docs/page.md                |
| List page: toolbar, selection bar, overflow, table, pagination   | https://github.com/qiick-io/app-ui/blob/develop/docs/list-page.md           |
| Settings page: secondary nav, form, Save bar                     | https://github.com/qiick-io/app-ui/blob/develop/docs/settings.md            |
| Forms: page vs drawer vs dialog, `Field`, validation errors      | https://github.com/qiick-io/app-ui/blob/develop/docs/forms.md               |
| Detail page: record header, status, fields                       | https://github.com/qiick-io/app-ui/blob/develop/docs/detail-page.md         |
| Auth pages and SSO                                               | https://github.com/qiick-io/app-ui/blob/develop/docs/auth.md                |
| Error pages 403 / 404 / 500 / 503                                | https://github.com/qiick-io/app-ui/blob/develop/docs/error-pages.md         |
| Empty states                                                     | https://github.com/qiick-io/app-ui/blob/develop/docs/empty-states.md        |
| Destructive actions                                              | https://github.com/qiick-io/app-ui/blob/develop/docs/destructive-actions.md |
| Dashboard cards                                                  | https://github.com/qiick-io/app-ui/blob/develop/docs/dashboard.md           |
| Notifications and messages (toasts)                              | https://github.com/qiick-io/app-ui/blob/develop/docs/notifications.md       |
| Chat and Assistant                                               | https://github.com/qiick-io/app-ui/blob/develop/docs/chat-and-assistant.md  |
| Files grid                                                       | https://github.com/qiick-io/app-ui/blob/develop/docs/files-grid.md          |
| Theme: tokens, presets, control scale                            | https://github.com/qiick-io/app-ui/blob/develop/docs/theme.md               |

## Optional pattern pages

Adopt one by adding its name (with its variant when it has variants) to `patterns` in `qiick-standards.json`, then re-running the sync. What an optional pattern is and how its page is written: https://github.com/qiick-io/app-ui/blob/develop/docs/optional/README.md

| Optional pattern                                        | Name in `patterns`                               | Page                                                                                |
| ------------------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------- |
| Command palette and global search (⌘K)                  | `command-palette`                                | https://github.com/qiick-io/app-ui/blob/develop/docs/optional/command-palette.md    |
| Grouped view tabs with counts                           | `grouped-tabs:sub-menu`, `grouped-tabs:two-rows` | https://github.com/qiick-io/app-ui/blob/develop/docs/optional/grouped-tabs.md       |
| Inbox list: saved views, bulk actions, item detail      | `inbox-list:side-panel`, `inbox-list:full-page`  | https://github.com/qiick-io/app-ui/blob/develop/docs/optional/inbox-list.md         |
| Keyboard shortcuts and the ? help dialog                | `keyboard-shortcuts`                             | https://github.com/qiick-io/app-ui/blob/develop/docs/optional/keyboard-shortcuts.md |
| Sidebar filter, pinned and needs-attention entity lists | `sidebar-entities`                               | https://github.com/qiick-io/app-ui/blob/develop/docs/optional/sidebar-entities.md   |
| Table density preference                                | `table-density`                                  | https://github.com/qiick-io/app-ui/blob/develop/docs/optional/table-density.md      |
