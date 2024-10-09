local function map(mode, lhs, rhs, opts)
  vim.keymap.set(mode, lhs, rhs, opts)
end

---@param buf number?
local function bufremove(buf)
  buf = buf or 0
  buf = buf == 0 and vim.api.nvim_get_current_buf() or buf

  if vim.bo.modified then
    local choice = vim.fn.confirm(('Save changes to %q?'):format(vim.fn.bufname()), '&Yes\n&No\n&Cancel')
    if choice == 0 or choice == 3 then -- 0 for <Esc>/<C-c> and 3 for Cancel
      return
    end
    if choice == 1 then -- Yes
      vim.cmd.write()
    end
  end

  for _, win in ipairs(vim.fn.win_findbuf(buf)) do
    vim.api.nvim_win_call(win, function()
      if not vim.api.nvim_win_is_valid(win) or vim.api.nvim_win_get_buf(win) ~= buf then
        return
      end
      -- Try using alternate buffer
      local alt = vim.fn.bufnr '#'
      if alt ~= buf and vim.fn.buflisted(alt) == 1 then
        vim.api.nvim_win_set_buf(win, alt)
        return
      end

      -- Try using previous buffer
      local has_previous = pcall(vim.cmd, 'bprevious')
      if has_previous and buf ~= vim.api.nvim_win_get_buf(win) then
        return
      end

      -- Create new listed buffer
      local new_buf = vim.api.nvim_create_buf(true, false)
      vim.api.nvim_win_set_buf(win, new_buf)
    end)
  end
  if vim.api.nvim_buf_is_valid(buf) then
    pcall(vim.cmd, 'bdelete! ' .. buf)
  end
end

map('n', '<leader>bd', bufremove, { desc = 'Delete Buffer' })

-- Create llm.md
function Create_llm_md()
  local cwd = vim.fn.getcwd()
  local cur_buf = vim.api.nvim_get_current_buf()
  local cur_buf_name = vim.api.nvim_buf_get_name(cur_buf)
  local llm_md_path = cwd .. '/llm.md'
  if cur_buf_name ~= llm_md_path then
    vim.api.nvim_command('edit ' .. llm_md_path)
    local buf = vim.api.nvim_get_current_buf()
    vim.api.nvim_buf_set_option(buf, 'filetype', 'markdown')
    vim.api.nvim_win_set_buf(0, buf)
  end
end
map('n', '<leader>lm', Create_llm_md, { desc = 'Create llm.md' })

-- better navigation in insert mode
map('i', '<C-h>', '<Left>', { desc = 'Move cursor left' })
map('i', '<C-j>', '<Down>', { desc = 'Move cursor down' })
map('i', '<C-k>', '<Up>', { desc = 'Move cursor up' })
map('i', '<C-l>', '<Right>', { desc = 'Move cursor right' })

map('i', '<C-a>', '<Home>', { desc = 'Move cursor to start of line' })
map('i', '<C-e>', '<End>', { desc = 'Move cursor to end of line' })
map('i', '<C-b>', '<S-Left>', { desc = 'Move cursor to start of previous word' })
map('i', '<C-f>', '<S-Right>', { desc = 'Move cursor to end of next word' })

-- harpoon keymaps
local harpoon = require 'harpoon'
local mark = require 'harpoon.mark'
local ui = require 'harpoon.ui'
harpoon.setup()

map('n', '<leader>za', function()
  mark.add_file()
end, { desc = 'Add harpoon' })
map('n', '<leader>zl', function()
  ui.toggle_quick_menu()
end, { desc = 'Toggle harpoon quick menu' })

-- set ctrl+1,2,3,4 for harpoon selection
map('n', '<leader>z1', function()
  ui.nav_file(1)
end)
map('n', '<leader>z2', function()
  ui.nav_file(2)
end)
map('n', '<leader>z3', function()
  ui.nav_file(3)
end)
map('n', '<leader>z4', function()
  ui.nav_file(4)
end)

-- toggle next and previous harpoon
map('n', '<leader>zn', function()
  ui.nav_next()
end, { desc = 'Next harpoon' })
map('n', '<leader>zp', function()
  ui.nav_prev()
end, { desc = 'Previous harpoon' })

-- neogit
local neogit = require 'neogit'
map('n', '<leader>gg', function()
  neogit.open()
end, { desc = 'Open NeoGit' })
