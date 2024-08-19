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
  -- {
  --   'yacineMTB/dingllm.nvim',
  --   dependencies = { 'nvim-lua/plenary.nvim' },
  --   config = function()
  --     local system_prompt =
  --       'You should replace the code that you are sent, only following the comments. Do not talk at all. Only output valid code. Do not provide any backticks that surround the code. Never ever output backticks like this ```. Any comment that is asking you for something should be removed after you satisfy them. Other comments should left alone. Do not output backticks'
  --     local helpful_prompt = 'You are a helpful assistant. What I have sent are my notes so far. You are very curt, yet helpful.'
  --     local dingllm = require 'dingllm'
  --
  --     local function openai_replace()
  --       dingllm.invoke_llm_and_stream_into_editor({
  --         url = 'https://api.openai.com/v1/chat/completions',
  --         model = 'gpt-4o-mini',
  --         api_key_name = 'OPENAI_API_KEY',
  --         system_prompt = system_prompt,
  --         replace = true,
  --       }, dingllm.make_openai_spec_curl_args, dingllm.handle_openai_spec_data)
  --     end
  --
  --     local function openai_help()
  --       dingllm.invoke_llm_and_stream_into_editor({
  --         url = 'https://api.openai.com/v1/chat/completions',
  --         model = 'gpt-4o-mini',
  --         api_key_name = 'OPENAI_API_KEY',
  --         system_prompt = helpful_prompt,
  --         replace = false,
  --       }, dingllm.make_openai_spec_curl_args, dingllm.handle_openai_spec_data)
  --     end
  --
  --     local function anthropic_help()
  --       dingllm.invoke_llm_and_stream_into_editor({
  --         url = 'https://api.anthropic.com/v1/messages',
  --         model = 'claude-3-5-sonnet-20240620',
  --         api_key_name = 'ANTHROPIC_API_KEY',
  --         system_prompt = helpful_prompt,
  --         replace = false,
  --       }, dingllm.make_anthropic_spec_curl_args, dingllm.handle_anthropic_spec_data)
  --     end
  --
  --     local function anthropic_replace()
  --       dingllm.invoke_llm_and_stream_into_editor({
  --         url = 'https://api.anthropic.com/v1/messages',
  --         model = 'claude-3-5-sonnet-20240620',
  --         api_key_name = 'ANTHROPIC_API_KEY',
  --         system_prompt = system_prompt,
  --         replace = true,
  --       }, dingllm.make_anthropic_spec_curl_args, dingllm.handle_anthropic_spec_data)
  --     end
  --
  --     vim.keymap.set({ 'n', 'v' }, '<leader>lO', openai_help, { desc = 'llm openai_help' })
  --     vim.keymap.set({ 'n', 'v' }, '<leader>lo', openai_replace, { desc = 'llm openai' })
  --     vim.keymap.set({ 'n', 'v' }, '<leader>lC', anthropic_help, { desc = 'llm anthropic_help' })
  --     vim.keymap.set({ 'n', 'v' }, '<leader>lc', anthropic_replace, { desc = 'llm anthropic' })
  --   end,
  -- },
  {
    'kawre/leetcode.nvim',
    -- build = ':TSUpdate html',
    lazy = false,
    dependencies = {
      'nvim-telescope/telescope.nvim',
      'nvim-lua/plenary.nvim', -- required by telescope
      'MunifTanjim/nui.nvim',

      -- optional
      'nvim-treesitter/nvim-treesitter',
      'rcarriga/nvim-notify',
      'nvim-tree/nvim-web-devicons',
    },
    opts = {
      ---@type string
      arg = 'leetcode.nvim',

      ---@type lc.lang
      lang = 'python3',

      cn = { -- leetcode.cn
        enabled = false, ---@type boolean
        translator = true, ---@type boolean
        translate_problems = true, ---@type boolean
      },

      ---@type lc.storage
      storage = {
        home = vim.fn.stdpath 'data' .. '/leetcode',
        cache = vim.fn.stdpath 'cache' .. '/leetcode',
      },

      ---@type table<string, boolean>
      plugins = {
        non_standalone = false,
      },

      ---@type boolean
      logging = true,

      injector = {}, ---@type table<lc.lang, lc.inject>

      cache = {
        update_interval = 60 * 60 * 24 * 7, ---@type integer 7 days
      },

      console = {
        open_on_runcode = true, ---@type boolean

        dir = 'row', ---@type lc.direction

        size = { ---@type lc.size
          width = '90%',
          height = '75%',
        },

        result = {
          size = '60%', ---@type lc.size
        },

        testcase = {
          virt_text = true, ---@type boolean

          size = '40%', ---@type lc.size
        },
      },

      description = {
        position = 'left', ---@type lc.position

        width = '40%', ---@type lc.size

        show_stats = true, ---@type boolean
      },

      hooks = {
        ---@type fun()[]
        ['enter'] = {},

        ---@type fun(question: lc.ui.Question)[]
        ['question_enter'] = {},

        ---@type fun()[]
        ['leave'] = {},
      },

      keys = {
        toggle = { 'q' }, ---@type string|string[]
        confirm = { '<CR>' }, ---@type string|string[]

        reset_testcases = 'r', ---@type string
        use_testcase = 'U', ---@type string
        focus_testcases = 'H', ---@type string
        focus_result = 'L', ---@type string
      },

      ---@type lc.highlights
      theme = {},

      ---@type boolean
      image_support = true,
    },
  },
  {
    'supermaven-inc/supermaven-nvim',
    config = function()
      require('supermaven-nvim').setup {}
    end,
  },
  {
    'folke/trouble.nvim',
    opts = {}, -- for default options, refer to the configuration section for custom setup.
    cmd = 'Trouble',
    keys = {
      {
        '<leader>xx',
        '<cmd>Trouble diagnostics toggle<cr>',
        desc = 'Diagnostics (Trouble)',
      },
      {
        '<leader>xX',
        '<cmd>Trouble diagnostics toggle filter.buf=0<cr>',
        desc = 'Buffer Diagnostics (Trouble)',
      },
      {
        '<leader>cs',
        '<cmd>Trouble symbols toggle focus=false<cr>',
        desc = 'Symbols (Trouble)',
      },
      {
        '<leader>cl',
        '<cmd>Trouble lsp toggle focus=false win.position=right<cr>',
        desc = 'LSP Definitions / references / ... (Trouble)',
      },
      {
        '<leader>xl',
        '<cmd>Trouble loclist toggle<cr>',
        desc = 'Location List (Trouble)',
      },
      {
        '<leader>xq',
        '<cmd>Trouble qflist toggle<cr>',
        desc = 'Quickfix List (Trouble)',
      },
    },
  },
  {
    'andymass/vim-matchup',
  },
  {
    'ThePrimeagen/harpoon',
    dependencies = { 'nvim-lua/plenary.nvim' },
  },
}
