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
          buildInputs = [
            pkgs."nodejs_${nodeMajor}"
            pkgs.pnpm
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
