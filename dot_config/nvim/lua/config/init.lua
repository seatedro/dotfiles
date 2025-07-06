require 'config.keymaps'
require('config.handlers').setup()

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

-- Disable auto-opening of quickfix/location list
vim.g.zig_fmt_autosave = false
vim.api.nvim_create_autocmd('QuickFixCmdPost', {
  callback = function()
    vim.cmd [[Trouble qflist open]]
  end,
})

-- Command to disable auto format for current buffer
vim.api.nvim_create_user_command('FormatDisable', function(args)
  if args.bang then
    -- FormatDisable! will disable formatting just for this buffer
    vim.b.disable_autoformat = true
  else
    vim.g.disable_autoformat = true
  end
end, {
  desc = 'Disable autoformat-on-save',
  bang = true,
})
vim.api.nvim_create_user_command('FormatEnable', function()
  vim.b.disable_autoformat = false
  vim.g.disable_autoformat = false
end, {
  desc = 'Re-enable autoformat-on-save',
})

-- vim.opt.guicursor = 'n-v-c:block-Cursor/lCursor,i-ci-ve:ver25-Cursor/lCursor,r-cr:hor20,o:hor50'
-- vim.cmd 'highlight Cursor guifg=white guibg=yellow'

local cursorPreYank
vim.keymap.set({ 'n', 'x' }, 'y', function()
  cursorPreYank = vim.api.nvim_win_get_cursor(0)
  return 'y'
end, { expr = true })
vim.keymap.set('n', 'Y', function()
  cursorPreYank = vim.api.nvim_win_get_cursor(0)
  return 'y$'
end, { expr = true })

vim.api.nvim_create_autocmd('TextYankPost', {
  callback = function()
    if vim.v.event.operator == 'y' and cursorPreYank then
      vim.api.nvim_win_set_cursor(0, cursorPreYank)
    end
  end,
})

local orig_util_open_floating_preview = vim.lsp.util.open_floating_preview
---@diagnostic disable-next-line: duplicate-set-field
function vim.lsp.util.open_floating_preview(contents, syntax, opts, ...)
  opts = opts or {}
  opts.border = opts.border or 'rounded'
  opts.wrap = true
  opts.max_width = 120
  opts.focusable = true

  -- Call the original function first
  local bufnr, winnr = orig_util_open_floating_preview(contents, syntax, opts, ...)

  -- Create highlight groups with transparent background (one-time definition)
  vim.api.nvim_set_hl(0, 'LspNormalFloat', { link = 'NormalFloat', bg = 'none' })
  vim.api.nvim_set_hl(0, 'LspFloatBorder', { link = 'FloatBorder', bg = 'none' })

  -- Apply the transparent highlights only to this LSP floating window
  vim.api.nvim_win_set_option(winnr, 'winhighlight', 'NormalFloat:LspNormalFloat,FloatBorder:LspFloatBorder')

  return bufnr, winnr
end

--[[
-- Make LSP floating windows transparent
-- Set once for the current colorscheme and whenever the colorscheme changes
local function set_float_transparency()
  -- Remove background colour for floating windows and their borders
  vim.api.nvim_set_hl(0, 'NormalFloat', { bg = 'none' })
  vim.api.nvim_set_hl(0, 'FloatBorder', { bg = 'none' })
end

-- Apply right now (for the colourscheme already loaded)
set_float_transparency()

-- Re-apply every time colorscheme changes
vim.api.nvim_create_autocmd('ColorScheme', {
  callback = set_float_transparency,
})
--]]
