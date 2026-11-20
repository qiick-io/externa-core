<!-- Generated from qiick-io/app-ui standards: do not edit, run the sync. The agent files hold the core of this page and point here. -->

# graphify

When this workspace has `graphify-out/graph.json`:

- For codebase or architecture questions, first run `graphify query "<question>"` (or `graphify path "<A>" "<B>"` / `graphify explain "<concept>"`). These return a scoped subgraph, usually much smaller than `GRAPH_REPORT.md` or raw grep.
- If `graphify-out/wiki/index.md` exists, navigate it instead of reading raw files.
- Read `graphify-out/GRAPH_REPORT.md` only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code files, run `graphify update .` (AST-only, no API cost). Do not run it for doc-only or config-only changes with no code edits.
- If `graphify-out/graph.json` does not exist, skip the above; do not invent a graph.

`graphify-out/` is local and never committed; the graph is rebuilt by local git hooks (`graphify hook install`), and the merge-driver line that command writes to `.gitattributes` must not be committed.
