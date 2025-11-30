import { playSound } from '../../lib/sounds'

// Track last clicked button globally
let lastClickedButton = null

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

export const SoundWrapper = ({
    onClick,
    onChange,
    onBlur,
    children,
    as = 'button',
    playOnClick = false,
    playOnChange = false,
    playOnBlur = false,
    ...props
}) => {
    const Component = as

    const handleClick = async e => {
        if (playOnClick) await playSound('button')
        if (onClick) onClick(e)
        if (as === 'button') {
            lastClickedButton = e.currentTarget
            e.currentTarget?.blur()
        }
    }

    const handleChange = async e => {
        if (playOnChange) await playSound('button')
        if (onChange) onChange(e)
    }

    const handleBlur = async e => {
        if (playOnBlur) await playSound('button')
        if (onBlur) onBlur(e)
    }

    return (
        <Component {...props} onClick={handleClick} onChange={handleChange} onBlur={handleBlur}>
            {children}
        </Component>
    )
}
