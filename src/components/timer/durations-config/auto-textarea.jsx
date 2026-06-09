import { useRef, useLayoutEffect } from 'preact/hooks'

// Textarea that grows vertically to fit its content (no inner scrollbar).
export const AutoTextarea = ({ value, readonly = false, onInput, ...props }) => {
    const ref = useRef(null)

    const resize = () => {
        const el = ref.current
        if (!el) return
        el.style.height = 'auto'
        el.style.height = `${el.scrollHeight}px`
    }

    // Re-fit whenever the value changes (typing, switching configs, etc.)
    useLayoutEffect(resize, [value])

    const handleInput = e => {
        if (onInput) onInput(e.currentTarget.value)
        resize()
    }

    return (
        <textarea
            ref={ref}
            class="durations-config__textarea"
            value={value}
            readonly={readonly}
            spellcheck={false}
            rows={1}
            onInput={handleInput}
            {...props}
        />
    )
}
