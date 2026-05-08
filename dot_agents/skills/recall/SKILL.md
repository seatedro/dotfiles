---
name: recall
description: Load context from vault memory. Temporal queries (yesterday, last week, session history) use native JSONL timeline. Topic queries use QMD BM25 search. "recall graph" generates interactive temporal graph of sessions and files. Every recall ends with "One Thing" - the single highest-leverage next action synthesized from results. Use when user says "recall", "what did we work on", "load context about", "remember when we", "prime context", "yesterday", "what was I doing", "last week", "session history", "recall graph", "session graph".
argument-hint: "[yesterday|today|last week|this week|TOPIC|graph DATE_EXPR]"
allowed-tools: Bash(qmd:*), Bash(python3:*)
metadata:
  author: rohit
  version: "1.0.0"
---

# Recall Skill

Three modes: temporal (date-based session timeline), topic (BM25 search across QMD collections), and graph (interactive visualization of session-file relationships).

Every recall ends with **One Thing**: one concrete, highest-leverage next action synthesized from results.

## Routing

- Temporal mode: input is date-oriented (`yesterday`, `today`, `last week`, `this week`, explicit date, `session history`).
- Graph mode: starts with `graph ` or `recall graph`.
- Topic mode: everything else.

## Temporal Mode

1. Resolve date range from user input.
2. Read JSONL session history from local agent stores.
3. Build a compact table with start time, session id, message count, and first user message.
4. Expand the top relevant sessions with short excerpts.
5. End with **One Thing**.

Default local history targets:

- `~/.claude/history.jsonl`
- `~/.codex/history.jsonl`
- `~/.codex/sessions/**/*.jsonl`

## Topic Mode

1. Query QMD with BM25-first search over vault collections.
2. Prefer `qmd://notes` and include related collections when useful.
3. Return top hits with title/path, short excerpt, and why each hit matters.
4. If needed, run a second narrowed query from high-signal terms.
5. End with **One Thing**.

Suggested commands:

```bash
qmd search "<topic keywords>"
qmd query $'lex: <keywords>\nvec: <natural language question>'
```

## Graph Mode

1. Resolve date range.
2. Extract sessions in range and files touched in each session.
3. Build a bipartite graph: session nodes -> file nodes.
4. Color sessions by day and files by folder.
5. Save HTML output and report path.
6. Summarize key clusters and shared files.
7. End with **One Thing**.

Optional filters:

- `--min-files N` to hide tiny sessions.
- `--all-projects` to include projects beyond current workspace.

## Output Contract

- Always include a short `Findings` section.
- Always include a final line starting with `One Thing:`.
- Keep `One Thing` singular, specific, and immediately actionable.

## Workflow Reference

For detailed routing and step-by-step execution, read [workflows/recall.md](workflows/recall.md).
