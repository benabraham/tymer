#!/bin/bash

# Normalize WAV files to -18 LUFS and convert to Opus format
# Source: src/assets/sounds/**/*.wav
# Output: public/sounds/**/*.webm (Opus codec, 128kbps)
#
# Usage:
#   ./normalize_audio.sh                                  # the whole bank
#   ./normalize_audio.sh src/assets/sounds/elapsed        # one branch
#   ./normalize_audio.sh src/assets/sounds/elapsed/006/brisk-1.wav ...
#
# Arguments are files or directories inside src/assets/sounds/; anything else is
# skipped. Promoting a set converts only what it copied, which is why this takes
# arguments at all — re-encoding the whole bank on every promote is minutes of
# ffmpeg for a handful of new clips. The manifest is regenerated either way,
# since public/sounds/ changed no matter how few files moved.

target_lufs=-18
target_tp=-2
target_lra=7
bitrate=128k

# Arguments are relative to the caller's shell; every path below is relative to
# the repo. Resolve before moving.
requested=()
for path in "$@"; do
    if [ -e "$path" ]; then
        requested+=("$(realpath "$path")")
    else
        echo "Skipping (not found): $path"
    fi
done

cd "$(dirname "$0")" || exit 1

source_root="src/assets/sounds"
[ ${#requested[@]} -eq 0 ] && requested=("$source_root")

# Expand directories, keep files. -print0 so a space in a path stays one entry.
files=()
for path in "${requested[@]}"; do
    if [ -d "$path" ]; then
        while IFS= read -r -d '' found; do
            files+=("$found")
        done < <(find "$path" -name "*.wav" -type f -print0)
    else
        files+=("$path")
    fi
done

echo "Normalizing ${#files[@]} file(s) to ${target_lufs} LUFS and converting to Opus at ${bitrate}..."

mkdir -p public/sounds

for file in "${files[@]}"; do
    # Position within the source tree — the same path is used under public/.
    # Absolute paths are handled by matching on the tree root rather than a prefix.
    case "$file" in
        *"$source_root"/*) rel_path="${file#*$source_root/}" ;;
        *)
            echo "Skipping (outside $source_root): $file"
            continue
            ;;
    esac

    echo "Processing: $rel_path"

    output_file="public/sounds/${rel_path%.*}.webm"
    mkdir -p "$(dirname "$output_file")"

    if ffmpeg -i "$file" -af loudnorm=I=${target_lufs}:TP=${target_tp}:LRA=${target_lra} -c:a libopus -b:a ${bitrate} -ar 48000 "$output_file" -y -loglevel warning 2>/dev/null; then
        echo "✓ Completed: $output_file"
    else
        echo "✗ Failed: $file"
    fi
done

echo "Audio normalization and Opus conversion complete!"
echo "Source WAV files preserved in src/assets/sounds/"
echo "Optimized Opus files generated in public/sounds/"

node build-tools/generate-sound-manifest.js
echo "Regenerated src/lib/sound-manifest.js from public/sounds/"
