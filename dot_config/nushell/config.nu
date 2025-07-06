$env.config = {
  bracketed_paste:                  true
  buffer_editor:                    ""
  datetime_format:                  {}
  edit_mode:                        vi
  error_style:                      fancy
  float_precision:                  2
  footer_mode:                      25
  render_right_prompt_on_last_line: false
  show_banner:                      false
  use_ansi_coloring:                true
  use_kitty_protocol:               true
}

$env.config.ls = {
  clickable_links: true
  use_ls_colors: true
}

$env.config.rm.always_trash = false

$env.config.table = {
  header_on_separator: false
  index_mode: always
  mode:       rounded
  padding:    { left: 1 right: 1 }
  show_empty: true
  trim: {
    methodology:             wrapping
    wrapping_try_keep_words: true
    truncating_suffix:       "..."
  }
}

$env.config.history = {
  file_format:   sqlite
  isolation:     false
  max_size:      100_000
  sync_on_enter: true
}

$env.config.completions = {
  algorithm:      prefix
  case_sensitive: false
  partial:        true
  quick:          true
  external: {
    enable:      true
    max_results: 100
    completer:   {|tokens: list<string>|
      let expanded = scope aliases | where name == $tokens.0 | get --ignore-errors expansion.0

      mut expanded_tokens = if $expanded != null and $tokens.0 != "cd" {
        $expanded | split row " " | append ($tokens | skip 1)
      } else {
        $tokens
      }

      $expanded_tokens.0 = ($expanded_tokens.0 | str trim --left --char "^")

      fish --command $"complete '--do-complete=($expanded_tokens | str join ' ')'"
      | $"value(char tab)description(char newline)" + $in
      | from tsv --flexible --no-infer
    }
  }
}

$env.config.cursor_shape = {
  vi_insert: line
  vi_normal: block
}

$env.config.hooks = {
  command_not_found: {||}

  display_output: {
    tee { table --expand | print }
    | $env.last = $in
  }

  env_change: {}

  pre_execution: [
    {
      let prompt = commandline | str trim

      if ($prompt | is-empty) {
        return
      }

      print $"(ansi title)($prompt) — nu(char bel)"
    }
  ]

  pre_prompt: []
}

def _ []: nothing -> any {
  $env.last
}

$env.config.menus = [
  {
    marker:                 "| "
    name:                   completion_menu
    only_buffer_difference: false
    style: {
      description_text: yellow
      selected_text:    green_reverse
      text:             green
    }
    type: {
      col_padding: 2
      col_width:   20
      columns:     4
      layout:      columnar
    }
  }
  {
    marker:                 "? "
    name:                   history_menu
    only_buffer_difference: true
    style: {
      description_text: yellow
      selected_text:    green_reverse
      text:             green
    }
    type: {
      layout:    list
      page_size: 10
    }
  }
  {
    marker:                 "? "
    name:                   help_menu
    only_buffer_difference: true
    style: {
      description_text: yellow
      selected_text:    green_reverse
      text:             green
    }
    type: {
      col_padding:      2
      col_width:        20
      columns:          4
      description_rows: 10
      layout:           description
      selection_rows:   4
    }
  }
]

$env.config.keybindings = [
  {
    name: copy_commandline
    modifier: alt
    keycode: char_c
    mode: [ vi_normal vi_insert ]
    event: {
      send: executehostcommand
      cmd: 'commandline | nu-highlight | $"```ansi\n($in)\n```" | copy'
    }
  }
  {
    name:     completion_menu
    modifier: none
    keycode:  tab
    mode:     [ vi_normal vi_insert ]
    event:    {
      until: [
        { send: menu name: completion_menu }
        { send: menunext }
        { edit: complete }
      ]
    }
  }
  {
    name:     history_menu
    modifier: control
    keycode:  char_h
    mode:     [ vi_insert vi_normal ]
    event:    { send: menu name: history_menu }
  }
  {
    name:     escape
    modifier: none
    keycode:  escape
    mode:     [ vi_normal vi_insert ]
    event:    { send: esc }
  }
  {
    name:     cancel_command
    modifier: control
    keycode:  char_c
    mode:     [ vi_normal vi_insert ]
    event:    { send: ctrlc }
  }
  {
    name:     quit_shell
    modifier: control
    keycode:  char_d
    mode:     [ vi_normal vi_insert ]
    event:    { send: ctrld }
  }
  {
    name:     clear_screen
    modifier: control
    keycode:  char_l
    mode:     [ vi_normal vi_insert ]
    event:    { send: clearscreen }
  }
  {
    name:     open_command_editor
    modifier: control
    keycode:  char_o
    mode:     [ vi_normal vi_insert ]
    event:    { send: openeditor }
  }
  {
    name:     abbr
    modifier: control
    keycode:  space
    mode:     [ vi_normal vi_insert ]
    event: [
      { send: menu name: abbr_menu }
      { edit: insertchar, value: " " }
    ]
  }
  {
    name:     move_up
    modifier: none
    keycode:  up
    mode:     [ vi_normal vi_insert ]
    event:    {
      until: [
        { send: menuup }
        { send: up }
      ]
    }
  }
  {
    name:     move_down
    modifier: none
    keycode:  down
    mode:     [ vi_normal vi_insert ]
    event:    {
      until: [
        { send: menudown }
        { send: down }
      ]
    }
  }
  {
    name:     move_left
    modifier: none
    keycode:  left
    mode:     [ vi_normal vi_insert ]
    event:    {
      until: [
        { send: menuleft }
        { send: left }
      ]
    }
  }
  {
    name:     move_right_or_take_history_hint
    modifier: none
    keycode:  right
    mode:     [ vi_normal vi_insert ]
    event:    {
      until: [
        { send: historyhintcomplete }
        { send: menuright }
        { send: right }
      ]
    }
  }
  {
    name:     move_one_word_left
    modifier: control
    keycode:  left
    mode:     [ vi_normal vi_insert ]
    event:    { edit: movewordleft }
  }
  {
    name:     move_one_word_right_or_take_history_hint
    modifier: control
    keycode:  right
    mode:     [ vi_normal vi_insert ]
    event:    {
      until: [
        { send: historyhintwordcomplete }
        { edit: movewordright }
      ]
    }
  }
  {
    name:     move_to_line_start
    modifier: control
    keycode:  char_0
    mode:     [ vi_normal vi_insert ]
    event:    { edit: movetolinestart }
  }
  {
    name:     move_to_line_end_or_take_history_hint
    modifier: control
    keycode:  char_$
    mode:     [ vi_normal vi_insert ]
    event:    {
      until: [
        { send: historyhintcomplete }
        { edit: movetolineend }
      ]
    }
  }
  {
    name:     delete_one_character_backward
    modifier: none
    keycode:  backspace
    mode:     vi_insert
    event:    { edit: backspace }
  }
  {
    name:     delete_one_word_backward
    modifier: alt
    keycode:  backspace
    mode:     vi_insert
    event:    { edit: backspaceword }
  }
  {
    name:     newline_or_run_command
    modifier: none
    keycode:  enter
    mode:     vi_insert
    event:    { send: enter }
  }
]

