type TimerStateLike = { timestampStarted: number | null; timestampPaused: number | null }

const isTimerStateLike = (value: unknown): value is TimerStateLike =>
    typeof value === 'object'
    && value !== null
    && 'timestampStarted' in value
    && 'timestampPaused' in value

export const log = (
    text: string,
    variable: unknown,
    variant: number = 0,
    border: boolean = false,
): void => {
    // check if variant is a number and within range and default to 0 if not
    const variantColors = [
        { color: 'black', background: 'white' }, // 0
        { color: 'white', background: 'black' }, // 1
        { color: 'white', background: 'darkred' }, // 2
        { color: 'white', background: 'green' }, // 3
        { color: 'white', background: 'blue' }, // 4
        { color: 'white', background: 'maroon' }, // 5
        { color: 'white', background: 'purple' }, // 6
        { color: 'white', background: 'olive' }, // 7
        { color: 'white', background: 'navy' }, // 8
        { color: 'white', background: 'teal' }, // 9
        { color: 'black', background: 'orange' }, // 10
        { color: 'black', background: 'gray' }, // 11
        { color: 'black', background: 'skyblue' }, // 12
        { color: 'black', background: 'goldenrod' }, // 13
        { color: 'black', background: 'silver' }, // 14
    ]

    const safeVariant =
        typeof variant !== 'number' || variant < 0 || variant > variantColors.length - 1
            ? 0
            : variant

    // Check if variable is a timer state object (has timestampStarted and timestampPaused properties)
    if (isTimerStateLike(variable)) {
        console.log(
            `%c${text.padStart(25, ' ')}`,
            `
          color: ${variantColors[safeVariant].color};
          background-color: ${variantColors[safeVariant].background};
          padding: 4px;
          font-weight: bold;
          ${border ? `border: 2px solid ${variantColors[safeVariant].color};` : ''}
          `,
            `      now: ${new Date(Date.now()).toLocaleTimeString('cs-CZ', { second: '2-digit', fractionalSecondDigits: 2 })}`,
            `  started: ${variable.timestampStarted === null ? null : new Date(variable.timestampStarted).toLocaleTimeString('cs-CZ', { second: '2-digit', fractionalSecondDigits: 2 })}`,
            `   paused: ${variable.timestampPaused === null ? null : new Date(variable.timestampPaused).toLocaleTimeString('cs-CZ', { second: '2-digit', fractionalSecondDigits: 2 })}`,
        )
    } else {
        console.log(
            `%c${text.padStart(25, ' ')}`,
            `
          color: ${variantColors[safeVariant].color};
          background-color: ${variantColors[safeVariant].background};
          padding: 4px;
          font-weight: bold;
          ${border ? `border: 2px solid ${variantColors[safeVariant].color};` : ''}
          `,
            variable,
        )
    }
    // console.table(variable.periods)
}
