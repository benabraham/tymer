import { faCheck, faPause, faPlay } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { useComputed } from '@preact/signals'
import type { SoundVariant } from '../lib/sound-manifest'
import {
    heardSrcs,
    type PlaybackItem,
    playingGroupId,
    playingLocation,
    playingSrc,
    playOne,
    playQueue,
    stopPlayback,
} from './playback'
import type { PreviewCell } from './preview-model'

// Basename of the take's src, for a chip tooltip that still identifies a
// specific take once the label above it stops being unique (e.g. the 78
// notification chimes all share one row label).
const takeBasename = (src: string) => src.split('/').pop() ?? src

type SoundCellProps = { cell: PreviewCell; groupId: string; rowKey?: string }

// One matrix cell: a ▶ for the cell's whole take sequence, plus numbered
// chips for each individual take. Empty cells (a voice with no take for
// this event) render as a dash rather than a dead button.
export const SoundCell = ({ cell, groupId, rowKey }: SoundCellProps) => {
    const isCellPlaying = useComputed(() => playingGroupId.value === groupId)
    const isRowActive = useComputed(
        () => rowKey !== undefined && playingLocation.value.rowKey === rowKey,
    )
    const isColumnActive = useComputed(() => playingLocation.value.set === cell.set)

    if (cell.takes.length === 0) {
        return (
            <div class="sound-preview__cell sound-preview__cell--empty" aria-hidden="true">
                —
            </div>
        )
    }

    const handleCellPlay = () => {
        if (isCellPlaying.value) {
            stopPlayback()
            return
        }
        const items: PlaybackItem[] = cell.takes.map(take => ({ take, rowKey, set: cell.set }))
        playQueue({ items, groupId })
    }

    const cellClass = [
        'sound-preview__cell',
        isRowActive.value ? 'sound-preview__cell--row-active' : '',
        isColumnActive.value ? 'sound-preview__cell--column-active' : '',
    ]
        .filter(Boolean)
        .join(' ')

    return (
        <div class={cellClass}>
            <button
                type="button"
                class={`button--xs sound-preview__cell-play ${isCellPlaying.value ? 'sound-preview__cell-play--playing' : ''}`}
                onClick={handleCellPlay}
                title={isCellPlaying.value ? 'Stop' : `Play ${cell.takes.length} take(s)`}
                aria-label={isCellPlaying.value ? 'Stop' : `Play ${cell.set} takes`}
            >
                <FontAwesomeIcon icon={isCellPlaying.value ? faPause : faPlay} />
            </button>
            <span class="sound-preview__chips">
                {cell.takes.map((take, index) => (
                    <TakeChip
                        key={take.src}
                        take={take}
                        index={index + 1}
                        rowKey={rowKey}
                        set={cell.set}
                    />
                ))}
            </span>
        </div>
    )
}

type TakeChipProps = { take: SoundVariant; index: number; rowKey?: string; set?: string }

const TakeChip = ({ take, index, rowKey, set }: TakeChipProps) => {
    // Keyed on the sounding take, NOT on the group that started it: a chip must
    // light up whether it was clicked directly or reached partway through a
    // cell/row/voice queue — that running highlight is the point of the page.
    const isPlaying = useComputed(() => playingSrc.value === take.src)
    const isHeard = useComputed(() => heardSrcs.value.has(take.src))

    const handleClick = () => {
        if (isPlaying.value) {
            stopPlayback()
            return
        }
        playOne({ take, rowKey, set })
    }

    const chipClass = [
        'sound-preview__chip',
        isPlaying.value ? 'sound-preview__chip--playing' : '',
        !isPlaying.value && isHeard.value ? 'sound-preview__chip--heard' : '',
    ]
        .filter(Boolean)
        .join(' ')

    return (
        <button
            type="button"
            class={chipClass}
            onClick={handleClick}
            title={takeBasename(take.src)}
        >
            {isHeard.value && !isPlaying.value ? (
                <FontAwesomeIcon icon={faCheck} class="sound-preview__chip-check" />
            ) : (
                index
            )}
        </button>
    )
}
