# Tab completion for Tymer's TTS tool.
#
# Reached two ways, and it has to work the same in both:
#
#   1. The dev shell. flake.nix puts a `sounds` command on PATH along with a
#      stub at share/bash-completion/completions/sounds, which bash-completion's
#      dynamic loader finds and which sources this file. Nothing to set up —
#      cd into the repo and press <TAB>.
#   2. Sourced by hand from a shell rc, for a shell with no direnv.
#
# Completion registers per command word, and every other way to run this tool
# puts someone else's name there — `uv run ...`, `pnpm run ...`. Overriding
# their completion to reach ours would break everything else those commands do,
# which is why a `sounds` command exists at all.

# Where the checkout is. TYMER_ROOT comes from the dev shell; without it this
# file was sourced from a checkout and can locate itself.
_TYMER_SOUNDS_ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../.." && pwd)

_tymer_sounds_root() {
    printf '%s\n' "${TYMER_ROOT:-$_TYMER_SOUNDS_ROOT}"
}

# Case 2 only. In the dev shell the real command is already on PATH, and a
# function would shadow it — silently, and with the wrong tool directory.
#
# TYMER_SOUNDS_LAUNCHER is how the tool learns it was reached through here: a
# shell function leaves no trace in the process it starts, and `uv --directory`
# chdirs, so from inside it is indistinguishable from a plain `cd`. Without it
# every "Promote it: ..." hint would name a command the user did not type.
if ! command -v sounds >/dev/null 2>&1; then
    sounds() {
        TYMER_SOUNDS_LAUNCHER=sounds \
            uv run --directory "$(_tymer_sounds_root)/build-tools/tts" sounds.py "$@"
    }
fi

# Sets are files on disk; globbing them keeps <TAB> instant. Asking the tool
# would mean a Python start-up and a dotenv read on every keypress.
_tymer_sounds_sets() {
    local file
    for file in "$(_tymer_sounds_root)"/sound-prompts/*.txt; do
        [ -e "$file" ] || continue
        file=${file##*/}
        printf '%s\n' "${file%.txt}"
    done
}

# Flags that swallow the next word, so it is never mistaken for a positional.
_TYMER_SOUNDS_VALUE_FLAGS='--only --limit --delay --audition'

_tymer_sounds() {
    local cur prev command word flags i
    cur=${COMP_WORDS[COMP_CWORD]}
    prev=${COMP_WORDS[COMP_CWORD - 1]}
    COMPREPLY=()

    # The subcommand is the first bare word; nothing else can be completed
    # meaningfully until it is known.
    command=''
    for ((i = 1; i < COMP_CWORD; i++)); do
        word=${COMP_WORDS[i]}
        [[ $word == -* ]] && continue
        command=$word
        break
    done

    if [[ -z $command ]]; then
        mapfile -t COMPREPLY < <(compgen -W 'generate regenerate audition promote' -- "$cur")
        return
    fi

    case $prev in
        --audition)
            mapfile -t COMPREPLY < <(compgen -W 'off each end' -- "$cur")
            return
            ;;
        --only)
            # The event branches; a trailing slash is a prefix, not a word end.
            mapfile -t COMPREPLY < <(
                compgen -W 'elapsed/ remaining/ overtime/ overtime/break/ timesup/' -- "$cur"
            )
            compopt -o nospace 2>/dev/null
            return
            ;;
        --limit | --delay)
            return # a number; nothing to offer
            ;;
    esac

    if [[ $cur == -* ]]; then
        flags='--help'
        case $command in
            generate) flags+=" $_TYMER_SOUNDS_VALUE_FLAGS --dry-run" ;;
            regenerate) flags+=" $_TYMER_SOUNDS_VALUE_FLAGS --dry-run --fresh --yes" ;;
            audition) flags+=' --only' ;;
            promote) flags+=' --replace --skip-normalize --keep-staging --yes' ;;
        esac
        mapfile -t COMPREPLY < <(compgen -W "$flags" -- "$cur")
        return
    fi

    # Count bare words to find which positional is being typed. The subcommand
    # is the first, so one means the set name is next and two means the optional
    # output directory.
    local positionals=0 skip=0
    for ((i = 1; i < COMP_CWORD; i++)); do
        word=${COMP_WORDS[i]}
        if ((skip)); then
            skip=0
            continue
        fi
        case " $_TYMER_SOUNDS_VALUE_FLAGS " in
            *" $word "*)
                skip=1
                continue
                ;;
        esac
        [[ $word == -* ]] && continue
        ((positionals++))
    done

    if ((positionals == 1)); then
        mapfile -t COMPREPLY < <(compgen -W "$(_tymer_sounds_sets)" -- "$cur")
    elif [[ $command == generate || $command == regenerate ]]; then
        compopt -o dirnames 2>/dev/null # the optional output directory
    fi
}

complete -F _tymer_sounds sounds sounds.py ./sounds.py
