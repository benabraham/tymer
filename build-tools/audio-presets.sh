#!/bin/bash

# Named ffmpeg filter chains ("presets") applied when a set's WAVs are converted
# to public/sounds/*.webm. Sourced by normalize_audio.sh (which applies them
# before its loudnorm) and by preview-audio-preset.sh (which renders to a temp
# dir for listening). The source WAVs in src/assets/sounds/ are never modified —
# a preset shapes only the encoded output, so re-running the conversion with a
# tweaked preset regenerates everything from the clean originals.
#
# Which set gets which preset lives in audio-presets.conf next to this file.
#
# Every preset function emits a -filter_complex graph reading [0:a] and ending
# in [out]. Chains that synthesize extra audio (noise, tones) generate it at
# 24 kHz mono, so the input is conditioned to that first — a sample-rate
# mismatch inside concat silently mangles the synthesized segments.

audio_presets_conf="$(dirname "${BASH_SOURCE[0]}")/audio-presets.conf"

# set name -> preset name (empty when unmapped)
audio_preset_for_set() {
    [ -f "$audio_presets_conf" ] || return 0
    awk -v s="$1" '!/^#/ && $1 == s { print $2; exit }' "$audio_presets_conf"
}

# wav path -> preset name, deriving the set from the stem minus the -N take
# suffix (control-2.wav -> control), same rule as generate-sound-manifest.js
audio_preset_for_file() {
    local base
    base=$(basename "$1" .wav)
    [[ $base =~ ^(.+)-[0-9]+$ ]] && base=${BASH_REMATCH[1]}
    audio_preset_for_set "$base"
}

# preset name + wav path -> filter_complex graph on stdout; fails on unknown name
audio_preset_filter() {
    case "$1" in
        apollo) _audio_preset_apollo "$2" ;;
        headset) _audio_preset_headset ;;
        *)
            echo "Unknown audio preset: $1" >&2
            return 1
            ;;
    esac
}

# Mission-control radio loop: band-limit -> compression -> overdriven clip ->
# post-clip band-limit (the clipper regenerates bass) -> bitcrush, plus an
# AGC-style fade (voice and noise floor wander in opposite phase), sparse
# static crackle, Quindar beeps with key-up/key-down static bursts. The
# Quindar tones detune and vary in level per file, and the noise and crackle
# generators are seeded per file — every clip gets its own pattern, but the
# same file always converts to the same output.
_audio_preset_apollo() {
    local seed f1 f2 bvol s0 s1 s2
    seed=$(basename "$1" | cksum | cut -d' ' -f1)
    f1=$((2525 + seed % 61 - 30))
    f2=$((2475 + seed / 61 % 61 - 30))
    bvol=$(awk -v s="$((seed % 97))" 'BEGIN { printf "%.3f", 0.30 + s / 97 * 0.12 }')
    # three expression-state seeds in (0,1) for the crackle's random() streams,
    # and three phases (0..2pi) shifting the noise floor's motion per file
    local p0 p1 p2
    read -r s0 s1 s2 p0 p1 p2 < <(awk -v s="$seed" 'BEGIN { srand(s); printf "%.6f %.6f %.6f %.4f %.4f %.4f", rand(), rand(), rand(), 6.2832 * rand(), 6.2832 * rand(), 6.2832 * rand() }')

    local voice noise crackle ks1 beep1 beep2 ks2
    voice="[0:a]aformat=channel_layouts=mono,aresample=24000,highpass=f=550,lowpass=f=3000,acompressor=threshold=-24dB:ratio=8:attack=2:release=50:makeup=8,volume=14dB,asoftclip=type=hard:param=0.25,volume=-8dB,highpass=f=650,lowpass=f=2800,acrusher=bits=4:mode=log:aa=1:mix=0.95,volume=eval=frame:volume='0.82+0.18*sin(2*PI*0.31*t)*sin(2*PI*0.113*t+1.3)'[v]"
    # mostly steady floor: a small slow drift plus occasional brief bumps —
    # a ramped threshold on a product of sines lifts the floor for well under a
    # second every few seconds, at per-file phases, instead of the old
    # continuous sea-swell wander
    noise="anoisesrc=color=pink:r=24000:seed=${seed}:amplitude=0.40:duration=60,highpass=f=650,lowpass=f=2800,volume=eval=frame:volume='0.6+0.06*sin(2*PI*0.05*t+${p0})+0.3*clip((sin(2*PI*0.19*t+${p1})*sin(2*PI*0.47*t+${p2})-0.8)/0.15,0,1)'[n]"
    # sparse mixed-amplitude pops (~2/s); the first sample seeds the three
    # random() state slots so the pattern differs per file
    crackle="aevalsrc='if(lt(n,1),st(0,${s0})+st(1,${s1})+st(2,${s2}))*0+gt(random(0),0.99993)*(2*random(1)-1)*pow(random(2),2)':s=24000:d=60,highpass=f=1000,lowpass=f=2800,volume=3.2[cr]"
    ks1="anoisesrc=color=white:r=24000:seed=$((seed + 1)):amplitude=1:duration=0.12,highpass=f=650,lowpass=f=2800,volume=0.55,afade=t=in:d=0.01,afade=t=out:st=0.08:d=0.04[ks1]"
    beep1="sine=f=${f1}:r=24000:d=0.25,volume=${bvol},afade=t=out:st=0.2:d=0.05[b1]"
    beep2="sine=f=${f2}:r=24000:d=0.25,volume=${bvol},afade=t=out:st=0.2:d=0.05[b2]"
    ks2="anoisesrc=color=white:r=24000:seed=$((seed + 2)):amplitude=1:duration=0.25,highpass=f=650,lowpass=f=2800,volume=0.6,afade=t=out:st=0.08:d=0.17[ks2]"

    echo "${voice};${noise};${crackle};[v][n][cr]amix=inputs=3:duration=first:normalize=0[m];${ks1};${beep1};${beep2};${ks2};[ks1][b1][m][b2][ks2]concat=n=5:v=0:a=1[out]"
}

# Clean intercom: band-limit + compression only, no synthesized audio
_audio_preset_headset() {
    echo "[0:a]highpass=f=300,lowpass=f=3400,acompressor=threshold=-20dB:ratio=4:attack=5:release=80:makeup=4[out]"
}
