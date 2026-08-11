import { faPause, faPlay } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { useComputed } from '@preact/signals'
import {
    type PlaybackItem,
    playingGroupId,
    playingLocation,
    playQueue,
    stopPlayback,
} from './playback'
import type { PreviewRow } from './preview-model'
import { SoundCell } from './sound-cell'

// One event across every voice set: a row label + ▶ (one take per set, in
// column order, skipping sets with no take) followed by the matrix cells.
// Bank sections no longer repeat the voice names — see SoundMatrix — so a
// row only needs its own key/label plus the cells.
export const SoundRow = ({ row }: { row: PreviewRow }) => {
    const groupId = `row:${row.key}`
    const isPlaying = useComputed(() => playingGroupId.value === groupId)
    const isRowActive = useComputed(() => playingLocation.value.rowKey === row.key)

    const handleRowPlay = () => {
        if (isPlaying.value) {
            stopPlayback()
            return
        }
        const items: PlaybackItem[] = row.cells
            .filter(cell => cell.takes.length > 0)
            .map(cell => ({ take: cell.takes[0], rowKey: row.key, set: cell.set }))
        playQueue({ items, groupId })
    }

    return (
        <div class="sound-preview__row">
            <div
                class={`sound-preview__row-label ${isRowActive.value ? 'sound-preview__row-label--active' : ''}`}
            >
                <button
                    type="button"
                    class={`button--xs sound-preview__row-play ${isPlaying.value ? 'sound-preview__row-play--playing' : ''}`}
                    onClick={handleRowPlay}
                    title={isPlaying.value ? 'Stop' : `Play "${row.label}" across every voice`}
                    aria-label={isPlaying.value ? 'Stop' : `Play ${row.label} across every voice`}
                >
                    <FontAwesomeIcon icon={isPlaying.value ? faPause : faPlay} />
                </button>
                <span>{row.label}</span>
            </div>
            {row.cells.map(cell => (
                <SoundCell
                    key={cell.set}
                    cell={cell}
                    rowKey={row.key}
                    groupId={`cell:${row.key}:${cell.set}`}
                />
            ))}
        </div>
    )
}
