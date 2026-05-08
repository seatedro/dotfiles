# Local Pi Patches

This Pi setup relies on one local patch to the globally installed Pi dependency tree.

## `$` skill autocomplete trigger

### Purpose

Typing `$` in the Pi editor opens an autocomplete dropdown for installed skills. Selecting a skill inserts:

```text
$skill-name 
```

This is a local convenience patch for quickly discovering/invoking skills without typing `/skill:<name>` manually.

### Patched files

Patch the bundled Pi TUI implementation inside the global Pi install:

```bash
$(npm root -g)/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-tui/dist/autocomplete.js
$(npm root -g)/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-tui/dist/components/editor.js
```

On machines using a different npm prefix, locate it with:

```bash
npm root -g
```

### What the patch does

In `components/editor.js`, update the natural autocomplete trigger logic so `$` behaves like `@`/`#`:

- Typing `$` at a token boundary calls `tryTriggerAutocomplete()`.
- Continuing to type letters in a `$...` token keeps autocomplete updated.
- Backspace/re-trigger contexts also include `$` in the symbol-completion regex.

In `autocomplete.js`, inside `CombinedAutocompleteProvider.getSuggestions(...)`, after `@` file autocomplete handling and before `/` command autocomplete handling, add a `$` prefix branch that:

1. Detects the current token starts with `$`.
2. Filters registered commands whose name starts with `skill:`.
3. Displays those skills in the autocomplete dropdown.
4. Returns completion items whose value is `$${skillName}`.

In `CombinedAutocompleteProvider.applyCompletion(...)`, add handling for prefixes starting with `$` so accepting an item inserts the selected `$skill-name` plus a trailing space.

Add a helper method on `CombinedAutocompleteProvider`:

```js
// Extract $ prefix for skill suggestions
extractSkillPrefix(text) {
  const lastDelimiterIndex = findLastDelimiter(text);
  const tokenStart = lastDelimiterIndex === -1 ? 0 : lastDelimiterIndex + 1;
  if (text[tokenStart] === "$") {
    return text.slice(tokenStart);
  }
  return null;
}
```

### Quick verification

Check whether a machine already has the patch:

```bash
grep -n "extractSkillPrefix\|skill invocation" \
  "$(npm root -g)/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-tui/dist/autocomplete.js"

grep -n 'char === "\\$"\|\[@#\\$\]' \
  "$(npm root -g)/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-tui/dist/components/editor.js"
```

If patched, the first command should print lines mentioning `extractSkillPrefix` and `skill invocation`; the second should show `$` in the editor autocomplete trigger logic.

### Notes

- This patch is applied to generated `dist` JavaScript, not TypeScript source.
- `npm install -g @earendil-works/pi-coding-agent` or `pi update --self` may overwrite it.
- Reapply after Pi upgrades if `$` no longer opens skill autocomplete.
- This is not stored in `~/.pi/agent/extensions`; it modifies Pi's installed TUI package directly.
