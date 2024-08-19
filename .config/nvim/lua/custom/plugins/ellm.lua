return {
  {
    -- 'seatedro/ellm.nvim',
    dir = '~/personal/ellm.nvim/',
    dependencies = { 'nvim-lua/plenary.nvim' },
    config = function(self)
      local ellm = require 'ellm'
      local utils = require 'ellm.utils'
      local anthropic_spec = require 'ellm.specs.anthropic'
      local openai_spec = require 'ellm.specs.openai'

      utils.TEMPLATE_DIRECTORY = vim.fn.expand(self.dir) .. '/templates'

      -- Lambda Labs configuration
      local lambda_spec = vim.deepcopy(openai_spec)
      lambda_spec.SELECTED_MODEL = { name = 'hermes-3-llama-3.1-405b-fp8' }
      lambda_spec.API_KEY_NAME = 'LAMBDA_LABS_API_KEY'
      lambda_spec.URL = 'https://api.lambdalabs.com/v1/chat/completions'

      -- GPT-4 configuration
      local gpt4_spec = vim.deepcopy(openai_spec)
      gpt4_spec.SELECTED_MODEL = { name = 'gpt-4o-mini' }
      gpt4_spec.API_KEY_NAME = 'OPENAI_API_KEY'
      gpt4_spec.URL = 'https://api.openai.com/v1/chat/completions'

      local function anthropic_buffer()
        ellm.invoke_llm_buffer_mode({
          system_prompt_template = anthropic_spec.PROMPT_TEMPLATES.BUFFER_MODE_SYSTEM_PROMPT,
          user_prompt_template = anthropic_spec.PROMPT_TEMPLATES.BUFFER_MODE_USER_PROMPT,
        }, anthropic_spec.make_job)
      end

      local function anthropic_project()
        ellm.invoke_llm_project_mode({
          system_prompt_template = anthropic_spec.PROMPT_TEMPLATES.PROJECT_MODE_SYSTEM_PROMPT,
          user_prompt_template = anthropic_spec.PROMPT_TEMPLATES.PROJECT_MODE_USER_PROMPT,
        }, anthropic_spec.make_job)
      end

      local function anthropic_replace()
        ellm.invoke_llm_replace_with_current_file_context({
          system_prompt_template = anthropic_spec.PROMPT_TEMPLATES.REPLACE_MODE_SYSTEM_PROMPT,
          user_prompt_template = anthropic_spec.PROMPT_TEMPLATES.REPLACE_MODE_USER_PROMPT,
        }, anthropic_spec.make_job)
      end

      local function anthropic_replace_picker()
        ellm.invoke_llm_replace_with_context_mode({
          system_prompt_template = anthropic_spec.PROMPT_TEMPLATES.REPLACE_MODE_SYSTEM_PROMPT,
          user_prompt_template = anthropic_spec.PROMPT_TEMPLATES.REPLACE_MODE_USER_PROMPT,
        }, anthropic_spec.make_job)
      end

      local function lambdalabs_buffer()
        ellm.invoke_llm_buffer_mode({
          system_prompt_template = lambda_spec.PROMPT_TEMPLATES.NOUS_RESEARCH.BUFFER_MODE_SYSTEM_PROMPT,
          user_prompt_template = lambda_spec.PROMPT_TEMPLATES.BUFFER_MODE_USER_PROMPT,
        }, lambda_spec.make_job)
      end

      local function lambdalabs_project()
        ellm.invoke_llm_project_mode({
          system_prompt_template = lambda_spec.PROMPT_TEMPLATES.NOUS_RESEARCH.PROJECT_MODE_SYSTEM_PROMPT,
          user_prompt_template = lambda_spec.PROMPT_TEMPLATES.PROJECT_MODE_USER_PROMPT,
        }, lambda_spec.make_job)
      end

      local function lambdalabs_replace()
        ellm.invoke_llm_replace_with_current_file_context({
          system_prompt_template = lambda_spec.PROMPT_TEMPLATES.NOUS_RESEARCH.REPLACE_MODE_SYSTEM_PROMPT,
          user_prompt_template = lambda_spec.PROMPT_TEMPLATES.REPLACE_MODE_USER_PROMPT,
        }, lambda_spec.make_job)
      end

      local function lambdalabs_replace_picker()
        ellm.invoke_llm_replace_with_context_mode({
          system_prompt_template = lambda_spec.PROMPT_TEMPLATES.NOUS_RESEARCH.REPLACE_MODE_SYSTEM_PROMPT,
          user_prompt_template = lambda_spec.PROMPT_TEMPLATES.REPLACE_MODE_USER_PROMPT,
        }, lambda_spec.make_job)
      end

      local function openai_buffer()
        ellm.invoke_llm_buffer_mode({
          system_prompt_template = gpt4_spec.PROMPT_TEMPLATES.BUFFER_MODE_SYSTEM_PROMPT,
          user_prompt_template = gpt4_spec.PROMPT_TEMPLATES.BUFFER_MODE_USER_PROMPT,
        }, openai_spec.make_job)
      end

      local function openai_project()
        ellm.invoke_llm_project_mode({
          system_prompt_template = gpt4_spec.PROMPT_TEMPLATES.PROJECT_MODE_SYSTEM_PROMPT,
          user_prompt_template = gpt4_spec.PROMPT_TEMPLATES.PROJECT_MODE_USER_PROMPT,
        }, gpt4_spec.make_job)
      end

      local function openai_replace()
        ellm.invoke_llm_replace_with_current_file_context({
          system_prompt_template = gpt4_spec.PROMPT_TEMPLATES.REPLACE_MODE_SYSTEM_PROMPT,
          user_prompt_template = gpt4_spec.PROMPT_TEMPLATES.REPLACE_MODE_USER_PROMPT,
        }, gpt4_spec.make_job)
      end

      local function openai_replace_picker()
        ellm.invoke_llm_replace_with_context_mode({
          system_prompt_template = gpt4_spec.PROMPT_TEMPLATES.REPLACE_MODE_SYSTEM_PROMPT,
          user_prompt_template = gpt4_spec.PROMPT_TEMPLATES.REPLACE_MODE_USER_PROMPT,
        }, gpt4_spec.make_job)
      end

      -- Anthropic configuration
      vim.keymap.set({ 'n', 'v' }, '<leader>lcb', anthropic_buffer, { desc = 'Send current selection to LLM anthropic_buffer' })
      vim.keymap.set({ 'n', 'v' }, '<leader>lcp', anthropic_project, { desc = 'Send current selection to LLM anthropic_project' })
      vim.keymap.set({ 'n', 'v' }, '<leader>lcr', anthropic_replace, { desc = 'Send current selection to LLM anthropic_replace' })
      vim.keymap.set({ 'n', 'v' }, '<leader>lcR', anthropic_replace_picker, { desc = 'Send current selection to LLM anthropic_replace_picker' })

      -- Lambda Labs configuration
      vim.keymap.set({ 'n', 'v' }, '<leader>llb', lambdalabs_buffer, { desc = 'Send current selection to LLM anthropic_buffer' })
      vim.keymap.set({ 'n', 'v' }, '<leader>llp', lambdalabs_project, { desc = 'Send current selection to LLM anthropic_project' })
      vim.keymap.set({ 'n', 'v' }, '<leader>llr', lambdalabs_replace, { desc = 'Send current selection to LLM anthropic_replace' })
      vim.keymap.set({ 'n', 'v' }, '<leader>llR', lambdalabs_replace_picker, { desc = 'Send current selection to LLM anthropic_replace_picker' })

      -- GPT-4o configuration
      vim.keymap.set({ 'n', 'v' }, '<leader>lob', openai_buffer, { desc = 'Send current selection to LLM anthropic_buffer' })
      vim.keymap.set({ 'n', 'v' }, '<leader>lop', openai_project, { desc = 'Send current selection to LLM anthropic_project' })
      vim.keymap.set({ 'n', 'v' }, '<leader>lor', openai_replace, { desc = 'Send current selection to LLM anthropic_replace' })
      vim.keymap.set({ 'n', 'v' }, '<leader>loR', openai_replace_picker, { desc = 'Send current selection to LLM anthropic_replace_picker' })
    end,
  },
}
