# Jujutsu (jj) Patterns

Condensed patterns for jujutsu VCS. Run `jj help <command>` for full docs.

---

## Core Concepts

### Working Copy vs Commits

Unlike git, jj has no staging area. The **working copy is automatically a commit** that updates as you edit files.

```bash
# See current state (working copy is always shown)
jj status
jj st

# Working copy shown as @ in log
jj log
```

### Change IDs vs Commit IDs

Every revision has two identifiers:
- **Change ID**: stable across rebases (e.g., `kkmpptxz`)
- **Commit ID**: content hash, changes on amend/rebase (e.g., `a1b2c3d4`)

```bash
# Both work interchangeably
jj show kkmpptxz
jj show a1b2c3d4

# Use shortest unique prefix
jj show kk
```

---

## Basic Workflow

### Creating Changes

```bash
# Start new change on top of current
jj new

# Start new change on top of specific revision
jj new main
jj new kkmpptxz@origin # (remote branch)

# Create change with message
jj new -m "implement feature"

# Create merge commit (multiple parents)
jj new main feature-branch
```

### Describing Changes

```bash
# Set commit message for working copy
jj describe -m "add user authentication"
jj desc -m "add user authentication"

# Edit in $EDITOR
jj describe

# Describe a different revision
jj describe kkmpptxz -m "fix typo"
```

### Viewing History

```bash
# Show log (default template)
jj log

# Show specific revisions
jj log -r main..@           # from main to working copy
jj log -r 'ancestors(@, 5)' # last 5 ancestors

# Show diff for a revision
jj show kkmpptxz
jj diff                     # working copy changes
jj diff -r main..@          # diff between revisions
```

---

## Revsets (Revision Selection)

### Common Revsets

```bash
@                    # working copy
@-                   # parent of working copy
@--                  # grandparent
root()               # root commit
heads()              # all heads
bookmarks()          # all local bookmarks
main                 # bookmark named main
kkmpptxz             # change ID
a1b2c3d4             # commit ID prefix
```

### Operators

```bash
x & y                # intersection (and)
x | y                # union (or)
~x                   # not x
x..y                 # ancestors of y that aren't ancestors of x
x::                  # x and descendants
::x                  # x and ancestors
x-                   # parents of x
x+                   # children of x
```

### Examples

```bash
jj log -r 'main..@'                    # commits since main
jj log -r 'bookmarks() & mine()'       # my bookmarks
jj log -r 'heads(all())'               # all head commits
jj rebase -r 'description(WIP)' -d @   # rebase WIP commits
```

---

## Editing History

### Squash (Fold into Parent)

```bash
# Squash working copy into parent
jj squash

# Squash specific revision into its parent
jj squash -r kkmpptxz

# Squash only specific files
jj squash src/main.rs
```

### Split Changes

```bash
# Interactively split working copy
jj split

# Split specific revision
jj split -r kkmpptxz
```

### Amend (Add to Any Revision)

```bash
# Amend working copy changes into parent
jj squash

# Amend into specific revision (from working copy)
jj squash --into kkmpptxz
```

### Rebase

```bash
# Rebase current change onto main
jj rebase -d main

# Rebase specific revision
jj rebase -r kkmpptxz -d main

# Rebase revision and descendants
jj rebase -s kkmpptxz -d main

# Rebase branch (revision and descendants, but not other branches)
jj rebase -b feature -d main
```

### Abandon (Delete)

```bash
# Abandon working copy (keeps parent)
jj abandon

# Abandon specific revision
jj abandon kkmpptxz

# Abandon multiple
jj abandon kkmpptxz llnnoouv
```

---

## Bookmarks

### Bookmark Operations

```bash
# Create bookmark at working copy
jj bookmark create feature -r @

# Create bookmark at specific revision
jj bookmark create feature -r kkmpptxz

# Move bookmark to different revision
jj bookmark set feature -r @ --allow-backwards

# Delete bookmark
jj bookmark delete feature

# List bookmarks
jj bookmark list
jj bookmark list --all  # include remote bookmarks
```

---

## Working with Remotes

### Fetch and Push

