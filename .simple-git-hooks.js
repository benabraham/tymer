/*
 * Git hooks. Installed by the `prepare` script, which pnpm runs after every
 * install — so cloning and running `pnpm install` is all it takes to get the
 * hook, with no separate bootstrap step to forget.
 *
 * The hook body is deliberately a one-liner: what actually runs lives in
 * lint-staged.config.js, so changing the checks never means reinstalling hooks.
 * (simple-git-hooks writes the body into .git/hooks/pre-commit verbatim at
 * install time — a multi-line pipeline here would go stale in every clone that
 * installed before the edit.)
 *
 * Escape hatches:
 *   git commit --no-verify        skip the checks for one commit
 *   SKIP_INSTALL_SIMPLE_GIT_HOOKS=1 pnpm install
 *                                 install deps without (re)writing .git/hooks
 */
export default {
    'pre-commit': 'pnpm exec lint-staged',
}
