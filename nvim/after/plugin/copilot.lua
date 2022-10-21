local Remap = require("rpc.keymap")

inoremap = Remap.inoremap

vim.g.copilot_no_tab_map = true
vim.g.copilot_assume_mapped = true
vim.g.copilot_tab_fallback = ""
-- inoremap('<C-J>', 'copilot#Accept("<Tab>")', { silent = true, expr = true })

