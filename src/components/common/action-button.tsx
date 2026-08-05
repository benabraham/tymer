// A button that remembers itself. Clicking blurs the button (so it does not keep
// a focus ring after acting) but records it, and a global Tab handler restores
// focus to it — pressing Tab after a click resumes where you were.
//
// It plays no sound: button sounds were switched off deliberately in a76e832.
// The remaining click sounds live in src/lib/timer.js (start/resume/pause/pin).

import type { ComponentChildren, JSX } from 'preact'
import { h } from 'preact'

type ActionButtonProps<T extends keyof JSX.IntrinsicElements = 'button'> = {
    onClick?: (e: JSX.TargetedMouseEvent<HTMLElement>) => void
    children?: ComponentChildren
    as?: T
} & Omit<JSX.IntrinsicElements[T], 'onClick' | 'children' | 'as'>

// Track last clicked button globally
let lastClickedButton: HTMLElement | null = null

// Global Tab handler to refocus last clicked button
if (typeof window !== 'undefined') {
    document.addEventListener('keydown', e => {
        if (e.key === 'Tab' && lastClickedButton && document.activeElement === document.body) {
            e.preventDefault()
            lastClickedButton.focus()
            lastClickedButton = null
        }
    })
}

export const ActionButton = <T extends keyof JSX.IntrinsicElements = 'button'>({
    onClick,
    children,
    as,
    ...props
}: ActionButtonProps<T>) => {
    const tagName = as ?? 'button'

    const handleClick = (e: JSX.TargetedMouseEvent<HTMLElement>) => {
        if (onClick) onClick(e)
        if (tagName === 'button') {
            lastClickedButton = e.currentTarget
            e.currentTarget?.blur()
        }
    }

    // Rendered via `h()` directly (rather than JSX with a variable tag name):
    // a dynamic intrinsic tag collapses `onClick`'s type into an intersection
    // of every element's handler under JSX, which no single handler satisfies.
    return h(tagName, { ...props, onClick: handleClick }, children)
}
