# /code-comments

Rewrite documentation in professional English. Remove Italian comments. Keep logic and user-facing strings unchanged.

## TypeScript / React (JSDoc)

- Add JSDoc on components, hooks, and non-trivial helpers: responsibility, non-obvious params/returns, side effects.
- No line-by-line noise (`// set loading to true`).
- Prefer types in signatures; JSDoc adds intent and invariants types cannot express.

## PHP / Laravel (PHPDoc)

- Prefer PHPDoc blocks over inline comments.
- Document classes (Controllers, Requests, Actions, Services, Jobs, Events, Listeners, Policies, Enums, Traits) and public methods; protected/private only when non-trivial.
- Include: summary of intent, Larastan array shapes / Collection generics, side effects, domain invariants, `@throws` when relevant.
- Do not restate obvious scalar types already in the signature unless tooling needs it.
- Keep formatting clean: aligned stars, at most one blank line between docblock and symbol.

## Shared

- Max one blank line between sections.
- Do not change runtime behavior.
