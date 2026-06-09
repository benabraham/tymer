import { useState } from 'preact/hooks'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faXmark } from '@fortawesome/free-solid-svg-icons'
import {
    allConfigs,
    activeConfig,
    activeConfigId,
    configPanelOpen,
    addConfig,
    duplicateConfig,
    deleteConfig,
    updateConfigText,
    updateConfigName,
} from '../../../lib/period-configs'
import {
    canConfigureDurations,
    editingCurrentDurations,
    selectAndApplyConfig,
    applyActiveConfig,
    closeDurationsPanel,
} from '../../../lib/timer'
import { AutoTextarea } from './auto-textarea'
import { CurrentDurationsEditor } from './current-durations-editor'
import './durations-config.scss'

// Below the top button row. Two modes share this area:
//  - config mode (timer idle / no meaningful elapsed): pick & edit named configs
//  - current-durations mode (timer running/paused): edit the live timeline
export const DurationsConfigPanel = () => {
    if (!configPanelOpen.value) return null
    // Once a live edit session is underway, stay in that mode even if the edited
    // elapsed dips below the 1-minute threshold (which would otherwise flip
    // canConfigureDurations and unmount the editor mid-edit).
    if (editingCurrentDurations.value) return <CurrentDurationsEditor />
    if (canConfigureDurations.value) return <ConfigEditor />
    return null
}

// Pick a config (applies it immediately) and edit its period definition. There
// is no save button — edits persist and re-apply to the timeline as you type.
// The textarea stays hidden behind an Edit toggle until the user wants it.
const ConfigEditor = () => {
    const [showEditor, setShowEditor] = useState(false)

    const active = activeConfig.value
    const isBuiltin = active.readonly

    const handleSelect = id => selectAndApplyConfig(id)

    const handleAdd = () => {
        addConfig() // becomes the active config
        applyActiveConfig()
        setShowEditor(true) // open editor so the new config can be filled in
    }

    const handleDuplicate = () => {
        duplicateConfig(active.id) // becomes the active config
        applyActiveConfig()
        setShowEditor(true)
    }

    const handleDelete = () => {
        deleteConfig(active.id) // falls back to the built-in config
        applyActiveConfig()
    }

    const handleInput = text => {
        updateConfigText(active.id, text)
        applyActiveConfig()
    }

    return (
        <section class="durations-config">
            <div class="durations-config__list">
                {allConfigs.value.map(config => (
                    <button
                        key={config.id}
                        class={`durations-config__chip ${
                            config.id === activeConfigId.value
                                ? 'durations-config__chip--active'
                                : ''
                        }`}
                        onClick={() => handleSelect(config.id)}
                    >
                        {config.name}
                    </button>
                ))}
                <button
                    class="durations-config__chip durations-config__chip--add"
                    onClick={handleAdd}
                >
                    + Add new config
                </button>
                <button
                    class="durations-config__chip durations-config__close"
                    aria-label="Close"
                    title="Close"
                    onClick={closeDurationsPanel}
                >
                    <FontAwesomeIcon icon={faXmark} />
                </button>
            </div>

            <div class="durations-config__editor">
                <div class="durations-config__actions">
                    <button
                        class={showEditor ? 'durations-config__edit--active' : ''}
                        onClick={() => setShowEditor(open => !open)}
                    >
                        Edit
                    </button>
                    <button onClick={handleDuplicate}>Duplicate config</button>
                    {!isBuiltin && (
                        <button class="durations-config__delete" onClick={handleDelete}>
                            Delete config
                        </button>
                    )}
                </div>

                {showEditor && (
                    <>
                        <input
                            type="text"
                            class="durations-config__name"
                            value={active.name}
                            readonly={isBuiltin}
                            placeholder="Config name"
                            onInput={e => updateConfigName(active.id, e.currentTarget.value)}
                        />
                        <AutoTextarea
                            value={active.text}
                            readonly={isBuiltin}
                            onInput={handleInput}
                        />
                    </>
                )}
            </div>
        </section>
    )
}
