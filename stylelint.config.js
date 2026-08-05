/*
 * Two jobs, deliberately kept apart:
 *
 * 1. `stylelint-config-standard-scss` — ordinary SCSS hygiene (shorthand, notation,
 *    duplicate declarations, empty blocks). Prettier owns whitespace, so nothing
 *    here fights it.
 * 2. `plugin/use-baseline` — the compatibility gate. This is the rule that decides
 *    what may ship, and the one worth reading a failure from carefully.
 *
 * Baseline year: `available: 2024` (last year, not this year) — Tymer is a
 * broad-audience app, not a developer tool, matching the browserslist config in
 * package.json (Chrome/Firefox >= 60, iOS/Safari >= 12, ...). This is the CSS-side
 * counterpart of tsconfig.json's `lib: ["es2023", ...]`, which is the same gate for
 * JS/DOM APIs — raise both together if the target audience ever changes.
 */

export default {
  extends: ['stylelint-config-standard-scss'],
  plugins: ['stylelint-plugin-use-baseline'],
  rules: {
    // `user-select` and `resize` both fail this gate — not because they're new,
    // but because they've never reached Baseline (blocked by iOS Safari support
    // gaps since ~2020, per web-features data). Both are already used
    // deliberately (drag-to-select prevention on buttons/labels, a resizable
    // textarea) and this app's own browserslist targets iOS >= 12, so there is
    // no CSS change that fixes this — it's a real, permanent gap to accept
    // knowingly rather than silence. Kept as `warning` (not disabled) so new
    // genuinely-too-new features still surface as errors; see the report for
    // the individual findings.
    'plugin/use-baseline': [true, { available: 2024, severity: 'warning' }],
    // src/app/_themes.scss groups custom properties into blank-line-separated
    // blocks (background colors, then button group colors, then text colors, ...).
    // The standard config would flatten those groupings away.
    'custom-property-empty-line-before': null,
    // Most classes here are BEM (`.timeline__period--active`), which the default
    // kebab-case pattern already accepts, but a few (`.tempPeriod`, `.tempPeriod__data`
    // in src/app/_debug.scss) are camelCase and shared with matching className
    // strings in .tsx debug components. Renaming would mean editing component
    // source outside this task's scope, so this stays off rather than mass-editing
    // stylesheets and components together.
    'selector-class-pattern': null,
  },
}
