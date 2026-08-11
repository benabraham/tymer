import type { SharedRow } from './preview-model'
import { SoundCell } from './sound-cell'

// The set-less events (78 notification chimes collapsed into one event,
// plus button and timerFinished) — belong to no voice, so they render as a
// flat list, not a matrix row/column. A row can carry many takes (the
// notification row alone has 78), so each item takes the full width and
// its chip container wraps on its own rather than being squeezed into an
// auto-fill grid cell.
export const SharedSection = ({ shared }: { shared: SharedRow[] }) => {
    const takeCount = shared.reduce((sum, row) => sum + row.takes.length, 0)

    return (
        <section class="sound-preview__shared" aria-labelledby="shared-heading">
            <h2 class="sound-preview__bank-title" id="shared-heading">
                Shared — plays under every voice set ({takeCount} takes)
            </h2>
            <div class="sound-preview__shared-list">
                {shared.map(row => (
                    <div class="sound-preview__shared-item" key={row.key}>
                        <span class="sound-preview__shared-label">
                            {row.label} ({row.takes.length})
                        </span>
                        <SoundCell
                            cell={{ set: row.key, takes: row.takes }}
                            groupId={`shared:${row.key}`}
                        />
                    </div>
                ))}
            </div>
        </section>
    )
}
