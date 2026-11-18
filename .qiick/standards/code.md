<!-- Generated from qiick-io/app-ui standards: do not edit, run the sync. The agent files hold the core of this page and point here. -->

# Code standard

Every file follows classic craftsmanship, including files nobody reads line by line: self-explanatory names, English documentation of _why_ and of domain invariants, clean structure with breathing room, and no duplication.

## Simplest thing that works

Stop at the first rung that holds: YAGNI, standard library, platform, installed dependency, one line, then the minimum code.

- No unrequested abstractions, dependencies or boilerplate. A new Composer or npm dependency needs the maintainer's OK.
- Deletion over addition. Boring over clever. Fewest files possible.
- Mark an intentional shortcut with a `ponytail:` comment that names the ceiling and the upgrade path.
- Never lazy about trust-boundary validation, data-loss prevention, security, accessibility, or anything explicitly requested.
- Non-trivial logic leaves one runnable check behind (a test).

## Current sources, not memory

Before writing framework or library code, or copying a component from an upstream registry (shadcn, AI Elements), read the current official page for the installed version. Training data and old copies go stale: until 2026-11-09 the registry's AI Elements were a superseded release, and nobody had compared them with the current pages. A file copied from upstream names its source page in its header comment, and the registry README records the source and date of every upstream item.

## Names: full words

