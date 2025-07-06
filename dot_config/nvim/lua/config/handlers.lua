local M = {}

M.setup = function()
  local diagnosticConfig = {
    virtual_text = false,
    virtual_lines = true,
  }

  -- We use lsp_lines, so this needs to be disabled
  vim.diagnostic.config(diagnosticConfig)
end

return M
