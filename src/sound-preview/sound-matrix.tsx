import { faPause, faPlay, faPlayCircle } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { useComputed } from '@preact/signals'
import { soundSetLabel } from '../lib/sound-set'
import { buildEverythingItems, buildVoiceItems } from './matrix-playback'
import { playingGroupId, playingLocation, playQueue, stopPlayback } from './playback'
import type { PreviewBank } from './preview-model'
import { SoundRow } from './sound-row'

const CORNER_GROUP_ID = 'matrix:everything'

// The whole matrix as ONE grid — a sticky header row (corner "play
// everything" + one button per voice, each name appearing exactly once),
// then each bank as a full-width title row followed by its event rows with
// no repeated voice names. One grid (not one per bank) keeps every bank's
// columns aligned under the same sticky header.
export const SoundMatrix = ({ banks, sets }: { banks: PreviewBank[]; sets: string[] }) => (
    <div class="sound-preview__grid" style={{ '--sound-preview-columns': sets.length }}>
        <div class="sound-preview__row sound-preview__row--header">
            <MatrixCorner banks={banks} sets={sets} />
            {sets.map(set => (
                <VoiceHeaderButton key={set} banks={banks} set={set} />
            ))}
        </div>
        {banks.flatMap(bank => [
            <div class="sound-preview__bank-title-row" key={`title-${bank.id}`}>
                {bank.label}
            </div>,
            ...bank.rows.map(row => <SoundRow key={row.key} row={row} />),
        ])}
    </div>
)

const MatrixCorner = ({ banks, sets }: { banks: PreviewBank[]; sets: string[] }) => {
    const isPlaying = useComputed(() => playingGroupId.value === CORNER_GROUP_ID)

    const handleClick = () => {
        if (isPlaying.value) {
            stopPlayback()
            return
        }
        playQueue({ items: buildEverythingItems(banks, sets), groupId: CORNER_GROUP_ID })
    }

    return (
        <button
            type="button"
            class={`sound-preview__corner ${isPlaying.value ? 'sound-preview__corner--playing' : ''}`}
            onClick={handleClick}
            title={isPlaying.value ? 'Stop' : 'Play every voice, every event'}
            aria-label={isPlaying.value ? 'Stop' : 'Play every voice, every event'}
        >
            <FontAwesomeIcon icon={isPlaying.value ? faPause : faPlayCircle} />
            <span>All</span>
        </button>
    )
}

const VoiceHeaderButton = ({ banks, set }: { banks: PreviewBank[]; set: string }) => {
    const groupId = `voice:${set}`
    const isPlaying = useComputed(() => playingGroupId.value === groupId)
    const isColumnActive = useComputed(() => playingLocation.value.set === set)
    const label = soundSetLabel(set)

    const handleClick = () => {
        if (isPlaying.value) {
            stopPlayback()
            return
        }
        playQueue({ items: buildVoiceItems(banks, set), groupId })
    }

    const buttonClass = [
        'sound-preview__column-header',
        isPlaying.value ? 'sound-preview__column-header--playing' : '',
        !isPlaying.value && isColumnActive.value ? 'sound-preview__column-header--active' : '',
    ]
        .filter(Boolean)
        .join(' ')

    return (
        <button
            type="button"
            class={buttonClass}
            onClick={handleClick}
            title={isPlaying.value ? 'Stop' : `Play every "${label}" take across the whole matrix`}
            aria-label={isPlaying.value ? 'Stop' : `Play all ${label} takes`}
        >
            <FontAwesomeIcon icon={isPlaying.value ? faPause : faPlay} />
            <span>{label}</span>
        </button>
    )
}
