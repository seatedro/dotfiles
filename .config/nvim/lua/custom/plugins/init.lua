-- You can add your own plugins here or in other files in this directory!
--  I promise not to create any merge conflicts in this directory :)
--
-- See the kickstart.nvim README for more information
return {
  {
    'akinsho/bufferline.nvim',
    version = '*',
    dependencies = 'nvim-tree/nvim-web-devicons',
    opts = {
      options = {
        diagnostics = 'nvim_lsp',
      },
    },
    config = function(_, opts)
      vim.opt.termguicolors = true
      require('bufferline').setup(opts)
    end,
  },
  {
    'nvim-treesitter/nvim-treesitter-context',
  },
}
