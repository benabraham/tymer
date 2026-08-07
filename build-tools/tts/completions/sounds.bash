# Tab completion for Tymer's TTS tool, plus the `sounds` command it completes.
#
#   source /path/to/tymer/build-tools/tts/completions/sounds.bash
#
# Then `sounds <TAB>` offers the subcommands, `sounds generate <TAB>` offers the
# set names actually present in sound-prompts/, and each subcommand offers only
# its own flags.
#
# Completion is registered per command word, and the documented ways to run this
# tool put someone else's name there — `uv run ...`, `pnpm run ...`. Overriding
# their completion to reach ours would break everything else those commands do,
# so this defines a `sounds` function instead and completes that. It resolves the
# tool directory from this file, so a clone anywhere works with no editing.

_TYMER_TTS_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
_TYMER_TTS_ROOT=$(cd -- "$_TYMER_TTS_DIR/../.." && pwd)

# TYMER_SOUNDS_LAUNCHER is how the tool learns it was reached through here: a
# shell function leaves no trace in the process it starts, and `uv --directory`
# chdirs, so from inside it is indistinguishable from a plain `cd`. Without it
# every "Promote it: ..." hint would name a command the user did not type.
sounds() {
    TYMER_SOUNDS_LAUNCHER=sounds uv run --directory "$_TYMER_TTS_DIR" sounds.py "$@"
}

# Sets are files on disk; globbing them keeps <TAB> instant. Asking the tool
# would mean a Python start-up and a dotenv read on every keypress.
_tymer_sounds_sets() {
    local file
    for file in "$_TYMER_TTS_ROOT"/sound-prompts/*.txt; do
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
            return  # a number; nothing to offer
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
        compopt -o dirnames 2>/dev/null  # the optional output directory
    fi
}

complete -F _tymer_sounds sounds sounds.py ./sounds.py
