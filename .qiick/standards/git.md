<!-- Generated from qiick-io/app-ui standards: do not edit, run the sync. The agent files hold the core of this page and point here. -->

# Git, commits and pull requests

- **English everywhere in the repo:** code, comments, docs, commit messages, issues, pull requests.
- **Conventional Commits:** `type(scope): summary` in the imperative, lower case, no trailing period. Types: `feat`, `fix`, `refactor`, `perf`, `docs`, `test`, `chore`, `ci`, `build`, `security`. `!` or a `BREAKING CHANGE:` footer for breaking changes. commitlint checks PR titles in CI through the reusable `qiick-io/app-ui/.github/workflows/pr-title.yml` (check `pr-title / commitlint`), which every repo calls on `pull_request` with the `edited` type.
- **One issue, one branch, one pull request.** Branch from `develop` as `<type>/<issue>-<kebab-slug>` (`feat/42-project-registration`). Never commit directly to `develop` or `main`.
- Pull requests target `develop` and are **squash-merged**, so the PR title becomes the commit: make it a valid Conventional Commit. The body says what changed, why, and `Closes #<issue>`.
- **Every issue and pull request gets its metadata when it is created:** assignee (the maintainer), labels from the repo's set, the milestone of the release it belongs to, and the repo's GitHub project when it has one.
- **Branch protection** (every public repo): `develop` and `main` change only through a pull request with green required checks; admins are not exempt. When a PR is behind its base, update the branch (`gh pr update-branch`) and wait for the checks again. `main` takes **merge commits** only (a ruleset): release PRs, and the merge of `main` back into `develop` after a tag, which is a pull request too.
- Never force-push a shared branch, never `--no-verify`, never `--admin` or any branch-protection bypass.
- No attribution or `Co-authored-by` trailers for tools or agents.
- Never commit `.env`, secrets, tokens, personal phone numbers or email addresses; only `.env.example`.
- Nothing personal in tracked files: no absolute local paths (`/Users/…`), no one's own editor or agent configuration (keep it in `.gitignore`), and "the maintainer" instead of people's names in code, comments and docs. Describe what code does rather than which product it imitates; naming a product is fine where it is an integration (an importer, a compatible endpoint).
- Ask the maintainer before: a new dependency, anything outside the issue's scope, repo settings (branch protection, required checks, secrets), paid services or accounts.
