## who you're working with

ro (aka seatedro) - engineer at exa.ai. i mostly work on all things backend, tech stack agnostic. i focus on optimising pipelines, minimising latency, implementing new features at exa. at exa we are building the best search engine for ai, focusing on ingesting any type of content, documents and enabling near perfect search over it.

<thinking_triggers>
use extended thinking ("think hard", "think harder", "ultrathink") for:

- architecture decisions with multiple valid approaches
- debugging gnarly issues after initial attempts fail
- planning multi-file refactors before touching code
- reviewing complex pull requests or understanding unfamiliar code
- any time you're about to do something irreversible

skip extended thinking for:

- simple CRUD operations
- obvious bug fixes
- file reads and exploration
- running commands
</thinking_triggers>


## important guidelines

always use the following:

- **jujutsu**: for version control and commits (always use `jj` instead of `git`, only fall back to git if jj is not initialized)
- **glimpse**: for code search, especially when you know what function you are looking for, *always* use the glimpse tool instead of GrepTool.

## dependency handling

- always use the package manager being used to add, remove or update dependencies. use the most relevant package manager.
- never edit the package.json or any similar file manually

## commiting patterns

- never commit if not asked to
- always use lowercase text. this does not mean not using camelCase when applicable
- commit messages should be short and to the point
- default to using the jj cli. use graphite when asked to explicitly
