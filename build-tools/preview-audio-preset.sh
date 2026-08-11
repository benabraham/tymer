#!/bin/bash

# Listen to a preset over generated WAVs without touching the project: renders
# filtered + loudnormed copies (the same chain normalize_audio.sh would encode)
# to a temp dir and plays them with mpv.
#
# Usage:
#   build-tools/preview-audio-preset.sh <preset> <wav-or-dir> [...]
#   build-tools/preview-audio-preset.sh apollo build-tools/tts/.staging/control/
#   build-tools/preview-audio-preset.sh apollo src/assets/sounds/elapsed/006/control-1.wav

set -euo pipefail

# shellcheck source=build-tools/audio-presets.sh
source "$(dirname "$0")/audio-presets.sh"

# Keep in sync with normalize_audio.sh
loudnorm="loudnorm=I=-18:TP=-2:LRA=7"

preset=${1:?usage: preview-audio-preset.sh <preset> <wav-or-dir> [...]}
shift
[ $# -gt 0 ] || {
    echo "No files given" >&2
    exit 1
}

files=()
for path in "$@"; do
    if [ -d "$path" ]; then
        while IFS= read -r -d '' found; do
            files+=("$found")
        done < <(find "$path" -name "*.wav" -type f -print0 | sort -z)
    elif [ -f "$path" ]; then
        files+=("$path")
    else
        echo "Skipping (not found): $path"
    fi
done

[ ${#files[@]} -gt 0 ] || {
    echo "No WAV files found" >&2
    exit 1
}

tmpdir=$(mktemp -d -t preset-preview-XXXXXX)
trap 'rm -rf "$tmpdir"' EXIT

rendered=()
i=0
for file in "${files[@]}"; do
    i=$((i + 1))
    chain=$(audio_preset_filter "$preset" "$file")
    out=$(printf '%s/%02d-%s' "$tmpdir" "$i" "$(basename "$file")")
    if ffmpeg -i "$file" -filter_complex "${chain};[out]${loudnorm}[norm]" \
        -map "[norm]" "$out" -y -loglevel warning 2>/dev/null; then
        rendered+=("$out")
    else
        echo "✗ Failed: $file"
    fi
done

echo "Playing ${#rendered[@]} clip(s) with preset '$preset'..."
# ${filename} below is expanded by mpv, not the shell
# shellcheck disable=SC2016
mpv --msg-level=all=error --term-playing-msg='>>> ${filename}' "${rendered[@]}"
