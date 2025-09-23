#!/bin/bash

# Normalize WAV files and combine them into one file with 500ms pauses
# Source: src/assets/sounds/*.wav
# Output: Individual files in public/sounds/ + combined_sounds_preview.webm
# Usage: ./combine_all_sounds.sh

target_lufs=-18
target_tp=-2
target_lra=7
bitrate=128k
silence_duration=0.5  # 500ms silence between sounds

echo "Normalizing WAV files and combining with ${silence_duration}s pauses..."

# Create output directory
mkdir -p public/sounds

# Create temporary directory for processing
temp_dir=$(mktemp -d)
echo "Using temporary directory: $temp_dir"

# Arrays to store file paths
processed_files=()
general_files=()
elapsed_files=()
remaining_files=()
timesup_files=()
overtime_files=()

# Function to categorize and list files chronologically
categorize_files() {
    # Clear arrays for each category
    general_files=()
    elapsed_files=()
    remaining_files=()
    timesup_files=()
    overtime_files=()

    echo "Scanning for WAV files in src/assets/sounds..."

    # Categorize all WAV files
    while IFS= read -r -d '' file; do
        rel_path="${file#src/assets/sounds/}"
        echo "  Found: $rel_path"

        if [[ "$rel_path" == elapsed/* ]]; then
            elapsed_files+=("$file")
            echo "    → Categorized as: ELAPSED"
        elif [[ "$rel_path" == remaining/* ]]; then
            remaining_files+=("$file")
            echo "    → Categorized as: REMAINING"
        elif [[ "$rel_path" == timesup/* ]]; then
            timesup_files+=("$file")
            echo "    → Categorized as: TIMESUP"
        elif [[ "$rel_path" == overtime/* ]]; then
            overtime_files+=("$file")
            echo "    → Categorized as: OVERTIME"
        else
            # General UI sounds (button, timer-end, alternatives)
            general_files+=("$file")
            echo "    → Categorized as: GENERAL"
        fi
    done < <(find src/assets/sounds -name "*.wav" -type f -print0)

    # Sort each category only if non-empty
    if [ ${#general_files[@]} -gt 0 ]; then
        IFS=$'\n' general_files=($(printf '%s\n' "${general_files[@]}" | sort))
    fi
    if [ ${#elapsed_files[@]} -gt 0 ]; then
        IFS=$'\n' elapsed_files=($(printf '%s\n' "${elapsed_files[@]}" | sort))
    fi
    if [ ${#remaining_files[@]} -gt 0 ]; then
        IFS=$'\n' remaining_files=($(printf '%s\n' "${remaining_files[@]}" | sort))
    fi
    if [ ${#timesup_files[@]} -gt 0 ]; then
        IFS=$'\n' timesup_files=($(printf '%s\n' "${timesup_files[@]}" | sort))
    fi
    if [ ${#overtime_files[@]} -gt 0 ]; then
        IFS=$'\n' overtime_files=($(printf '%s\n' "${overtime_files[@]}" | sort))
    fi

    # Debug: show what's in each category
    echo ""
    echo "📊 CATEGORIZATION RESULTS:"
    echo "📂 General sounds: ${#general_files[@]} files"
    if [ ${#general_files[@]} -gt 0 ]; then
        echo "   First: $(basename "${general_files[0]}")"
    fi

    echo "⏱️  Elapsed sounds: ${#elapsed_files[@]} files"
    if [ ${#elapsed_files[@]} -gt 0 ]; then
        echo "   First: $(basename "${elapsed_files[0]}")"
    fi

    echo "⏰ Remaining sounds: ${#remaining_files[@]} files"
    if [ ${#remaining_files[@]} -gt 0 ]; then
        echo "   First: $(basename "${remaining_files[0]}")"
    fi

    echo "⏹️  Times up sounds: ${#timesup_files[@]} files"
    if [ ${#timesup_files[@]} -gt 0 ]; then
        echo "   First: $(basename "${timesup_files[0]}")"
    fi

    echo "⏳ Overtime sounds: ${#overtime_files[@]} files"
    if [ ${#overtime_files[@]} -gt 0 ]; then
        echo "   First: $(basename "${overtime_files[0]}")"
    fi
    echo ""
}

# Function to process files in chronological order
process_files_chronologically() {
    # First categorize all files
    categorize_files

    # Process files in chronological order
    echo "🔄 PROCESSING FILES IN CHRONOLOGICAL ORDER..."

    # Function to process a single file
    process_single_file() {
        local file="$1"
        echo "Processing: $(basename "$file")"

        # Get relative path from src/assets/sounds
        rel_path="${file#src/assets/sounds/}"
        # Create output path with .webm extension
        output_file="public/sounds/${rel_path%.*}.webm"
        # Create output directory if needed
        output_dir=$(dirname "$output_file")
        mkdir -p "$output_dir"

        # Create temporary normalized file with unique name including directory
        temp_file="$temp_dir/${rel_path%.*}.wav"
        temp_file_dir=$(dirname "$temp_file")
        mkdir -p "$temp_file_dir"

        # Normalize and convert to WAV first (for combining)
        if ffmpeg -i "$file" -af loudnorm=I=${target_lufs}:TP=${target_tp}:LRA=${target_lra} -ar 48000 "$temp_file" -y -loglevel warning 2>/dev/null; then
            echo "✓ Normalized: $(basename "$file")"
            processed_files+=("$temp_file")

            # Also create the individual Opus file
            ffmpeg -i "$temp_file" -c:a libopus -b:a ${bitrate} "$output_file" -y -loglevel warning 2>/dev/null
        else
            echo "✗ Failed: $file"
        fi
    }

    # Process each category in chronological order
    echo "1️⃣ Processing ELAPSED sounds..."
    for file in "${elapsed_files[@]}"; do
        process_single_file "$file"
    done

    echo "2️⃣ Processing REMAINING sounds..."
    for file in "${remaining_files[@]}"; do
        process_single_file "$file"
    done

    echo "3️⃣ Processing TIMESUP sounds..."
    for file in "${timesup_files[@]}"; do
        process_single_file "$file"
    done

    echo "4️⃣ Processing OVERTIME sounds..."
    for file in "${overtime_files[@]}"; do
        process_single_file "$file"
    done

    echo "5️⃣ Processing GENERAL sounds..."
    for file in "${general_files[@]}"; do
        process_single_file "$file"
    done
}

# Process all WAV files and normalize them in chronological order
echo "Step 1: Normalizing individual files in chronological order..."
echo "Order: Elapsed → Remaining → Times Up → Overtime → General sounds"

process_files_chronologically

# Generate silence file
silence_file="$temp_dir/silence.wav"
echo "Step 2: Generating ${silence_duration}s silence..."
ffmpeg -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=48000 -t ${silence_duration} "$silence_file" -y -loglevel warning 2>/dev/null

# Simple approach: concatenate files one by one with silence
echo "Step 3: Combining sounds sequentially..."

# Start with the first file
current_file="${processed_files[0]}"
temp_combined="$temp_dir/combined.wav"

# Copy first file
cp "$current_file" "$temp_combined"

# Add each subsequent file with silence
for i in $(seq 1 $((${#processed_files[@]} - 1))); do
    next_file="${processed_files[$i]}"
    prev_combined="$temp_combined"
    temp_combined="$temp_dir/combined_$i.wav"

    echo "Adding sound $(($i + 1))/${#processed_files[@]}: $(basename "$next_file")"

    # Concatenate: previous_combined + silence + next_file
    ffmpeg -i "$prev_combined" -i "$silence_file" -i "$next_file" \
           -filter_complex "[0:a][1:a][2:a]concat=n=3:v=0:a=1[out]" \
           -map "[out]" "$temp_combined" -y -loglevel warning 2>/dev/null

    if [ $? -ne 0 ]; then
        echo "✗ Failed to add $(basename "$next_file")"
        break
    fi
done

# Convert final combined file to Opus
echo "Step 4: Converting to Opus format..."
if ffmpeg -i "$temp_combined" -c:a libopus -b:a ${bitrate} "combined_sounds_preview.webm" -y -loglevel warning 2>/dev/null; then
    echo "✓ Combined file created: combined_sounds_preview.webm"
else
    echo "✗ Failed to create final combined file"
fi

# Clean up temporary directory
rm -rf "$temp_dir"

echo ""
echo "Audio processing complete!"
echo "Individual normalized files: public/sounds/"
echo "Combined preview file: combined_sounds_preview.webm"
echo "Total sounds combined: ${#processed_files[@]}"