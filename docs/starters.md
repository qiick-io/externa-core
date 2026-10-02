# Official headless starters — conventions

Decision for milestone **1.2.0** ([#156](https://github.com/qiick-io/externa-core/issues/156)).

## Multi-repo (preferred)

Each framework gets its **own public repo** under `qiick-io`. Builders get `git clone` and GitHub **Use this template** UX per stack.

| Framework | Repo |
| --------- | ---- |
| Next.js (reference) | [`qiick-io/externa-next-starter`](https://github.com/qiick-io/externa-next-starter) |
| Nuxt | `qiick-io/externa-nuxt-starter` |
| Astro | `qiick-io/externa-astro-starter` |
| SvelteKit | `qiick-io/externa-sveltekit-starter` |

**Do not** create `qiick-io/externa-starters` (monorepo) unless a future ticket overturns this. Revisit monorepo only if multi-repo ops (bots, drift, typed client bumps) become painful — optional backlog issue, not blocking.

Child issues encode the same bar: [#152](https://github.com/qiick-io/externa-core/issues/152) Nuxt · [#157](https://github.com/qiick-io/externa-core/issues/157) Astro · [#158](https://github.com/qiick-io/externa-core/issues/158) SvelteKit.

## Shared checklist (every starter)

Ship only when all of these hold:

| Requirement | Detail |
| ----------- | ------ |
| Naming | `qiick-io/externa-<framework>-starter` |
| Env parity | `EXTERNA_API_URL`, `EXTERNA_API_KEY` (Bearer), `EXTERNA_COLLECTION` |
| TypeScript | Strict / sensible `tsconfig` (or framework typed equivalent); no loose `any` in app code without an explanatory comment |
| Typed helpers | Public CMS API list + detail helpers; example types match the API |
| `.env.example` | Document purpose + where values come from |
| Server-side fetches | API key never reaches the browser |
| `SECURITY.md` | Point vulnerability reports at [externa-core SECURITY.md](../SECURITY.md) |
| Branch protection | Light parity with `externa-next-starter` (`main`: required CI status, PR reviews, conversation resolution) |
| License | MIT |
| README | Quick start, env table, links to [docs.externa.qiick.io](https://docs.externa.qiick.io) headless + Public CMS API |
| Docs page | Ship / update [Headless starter](https://docs.externa.qiick.io/docs/headless-starter) (+ core README link) when the starter ships |
| CI | Per-repo: install, self-check (or equivalent), lint, **typecheck**, build — green on PR |
| Dependency updates | Dependabot **or** Renovate **per repo** (copy Next’s Dependabot weekly npm schedule unless Renovate is chosen) |
| API shape bumps | When Public CMS API response shapes change, update typed helpers in **each** starter repo in the same release wave (docs OpenAPI / `public-cms-api-types` remain SoT for codegen) |

Loose JS / undocumented starters are **out of policy**.

## Update cadence

- **Framework deps:** weekly Dependabot (or Renovate) PRs into `develop` (or default working branch); merge when CI green.
- **Externa client patterns / types:** owner of the Public CMS API change (core PR) should open companion PRs (or note follow-ups) on each official starter when list/detail/OpenAPI shapes break typed helpers.
- **Core Dependabot:** stays disabled on `externa-core`; starters still run their own bots.

## Next starter audit (reference)

[`externa-next-starter`](https://github.com/qiick-io/externa-next-starter) already meets the TS + typed helpers + README/docs bar (`strict: true`, `lib/externa/*`). Gaps closed under #156: explicit `typecheck` script in CI, Dependabot npm, template-repo flag for “Use this template”.

## Operator one-liner

**Prefer multi-repo.** Clone / “Use this template” per framework beats a shared `apps/` tree for builders. Keep SECURITY, protection, env, TypeScript + docs, and CI cadence aligned across repos.
