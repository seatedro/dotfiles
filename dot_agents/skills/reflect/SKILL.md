---
name: reflect
description: Convert working context into Obsidian-native notes in qmd://notes, using wikilinks/backlinks and graph-aware structure. Adapt patterns from ~/exa/monorepo/AGENTS.override.md for plans, notes, and end-of-task reflection. After writing/updating notes, run qmd update and qmd embed.
argument-hint: "[TOPIC|session|today|weekly|retro]"
allowed-tools: Bash(qmd:*), Bash(python3:*)
metadata:
  author: rohit
  version: "1.0.0"
---

# Reflect Skill

Use this skill to persist task context into the Obsidian vault at `~/Documents/serotonin/clanker/notes` with graph-aware linking.

## Source Pattern

Use `~/exa/monorepo/AGENTS.override.md` as behavioral source:

- keep a task plan,
- persist durable notes,
- record pivots and outcomes,
- promote reusable lessons.

Translate those ideas from `personal/ro/plans` and `personal/ro/notes` into Obsidian pages in `qmd://notes`.

## Obsidian-First Rules

- Prefer wikilinks (`[[Page Name]]`) over plain text references.
- Add explicit backlinks by linking related sessions, projects, and files.
- Add tags for retrieval (`#session`, `#project/<name>`, `#retro`).
- Keep one concept per note when possible and cross-link instead of bloating a single file.
- Include a `Related` section with 3-8 links.

## Target Structure

- `sessions/YYYY-MM-DD/<slug>.md` for session logs.
- `projects/<project>/<topic>.md` for durable project notes.
- `daily/YYYY-MM-DD.md` for daily summary rollups.

## Workflow

1. Read current task context and AGENTS override conventions.
2. Decide whether update is session, project, or daily.
3. Write or update note(s) in vault path.
4. Add wikilinks to prior sessions, active project notes, and next action note.
5. Add final `One Thing` line to the primary note.
6. Run:

```bash
qmd update
qmd embed
```

7. Confirm indexing succeeded and report updated note paths.

## Note Template

```markdown
# <Title>

## Context

## What Changed

## Decisions

## Next

One Thing: <single highest-leverage action>

## Related
- [[...]]
- [[...]]
```