- No single letters (`x`, `e`, `q`) and no abbreviations (`cfg`, `res`, `req`, `val`, `arr`, `tmp`, `idx`, `usr`, `ctx`, `def`, `cb`). Full words even at 30+ characters (`$collectionFieldDefinition`, `handleFormSubmissionError`).
- `i`, `j`, `k` only as indices of tight numeric loops; prefer `foreach ($collectionItems as $collectionItem)`, `for...of`, `.map()`.
- **Booleans** (variables, columns, custom props, boolean-returning methods) start with `is`, `has`, `can` or `should` (`$isEmailVerified`, `canManageCollection()`, `shouldBroadcastImmediately`). Exempt: names fixed by a framework or library contract (see [Contracts](#contracts-never-break-them)).
- **Collections** use specific plurals (`$publishedArticles`) or explicit maps (`$usersIndexedById`), never `$data`, `$list`, `$arr`.
- Every class of our own ends with its role suffix (`*Controller`, `*Action`, `*Service`, `*Data`, `*Enum`, `*Job`, …); only Eloquent models use bare nouns. The full table is in the details.
- **Never rename framework or package scaffolding:** files native to Laravel or published by a package keep their upstream names: Fortify actions (`app/Actions/Fortify/*`), starter-kit files (`HandleInertiaRequests`, `HandleAppearance`, `app/Concerns/*`), default service providers, vendor-published files (Spatie, Horizon, Telescope, Pennant, Passport), and frontend primitives (`shadcn/ui` files in `components/ui/`). They are listed in the repo's `tests/Arch/naming-architecture.php`, never renamed.

## Architecture: five layers

1. **Thin controllers.** At most the 5 resource methods or one `__invoke`, about 10 to 15 lines each, doing three things: receive a typed `*Request`, call an `*Action` / `*Service` with a `*Data` DTO, return a `*Resource`, JSON or an Inertia page. No business logic, no `DB` facade.
2. **Domain layer.** Writes in `app/Actions/*Action.php`, orchestration and reads in `app/Services/*Service.php`, typed `readonly` DTOs in `app/Data/*Data.php` instead of `array<string, mixed>` between controllers, actions, services and jobs.
3. **Clean models.** Relationships, `casts()`, accessors / mutators, scopes (or an `app/Builders/*Builder.php`), table constants. Never HTTP calls, disk or S3 work, or multi-step orchestration in a model.
4. **Authorization in Policies**, called through `Gate::authorize()` or a FormRequest `authorize()`, not scattered checks.
5. **One domain for every surface.** The Inertia UI, the REST / GraphQL API, MCP / AI tools and the CLI call the same `*Action` and `*Service` classes; domain logic is never duplicated per surface.

The Pest architecture test (`tests/Arch/NamingArchitectureTest.php`) enforces the suffixes, readonly DTOs, `declare(strict_types=1)`, no debugging helpers, no `env()` outside `config/`, no `DB` facade in controllers, and at most five public methods per controller (existing debt ratcheted in `naming-architecture.php`).

## Formatting

- Curly braces on every `if`, `else`, `for`, `foreach`, `while`, `do`. No single-line braceless control statements.
- A blank line before and after control-flow blocks (`if`, `return`, `for`, `foreach`, `while`, `switch`, `try`, `throw`); ESLint `@stylistic/padding-line-between-statements` and Pint enforce it where configured.
- `declare(strict_types=1);` in every PHP file you write or touch.
- No `dd`, `dump`, `ray`, `var_dump`, `console.log` left behind. No `env()` outside `config/`.
- Strict DRY: extract shared validation rules, scopes, DTO shapes and UI primitives instead of copying blocks.

## Documentation (English PHPDoc / JSDoc)

This replaces the "comment only exceptionally complex logic" default of Laravel Boost and similar guidelines.

- **Class, component and hook docblock** (mandatory): the unit's responsibility and why it exists.
- **Method and function docblock** for what the signature cannot say:
    1. Array shapes and generics for PHPStan / Larastan (`@param array{title: string, slug: string} $validatedPayload`, `@return Collection<int, CollectionItem>`).
    2. Side effects: queued jobs, dispatched events, filesystem / S3 writes, external HTTP calls.
    3. Business invariants, why a guard exists, `@throws` conditions.
- No noise that restates the code (`// set loading to true`).

## Contracts: never break them

1. **Migrations are forward-only.** Never edit, rename or delete a migration in `database/migrations/` once it is merged into a released version: existing self-hosted installs would no longer upgrade. A schema or stored-data change is a new migration with a safe backfill. The reusable `migrations-frozen.yml` fails CI when a migration on `main`, on the latest tag or in `database/migrations/.frozen` changes. A repo that has not released yet may state a pre-release exception in its own section.
2. **Framework method contracts keep their names** (no `is` / `has` prefix forced on them): `FormRequest::authorize()`, Policy methods (`viewAny`, `view`, `create`, `update`, `delete`, `restore`, `forceDelete`), `Rule::passes()` / `ValidationRule::validate()`, `broadcastWhen()`, `shouldQueue()`.
3. **Native and library props keep their names:** `disabled`, `required`, `checked`, `open`, `defaultOpen`, `readOnly`, `asChild`, `modal`, `preserveScroll`, `preserveState`, `replace` (DOM, React, Radix / shadcn, Inertia). The prefix rule applies only to our own props and state.
4. **Wire formats stay stable** when a PHP class is renamed: REST JSON keys, GraphQL type and field names, webhook payloads, `broadcastAs()` names, Inertia page paths, named routes, morph maps (`Relation::enforceMorphMap`), queued job class names. Enum backing values stay identical.
5. **Convention-driven directories** (`app/GraphQL/`, `app/Ai/`, MCP tools) keep the names their resolver expects unless the resolver mapping changes in the same PR.
6. **Mechanical renames and behaviour changes never share a PR.** Land the `git mv` + import updates first with green tests, then extract or change logic in a separate PR.

## Casing

PHP / Laravel (Pint `laravel` preset, PSR-4, PER-CS):

- Classes, interfaces, traits, enums and their `.php` files: `PascalCase` (`StoreCollectionItemRequest.php`, 1:1 with PSR-4).
- Methods, functions, properties, variables: `camelCase` (`$authenticatedUser`, `resolveEffectivePermissions()`).
- Enum cases: `PascalCase` (`CollectionStatusEnum::PendingReview`).
- Database tables and columns, `config/*.php` keys: `snake_case` (`created_by_user_id`).
- Artisan commands and URL slugs: `kebab-case` (`externa:sync-permissions`, `/collection-items`).

React / TypeScript / Inertia:

- Components, `type`, `interface` and `enum` names: `PascalCase` (`CollectionItemDrawer`, `CollectionItemProps`).
- Functions, hooks, variables, props: `camelCase` (`useAccessibilityPreferences`, `handleSubmission`).
- **Files and directories on disk: `kebab-case`** (`collection-item-form.tsx`, `use-accessibility-preferences.tsx`), so macOS (case-insensitive) and Linux / Docker (case-sensitive) never disagree. No barrel `index.ts` files that only re-export. CI checks the file names.

## Role suffixes

Only Eloquent models use bare domain nouns (`User`, `CollectionItem`). Every other class of our own ends with its role, so neither a human nor an agent mistakes a model for a request, enum, event or job:

| Directory                         | Suffix         | Notes                                                   |
| --------------------------------- | -------------- | ------------------------------------------------------- |
| `app/Models/`                     | none           | Relationships, casts, accessors, scopes, constants only |
| `app/Http/Controllers/`           | `Controller`   |                                                         |
| `app/Http/Requests/`              | `Request`      | Validation and authorization                            |
| `app/Http/Resources/`             | `Resource`     |                                                         |
| `app/Http/Responses/`             | `Response`     |                                                         |
| `app/Http/Middleware/`            | `Middleware`   |                                                         |
| `app/Actions/`                    | `Action`       | One write / use case, one public `execute(...)`         |
| `app/Services/`                   | `Service`      | Orchestration, complex reads, external integrations     |
| `app/Data/`                       | `Data`         | `readonly class` DTOs and value objects                 |
| `app/Enums/`                      | `Enum`         | Backed values never change without a data migration     |
| `app/Policies/`                   | `Policy`       |                                                         |
| `app/Jobs/`                       | `Job`          |                                                         |
| `app/Console/Commands/`           | `Command`      |                                                         |
| `app/Events/`                     | `Event`        | Keep `broadcastAs()` wire names stable                  |
| `app/Listeners/`                  | `Listener`     |                                                         |
| `app/Notifications/`              | `Notification` |                                                         |
| `app/Observers/`                  | `Observer`     |                                                         |
| `app/Rules/`                      | `Rule`         |                                                         |
| `app/Exceptions/`                 | `Exception`    |                                                         |
| `app/Builders/`                   | `Builder`      | Dedicated query builders when scopes grow large         |
| `app/Contracts/`                  | `Contract`     | Interfaces                                              |
| traits (one place: `app/Traits/`) | `Trait`        |                                                         |
| `tests/`                          | `Test`         | `*Test.php`, `*.test.ts(x)`                             |

Do not invent other role nouns (`...Normalizer`, `...Publisher`, `...Recorder`, `...Writer`) or split domain classes arbitrarily between `app/Services/` and `app/Support/`: a write is an `Action`, an orchestrator or read pipeline is a `Service`. Packages apply the same table to their own namespace (`Qiick\Excubia\...`); a package may add roles of its own (`Parser`, `Renderer`, `Check`), listed in its architecture test config.
