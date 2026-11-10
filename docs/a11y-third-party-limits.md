# Third-party component accessibility limits

Externa admin embeds several third-party editors and widgets. We **do not fork** them for a11y. Each gets a labelled wrapper and, where practical, a native alternative. Tracked under the admin a11y plan (#252–#255); WCAG 2.2 AA.

| Library | Where | Known limits | Mitigation |
|---|---|---|---|
| **TipTap** | `item-field-rich-inputs.tsx` | Editor surface is a `contenteditable`; toolbar icon buttons need explicit names; paste/ARIA live updates vary by browser. | Field label via shadcn `Field*`; toolbar controls use translated `aria-label` / `a11y.*`; keep a plain-text path when the field type allows. |
| **CodeMirror / `@uiw/react-md-editor`** | code / markdown item fields | Complex roving tabindex inside the editor; some announcements are editor-chrome only. | Labelled field wrapper; markdown preview toggle is a real `<button>`; prefer CodeMirror a11y defaults without custom key remap. |
| **Leaflet** | `map-coordinate-input.tsx` | Map tiles and markers are largely mouse/pointer oriented; marker drag is not fully keyboard operable. | Always expose numeric lat/lng (and search) inputs beside the map; map container `aria-label` / role presentation as appropriate. |
| **react-day-picker** | date fields / calendar | Grid navigation works with arrows when focused; dialog vs inline variants differ. | Use the picker inside labelled popover/dialog; ensure trigger has an accessible name and focus returns on close. |
| **recharts** | dashboard / analytics charts | SVG charts are weak for screen readers; hover tooltips are pointer-first. | Provide a textual summary or data table alternative near the chart; do not convey status by colour alone in series. |
| **SortableJS** | field reorder / drag handles | Drag-and-drop reorder is not reliably available to keyboard / AT. | Provide **Move up / Move down** (or equivalent) buttons next to every drag handle; keep handle `aria-hidden` when buttons exist. |
| **react-file-icon** | file cards / attachments | Decorative file-type glyph only. | Treat as decorative (`aria-hidden`); accessible name comes from the file title / card label. |

## Contributor rules

- Prefer native controls and shadcn primitives over new third-party widgets.
- When adding a library with known AT gaps, extend this table and link it from [CONTRIBUTING → UI contributions](../CONTRIBUTING.md#ui-contributions).
- Automated axe smoke (`A11ySmokeBrowserTest`) may still pass while these widgets have residual limits — the manual [screen reader checklist](./a11y-screen-reader-checklist.md) covers them.
