import type { JSX } from 'preact'
import { useLayoutEffect, useRef } from 'preact/hooks'

type AutoTextareaProps = {
    value: string
    readonly?: boolean
    autoFocus?: boolean
    onInput?: (value: string) => void
} & Omit<JSX.IntrinsicElements['textarea'], 'value' | 'readonly' | 'autoFocus' | 'onInput'>

// Textarea that grows vertically to fit its content (no inner scrollbar).
export const AutoTextarea = ({
    value,
    readonly = false,
    autoFocus = false,
    onInput,
    ...props
}: AutoTextareaProps) => {
    const ref = useRef<HTMLTextAreaElement>(null)

    const resize = () => {
        const el = ref.current
        if (!el) return
        el.style.height = 'auto'
        el.style.height = `${el.scrollHeight}px`
    }

    // Re-fit whenever the value changes (typing, switching configs, etc.)
    useLayoutEffect(resize, [value])

    // Focus (cursor at end) on mount when requested.
    useLayoutEffect(() => {
        if (!autoFocus) return
        const el = ref.current
        if (!el) return
        el.focus()
        const end = el.value.length
        el.setSelectionRange(end, end)
    }, [])

    const handleInput = (e: JSX.TargetedEvent<HTMLTextAreaElement>) => {
        if (onInput) onInput(e.currentTarget.value)
        resize()
    }

    return (
        <textarea
            ref={ref}
            class="durations-config__textarea"
            value={value}
            readOnly={readonly}
            spellcheck={false}
            rows={1}
            onInput={handleInput}
            {...props}
        />
    )
}
