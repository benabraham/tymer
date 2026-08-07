{
  description = "Tymer - Countdown timer web application";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
  };

  outputs = { self, nixpkgs }:
    let
      lib = nixpkgs.lib;

      # SSOT: the Node major comes from .nvmrc, which CI also reads via
      # actions/setup-node's `node-version-file`. One file to bump, and the Nix
      # shell can't silently drift from CI.
      #   .nvmrc "24" -> pkgs.nodejs_24
      nodeMajor = lib.removeSuffix "\n" (lib.fileContents ./.nvmrc);

      forAllSystems = f:
        lib.genAttrs lib.systems.flakeExposed
          (system: f nixpkgs.legacyPackages.${system});
    in
    {
      devShells = forAllSystems (pkgs:
        let
          # `sounds` — the TTS tool as a command, on PATH only inside this repo.
          #
          # The completion is what makes the packaging shape matter. direnv
          # replays environment VARIABLES; it cannot export a shell function or a
          # `complete` registration, so sourcing a completion file from .envrc
          # would define it in a subshell and lose it. What it can do is put a
          # directory on PATH — and bash-completion's dynamic loader (`complete
          # -D`) resolves an unknown command by deriving
          # <prefix>/share/bash-completion/completions/<cmd> from each PATH entry
          # ending in /bin. So a derivation carrying both halves gets its
          # completion loaded into the interactive shell on the first <TAB>, with
          # no shell config anywhere.
          #
          # Both halves are thin stubs pointing back at the checkout, so editing
          # sounds.py or the completion takes effect immediately — no flake
          # rebuild, no direnv reload.
          sounds = pkgs.runCommand "tymer-sounds" { } ''
            mkdir -p $out/bin $out/share/bash-completion/completions

            cat > $out/bin/sounds <<'WRAPPER'
            #!/usr/bin/env bash
            : "''${TYMER_ROOT:?not in the Tymer dev shell — cd into the repo so direnv can load it}"
            # So the tool's "Promote it: ..." hints say `sounds promote`, rather
            # than the uv invocation the user never typed.
            export TYMER_SOUNDS_LAUNCHER=sounds
            exec uv run --directory "$TYMER_ROOT/build-tools/tts" sounds.py "$@"
            WRAPPER
            chmod +x $out/bin/sounds

            cat > $out/share/bash-completion/completions/sounds <<'COMPLETION'
            # Loaded on the first `sounds <TAB>`; the real thing lives in the repo.
            [ -r "''${TYMER_ROOT:-}/build-tools/tts/completions/sounds.bash" ] &&
                . "$TYMER_ROOT/build-tools/tts/completions/sounds.bash"
            COMPLETION
          '';
        in
        {
        default = pkgs.mkShell {
          # `sounds`, resolved through TYMER_ROOT below. Not a runtime — a
          # convenience wrapper over what buildInputs already provides.
          packages = [ sounds ];

          # ONE way to get the four system tools this repo expects — not the
          # required one, and not a place to add project dependencies.
          #
          # The split is deliberate. Anything that is a library gets installed
          # BY the project and pinned by it: Biome, Prettier (+prettier-plugin-sh,
          # which is why there is no shfmt here), Stylelint, TypeScript,
          # lint-staged and simple-git-hooks from package.json; ruff from
          # build-tools/tts/pyproject.toml. Those never belong in this file —
          # duplicating them would mean two sources of truth for one version.
          #
          # What is left are runtimes and standalone binaries, which the project
          # is not entitled to install into anyone's system. nix develop is one
          # way to get them; nvm/corepack, apt, brew or a distro package are
          # equally fine, and CI uses none of them (see .github/workflows).
          # Versions stay in the neutral files both this shell and CI read:
          # .nvmrc for node, build-tools/tts/.python-version for the interpreter
          # uv provisions.
          buildInputs = [
            pkgs."nodejs_${nodeMajor}" # .nvmrc
            pkgs.pnpm # packageManager in package.json
            pkgs.uv # runs build-tools/tts, and so ruff and pytest
            pkgs.shellcheck # lints *.sh; the one tool with no npm equivalent
          ];

          shellHook = ''
            # Both halves of `sounds` are store stubs and cannot know where the
            # checkout is; this is how they find it. direnv captures it, so it
            # survives into the interactive shell where completion runs.
            export TYMER_ROOT="$PWD"

            echo "Tymer dev environment"
            echo "Node: $(node --version)"
            echo "pnpm: $(pnpm --version)"
          '';
        };
      });
    };
}
