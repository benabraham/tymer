// Pure functions for Periods list operations.
// Owns the index-shift formulas for inserting and removing items from the
// Timer's ordered Periods list while keeping currentPeriodIndex coherent.
// No imports from signals, storage, sounds, schedule, or timer — fully mockless in tests.

// Insert `period` at `atIndex` in `periods`, preserving the conceptual Current Period.
// The inserted period ends up AT atIndex; entries from atIndex onward shift right.
// If atIndex <= currentIndex, shifts currentIndex +1 so the same Period stays current.
// currentIndex === null → returned currentIndex is null (timer not yet started).
const insert = ({ periods, currentIndex, atIndex, period }) => {
    const newPeriods = [...periods]
    newPeriods.splice(atIndex, 0, period)

    let newCurrentIndex = currentIndex
    if (currentIndex !== null && atIndex <= currentIndex) {
        newCurrentIndex = currentIndex + 1
    }

    return { periods: newPeriods, currentIndex: newCurrentIndex }
}

// Insert `period` at `atIndex`, making the new period the Current Period.
// currentIndex is always set to atIndex regardless of the input currentIndex.
// Caller is responsible for ensuring this is only used when taking over the Current slot
// is the intended semantic (e.g. addPeriod's <60s branch in timer.js).
const insertMakingCurrent = ({ periods, currentIndex: _, atIndex, period }) => {
    const newPeriods = [...periods]
    newPeriods.splice(atIndex, 0, period)

    return { periods: newPeriods, currentIndex: atIndex }
}

// Remove the entry at `indexToRemove` from `periods`.
// If indexToRemove < currentIndex, shifts currentIndex -1.
// currentIndex === null → returned currentIndex is null.
// Precondition (NOT enforced — trust the caller): indexToRemove !== currentIndex.
// Removing the Current Period requires pre-navigation; that is the caller's responsibility.
const remove = ({ periods, currentIndex, indexToRemove }) => {
    const newPeriods = periods.filter((_, i) => i !== indexToRemove)

    let newCurrentIndex = currentIndex
    if (currentIndex !== null && indexToRemove < currentIndex) {
        newCurrentIndex = currentIndex - 1
    }

    return { periods: newPeriods, currentIndex: newCurrentIndex }
}

export const Periods = {
    insert,
    insertMakingCurrent,
    remove,
}
