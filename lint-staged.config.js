/*
 * What `git commit` runs, over staged files only. Wired up in
 * .simple-git-hooks.js as `pnpm exec lint-staged`.
 *
 * Four invariants shape this file:
 *
 * 1. Prettier owns whitespace, in every language it can parse — including
 *    shell, via prettier-plugin-sh. biome.json sets `formatter.enabled: false`
 *    precisely so the two never fight, so inside a chain Biome (lint fixes and
 *    import sorting) runs FIRST and Prettier LAST. Stylelint is safe after
 *    Prettier for the same reason: stylelint 17 ships no stylistic rules, so
 *    stylelint.config.js is compatibility and hygiene only.
 *
 * 2. No two write-capable globs match the same file. lint-staged runs the
 *    chains for DIFFERENT globs CONCURRENTLY, so an overlap means two processes
 *    rewriting one file at once. Hence `.scss` and `.sh` are single stacked
 *    entries rather than falling out of a shared Prettier glob plus a linter
 *    one — and hence `tsc` sits at the END of the JS/TS chain instead of in a
 *    glob of its own, where it could read a file mid-write.
 *
 * 3. Only libraries are pinned here; system tools are assumed. Biome, Prettier,
 *    Stylelint, TypeScript and lint-staged itself resolve out of node_modules,
 *    ruff out of the build-tools/tts uv project — all at versions this repo
 *    pins. `uv` and `shellcheck` are expected to be on PATH, exactly as `node`
 *    and `pnpm` already are; flake.nix offers them, and so do apt, brew and
 *    every distro. The project does not install them and will not pretend to.
 *
 * 4. Nothing here is a second definition of anything. Each command is the same
 *    tool CI runs from package.json, just narrowed to the staged files.
 *
 * lint-staged appends the matched, shell-quoted filenames to every string
 * command. A FUNCTION that returns a string gets NO file list appended, which
 * is how a project-wide `tsc` runs from inside a per-file chain.
 */
export default {
    // `--no-errors-on-unmatched`: a commit can consist entirely of files Biome
    // excludes (src/lib/sound-manifest.ts and friends), which is not an error.
    // `tsc --noEmit` has no per-file mode — types are a whole-program property,
    // so a per-file invocation would be meaningless rather than merely slow.
    '*.{js,jsx,ts,tsx}': [
        'biome check --write --no-errors-on-unmatched',
        'prettier --write',
        () => 'tsc --noEmit',
    ],

    '*.json': ['biome check --write --no-errors-on-unmatched', 'prettier --write'],
    '*.scss': ['prettier --write', 'stylelint --fix'],
    '*.{css,md,yml,yaml,html}': ['prettier --write'],

    // Formatting is Prettier's (prettier-plugin-sh wraps mvdan/sh as WASM, so
    // there is no shfmt binary to install); correctness is shellcheck's. The
    // plugin's spaceRedirects is turned off in .prettierrc — on by default, it
    // would rewrite every `2>/dev/null` in the audio scripts to `2> /dev/null`.
    '*.{sh,bash}': ['prettier --write', 'shellcheck'],

    // All Python lives in build-tools/tts, whose uv project pins ruff — so this
    // is the ruff CI runs, with nothing installed globally. `--directory` moves
    // only uv's own cwd; lint-staged passes absolute paths, so the files resolve
    // regardless, and ruff still finds build-tools/tts/pyproject.toml by walking
    // up from each one. Formatter last, per ruff's own guidance.
    '*.py': [
        'uv run --directory build-tools/tts ruff check --fix',
        'uv run --directory build-tools/tts ruff format',
    ],
}
