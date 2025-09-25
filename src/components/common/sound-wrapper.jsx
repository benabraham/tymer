import { playSound } from '../../lib/sounds'

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
