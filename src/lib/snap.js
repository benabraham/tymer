// Compute the delta needed to snap currentMs to the next multiple-of-3 minute boundary.
// This is UI input math (keyboard shortcuts only) — not timer logic.
export const getNextMultipleOf3Delta = ({ currentMs, direction }) => {
    const currentMinutes = Math.floor(currentMs / (60 * 1000))
    const onBoundary = currentMs % (3 * 60 * 1000) === 0
    const target =
        direction === 'up'
            ? Math.ceil((currentMinutes + 1) / 3) * 3
            : onBoundary
              ? currentMinutes - 3
              : Math.floor(currentMinutes / 3) * 3
    return target * 60 * 1000 - currentMs
}
