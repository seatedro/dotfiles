require 'config.keymaps'

-- This is needed to allow lsp to attach to .templ files
vim.filetype.add { extension = { templ = 'templ' } }
