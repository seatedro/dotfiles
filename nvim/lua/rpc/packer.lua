vim.cmd [[packadd packer.nvim]]

return require('packer').startup(function(use)
  -- Packer can manage itself
  use("wbthomason/packer.nvim")
  use("folke/tokyonight.nvim")
  use("sbdchd/neoformat")
  use("nvim-lua/plenary.nvim")
  use("nvim-telescope/telescope.nvim")
  use({
    'nvim-lualine/lualine.nvim',
    requires = { 'kyazdani42/nvim-web-devicons', opt = true }
  })

  use("neovim/nvim-lspconfig")
  use("hrsh7th/cmp-nvim-lsp")
  use("hrsh7th/cmp-buffer")
  use("hrsh7th/nvim-cmp")
  use("L3MON4D3/LuaSnip")
  use("onsails/lspkind-nvim")
  use("ThePrimeagen/git-worktree.nvim")
  use("ThePrimeagen/harpoon")
  use("nvim-treesitter/nvim-treesitter", {
        run = ":TSUpdate"
    })

  use("mbbill/undotree")
  use("simrat39/rust-tools.nvim")
end)
