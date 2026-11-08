# /code-comments

Rewrite the documentation of the selected code in professional English. Keep logic and user-facing strings unchanged.

## TypeScript / React (JSDoc)

- JSDoc on components, hooks and non-trivial helpers: responsibility, non-obvious params and returns, side effects.
- Types belong in signatures; JSDoc adds intent and invariants that types cannot express.
- No line-by-line noise (`// set loading to true`).

## PHP / Laravel (PHPDoc)

- PHPDoc blocks over inline comments.
- Document classes (controllers, requests, actions, services, jobs, events, listeners, policies, enums, traits) and public methods; protected / private ones only when non-trivial.
- Include: intent, PHPStan / Larastan array shapes and collection generics, side effects, domain invariants, `@throws` when relevant.
- Do not restate scalar types already in the signature unless tooling needs it.
- Aligned stars, at most one blank line between sections.

Do not change runtime behaviour.
