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
      devShells = forAllSystems (pkgs: {
        default = pkgs.mkShell {
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
            echo "Tymer dev environment"
            echo "Node: $(node --version)"
            echo "pnpm: $(pnpm --version)"
          '';
        };
      });
    };
}
