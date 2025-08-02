#!/bin/bash

# Normalize WAV files to -18 LUFS and convert to Opus format
# Source: src/assets/sounds/*.wav
# Output: public/sounds/*.webm (Opus codec, 128kbps)
# Usage: ./normalize_audio.sh

target_lufs=-18
target_tp=-2
target_lra=7
bitrate=128k

echo "Normalizing WAV files to ${target_lufs} LUFS and converting to Opus at ${bitrate}..."

# Create output directory
mkdir -p public/sounds

# Process all subdirectories in src/assets/sounds using for loop instead of while
for file in $(find src/assets/sounds -name "*.wav" -type f); do
    echo "Processing: $file"

    # Get relative path from src/assets/sounds
    rel_path="${file#src/assets/sounds/}"
    # Create output path with .webm extension
    output_file="public/sounds/${rel_path%.*}.webm"
    # Create output directory if needed
    output_dir=$(dirname "$output_file")
    mkdir -p "$output_dir"

    # Normalize and convert to Opus
    if ffmpeg -i "$file" -af loudnorm=I=${target_lufs}:TP=${target_tp}:LRA=${target_lra} -c:a libopus -b:a ${bitrate} -ar 48000 "$output_file" -y -loglevel warning 2>/dev/null; then
        echo "✓ Completed: $output_file"
    else
        echo "✗ Failed: $file"
    fi
done

echo "Audio normalization and Opus conversion complete!"
echo "Source WAV files preserved in src/assets/sounds/"
echo "Optimized Opus files generated in public/sounds/"
