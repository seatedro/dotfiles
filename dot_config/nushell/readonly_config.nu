load-env {
    "EDITOR": "nano"
    "GIO_EXTRA_MODULES": "/nix/store/h7vfxsiv1mwg0a9bbb9zh04jr1m2ajq9-gvfs-1.57.2/lib/gio/modules:/nix/store/0rq9g4rvssd2ldp9x854h49fn0gb2l43-dconf-0.40.0-lib/lib/gio/modules"
    "GTK_A11Y": "none"
    "GTK_IM_MODULE": "fcitx"
    "LANG": "en_US.UTF-8"
    "LESSKEYIN_SYSTEM": "/nix/store/qlbfg75i4wz6sb2ipzh4n1k0p8gp4wjp-lessconfig"
    "LOCALE_ARCHIVE": "/run/current-system/sw/lib/locale/locale-archive"
    "NIXPKGS_CONFIG": "/etc/nix/nixpkgs-config.nix"
    "NIX_LD": "/run/current-system/sw/share/nix-ld/lib/ld.so"
    "NIX_LD_LIBRARY_PATH": "/run/current-system/sw/share/nix-ld/lib"
    "NIX_PATH": "nixpkgs=flake:nixpkgs"
    "NIX_XDG_DESKTOP_PORTAL_DIR": "/run/current-system/sw/share/xdg-desktop-portal/portals"
    "NO_AT_BRIDGE": "1"
    "PAGER": "less"
    "QT_IM_MODULE": "fcitx"
    "QT_PLUGIN_PATH": "/nix/store/2a3m5j3dlfnc2rj5y2w0qypsbaz4z97a-fcitx5-with-addons-5.1.12/lib/qt-6/plugins"
    "SSH_ASKPASS": ""
    "STARSHIP_LOG": "error"
    "TZDIR": "/etc/zoneinfo"
    "XCURSOR_PATH": "$HOME/.icons:$HOME/.local/share/icons"
    "XDG_CONFIG_DIRS": "/etc/xdg"
    "XDG_DATA_DIRS": "/nix/store/3l3s37phb476l0kj2mv8balps23fb9aj-desktops/share"
    "XMODIFIERS": "@im=fcitx"
}

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

  shell_integration: {
    osc2:                   false
    osc7:                   true
    osc8:                   true
    osc9_9:                 false
    osc133:                 true
    osc633:                 true
    reset_application_mode: true
  }
}

$env.config.ls = {
  clickable_links: true
  use_ls_colors: true
}

$env.config.rm.always_trash = false

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
  vi_insert: block
  vi_normal: block
}

$env.config.hooks = {
  command_not_found: {||}

  display_output: {
    tee { table --expand | print }
    | $env.last = $in
  }

  env_change: {
    PWD: ($env.config.hooks.env_change.PWD? | default [])
  }

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

source ~/.cache/carapace/init.nu

source /nix/store/q7ia4s3h592lbwnsiqz9q7fzp4yya55q-atuin-nushell-config.nu

$env.config = ($env.config? | default {})
$env.config.hooks = ($env.config.hooks? | default {})
$env.config.hooks.pre_prompt = (
    $env.config.hooks.pre_prompt?
    | default []
    | append {||
        /nix/store/jn8rvwixndyhk3ilibx8n7sx49fa34hy-direnv-2.36.0/bin/direnv export json
        | from json --strict
        | default {}
        | items {|key, value|
            let value = do (
                {
                  "path": {
                    from_string: {|s| $s | split row (char esep) | path expand --no-symlink }
                    to_string: {|v| $v | path expand --no-symlink | str join (char esep) }
                  }
                }
                | merge ($env.ENV_CONVERSIONS? | default {})
                | get -i $key
                | get -i from_string
                | if ($in | is-empty) { {|x| $x} } else { $in }
            ) $value
            return [ $key $value ]
        }
        | into record
        | load-env
    }
)

alias "cat" = bat
alias "cdtmp" = cd (mktemp --directory)
alias "cp" = cp --recursive --verbose --progress
alias "find" = fd
alias "g" = git
alias "ga" = git add
alias "gb" = git branch
alias "gc" = git commit
alias "gco" = git checkout
alias "gdiff" = git diff
alias "gl" = git log --oneline --graph
alias "gp" = git push
alias "gpl" = git pull
alias "grep" = rg
alias "gs" = git status
alias "jd" = jj desc
alias "jf" = jj git fetch
alias "jn" = jj new
alias "jp" = jj git push
alias "js" = jj st
alias "la" = eza --all
alias "ll" = ls --long
alias "lla" = eza --long --all
alias "mk" = mkdir
alias "mv" = mv --verbose
alias "nb" = nix build
alias "nd" = nix develop
alias "nf" = nix flake
alias "nr" = nix run
alias "ns" = nix shell
alias "rm" = rm --recursive --verbose
alias "vim" = nvim
