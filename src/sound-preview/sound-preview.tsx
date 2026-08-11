import { useEffect } from 'preact/hooks'
import { previewModel } from './model'
import { stopPlayback } from './playback'
import { SharedSection } from './shared-section'
import { SoundMatrix } from './sound-matrix'
import { SoundPreviewHeader } from './sound-preview-header'

// Escape stops all playback — a browser API concern, so useEffect per the
// project's Preact rules (effect()/useSignalEffect() are for reacting to
// signals, not for wiring DOM listeners).
const useEscapeStopsPlayback = () => {
    useEffect(() => {
        const handleKeydown = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return
            stopPlayback()
        }
        window.addEventListener('keydown', handleKeydown)
        return () => window.removeEventListener('keydown', handleKeydown)
    }, [])
}

export const SoundPreview = () => {
    useEscapeStopsPlayback()

    return (
        <div class="sound-preview">
            <SoundPreviewHeader totals={previewModel.totals} />
            <SoundMatrix banks={previewModel.banks} sets={previewModel.sets} />
            <SharedSection shared={previewModel.shared} />
        </div>
    )
}
