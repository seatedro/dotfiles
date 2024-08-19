require 'config.keymaps'

-- This is needed to allow lsp to attach to .templ files
vim.filetype.add { extension = { templ = 'templ' } }

-- Disable terminal resize
vim.api.nvim_create_autocmd('BufWinEnter', {
  pattern = '*',
  callback = function()
    if vim.bo.filetype == 'terminal' then
      vim.cmd 'resize 10'
    end
  end,
})
