local nnoremap = require("rpc.keymap").nnoremap
local inoremap = require("rpc.keymap").inoremap

nnoremap("<leader>pv", "<cmd>Ex<CR>")
inoremap("\"", "\"\"<left>")
inoremap("\'", "\'\'<left>")
inoremap("(", "()<left>")
inoremap("[", "[]<left>")
inoremap("{", "{}<left>")
inoremap("{<CR>", "{<CR>}<ESC>O")
inoremap("{;<CR>", "{<CR>};<ESC>O")
