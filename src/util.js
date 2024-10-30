export const log = (text, variable, variant = 0, border = false) => {
  // check if variant is a number and within range and default to 0 if not
  const variantColors = [
    { color: 'black', background: 'white' },
    { color: 'white', background: 'black' },
    { color: 'white', background: 'darkred' },
    { color: 'white', background: 'green' },
    { color: 'white', background: 'blue' },
    { color: 'white', background: 'maroon' },
    { color: 'white', background: 'purple' },
    { color: 'white', background: 'olive' },
    { color: 'white', background: 'navy' },
    { color: 'white', background: 'teal' },
    { color: 'black', background: 'orange' },
    { color: 'black', background: 'gray' },
    { color: 'black', background: 'skyblue' },
    { color: 'black', background: 'goldenrod' },
    { color: 'black', background: 'silver' },
  ]

  if (typeof variant !== 'number' || variant < 0 || variant > variantColors.length - 1) variant = 0

  console.log(
    `%c${text.padStart(25, ' ')}`,
    `
      color: ${variantColors[variant].color};
      background-color: ${variantColors[variant].background};
      padding: 4px 4px;
      font-weight: bold;
      ${border ? `border: 2px solid ${variantColors[variant].color};` : ''}
      `,
    `      now: ${new Date(Date.now()).toLocaleTimeString('cs-CZ', { second: "2-digit", fractionalSecondDigits: 2 })}`,
    `  started: ${variable.timestampStarted === null ? null : new Date(variable.timestampStarted).toLocaleTimeString('cs-CZ', { second: "2-digit", fractionalSecondDigits: 2 })}`,
    `   paused: ${variable.timestampPaused === null ? null : new Date(variable.timestampPaused).toLocaleTimeString('cs-CZ', { second: "2-digit", fractionalSecondDigits: 2 })}`,
  )

  console.table(variable.periods)
}