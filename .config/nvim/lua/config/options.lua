-- Options are automatically loaded before lazy.nvim startup
-- Default options that are always set: https://github.com/LazyVim/LazyVim/blob/main/lua/lazyvim/config/options.lua
-- Add any additional options here
vim.g.qf_auto_open_quickfix = 0
vim.g.vimtex_view_method = "skim"
function Leave_snippet()
  if
    ((vim.v.event.old_mode == "s" and vim.v.event.new_mode == "n") or vim.v.event.old_mode == "i")
    and require("luasnip").session.current_nodes[vim.api.nvim_get_current_buf()]
    and not require("luasnip").session.jump_active
  then
    require("luasnip").unlink_current()
  end
end

vim.api.nvim_command([[
    autocmd ModeChanged * lua Leave_snippet()
]])
