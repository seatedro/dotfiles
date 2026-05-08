# Recall Workflow

## 1) Classify the query

- Graph if input starts with `graph` or includes `session graph`.
- Temporal if input references dates or recent periods.
- Topic otherwise.

## 2) Execute

### Temporal

- Parse date expression into `[start, end]`.
- Scan JSONL timeline files.
- Group by session id.
- Compute start time, message count, first user message, and files mentioned.
- Show top sessions first.

### Topic

- Run BM25 with `qmd search` first.
- If recall is thin, run combined `qmd query` with `lex` and `vec`.
- Pull 5-12 strong hits.
- Cluster hits into themes.

### Graph

- Gather sessions in range and extract file mentions/edits.
- Build session-file edges.
- Render interactive HTML with pan/zoom and hover details.
- Highlight bridge files touched by multiple sessions.

## 3) Synthesize

Create one `One Thing` action using:

- momentum (already-started work),
- constraint relief (unblockers),
- finishability (can complete next).

Shape:

`One Thing: <single next action> because <direct leverage>.`
