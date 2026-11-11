<!-- Generated from qiick-io/app-ui standards: do not edit, run the sync. The agent files hold the core of this page and point here. -->

# Testing

- Pest for PHP (`*Test.php`), Vitest or `node:test` for TypeScript / scripts. Test behaviour, not private structure.
- Every behaviour change adds or updates a test that fails without the change. Pure copy, styling or layout changes need none.
- Never delete, skip or weaken an existing test to get green; ask the maintainer first.
- No real network, AI provider or external process in tests: `Http::fake()`, `Process::fake()`, recorded fixtures, fake providers.
- Use model factories (and their states) for test data.
- UI flows that only a browser proves (navigation, dialogs, keyboard, focus) get a Pest browser test (`tests/Browser`, `pestphp/pest-plugin-browser`) where the repo has the plugin; check light and dark.
- `tests/Arch/NamingArchitectureTest.php` stays green. A new class satisfies its role suffix; scaffolding is listed in `tests/Arch/naming-architecture.php`, never renamed.
- Run the narrowest tests while iterating (`--filter`, a file path), and the repo's full quality gate (listed in its own section) before every push.