```bash
# Fetch from origin
jj git fetch

# Push current bookmark
jj git push

# Push specific bookmark
jj git push --bookmark feature

# Push and create new remote bookmark
jj git push --bookmark feature --allow-new
```

### Tracking Remote Bookmarks

```bash
# List remote bookmarks
jj bookmark list --all

# Track remote bookmark
jj bookmark track feature@origin

# Bookmark naming
main           # local
main@origin    # remote tracking
```

---

## Conflicts

### Conflict Resolution

```bash
# Check for conflicts
jj status

# Conflicts shown in file as markers
# <<<<<<<
# |||||||
# =======
# >>>>>>>

# After resolving, just edit the file
# jj automatically detects resolution

# Alternatively, use merge tool
jj resolve
```

### Working with Conflicted States

jj allows committing conflicts - resolve them later:

```bash
# Rebase might create conflicts
jj rebase -d main

# See conflicts
jj log  # shows conflict marker

# Fix later
jj edit kkmpptxz  # go back to conflicted change
# ... resolve ...
jj new  # continue working
```

---

## Undo and Recover

### Operation Log

Every jj command is recorded:

```bash
# View operation history
jj op log

# Undo last operation
jj undo

# Restore to specific operation
jj op restore <op-id>
```

### Recovering Abandoned Commits

```bash
# Show all commits including hidden/abandoned
jj log --revisions 'all()'

# Restore abandoned commit
jj new <hidden-change-id>
```

---

## Common Patterns

### Feature Branch Workflow

```bash
# Start feature
jj new main -m "implement auth"
jj bookmark create feature/auth -r @

# Work on feature
# ... edit files ...
jj describe -m "add login endpoint"
jj new -m "add logout endpoint"

# Rebase before merge
jj rebase -b feature/auth -d main

# Push
jj git push --bookmark feature/auth
```

### Stashing (jj style)

No explicit stash - just create a new change:

```bash
# "Stash" current work
jj describe -m "WIP: current work"
jj new main  # start fresh from main

# "Unstash" - go back to WIP
jj edit <wip-change-id>
```

### Editing Past Commits

```bash
# Edit a past commit directly
jj edit kkmpptxz
# ... make changes ...
jj new  # create new working copy on top

# Or squash changes into it
jj new  # create new change for fixes
# ... make changes ...
jj squash --into kkmpptxz
```

### Cherry-pick

```bash
# Duplicate a change onto current position
jj duplicate kkmpptxz

# Or create new change and restore files
jj new
jj restore --from kkmpptxz
```

---

## Configuration

### Essential Config

```bash
# Set user info
jj config set --user user.name "Your Name"
jj config set --user user.email "you@example.com"

# Use git-compatible config
jj config set --user ui.diff-editor ":builtin"
jj config set --user ui.merge-editor "vimdiff"
```

### Config File (~/.jjconfig.toml)

```toml
[user]
name = "Your Name"
email = "you@example.com"

[ui]
default-command = "log"
diff-editor = ":builtin"

[aliases]
l = ["log", "-r", "@ | ancestors(remote_bookmarks().., 5)"]
```

---

## Git Interop

### Initialize from Git

```bash
# Clone git repo
jj git clone https://github.com/user/repo

# Initialize in existing git repo
cd existing-git-repo
jj git init --colocate
```

### Colocated Repos

With `--colocate`, jj and git share the same `.git`:

```bash
jj git init --colocate

# Both work
jj log
git log

# Keep git updated
jj git export  # jj -> git
jj git import  # git -> jj
```

---

## Quick Reference

| Git                      | Jujutsu                          |
|--------------------------|----------------------------------|
| `git add && git commit`  | (automatic) + `jj describe`      |
| `git commit --amend`     | `jj describe` or `jj squash`     |
| `git stash`              | `jj new main`                    |
| `git checkout <branch>`  | `jj edit <rev>` or `jj new <rev>`|
| `git rebase -i`          | `jj rebase`, `jj squash`, `jj split` |
| `git cherry-pick`        | `jj duplicate`                   |
| `git reset --hard`       | `jj undo` or `jj abandon`        |
| `git reflog`             | `jj op log`                      |
