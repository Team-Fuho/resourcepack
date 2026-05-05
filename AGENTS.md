# Repository Guidelines

## Project Structure & Module Organization
This repository contains both a Minecraft Java resource pack and the tooling that generates distributable builds.
- `assets/`: pack assets (`minecraft/`, `fuho/`) plus generated decal artifacts in `assets/decals/`.
- `decals/`: source images and decal config (`decals.txt`, `postprocess.txt`).
- `scripts/`: Bun/TypeScript build scripts (`pack.ts`, `mmeta.ts`) and helper scripts.
- `patches/`: optional patch packs (`0.props`, `1.tweaks`) included by the pack pipeline.
- `dist/`: build output (`*.zip`, metadata, staged pack folders).
- `.github/workflows/build.yml`: CI build, Pages artifact generation, and release asset upload.

## Build, Test, and Development Commands
- `bun install --frozen-lockfile`: install dependencies exactly from `bun.lockb`.
- `bun run decals`: regenerate decal model/data output from `decals/` inputs.
- `bun run build`: clean generated decals, rebuild pack artifacts, and refresh metadata.
- `bun run pack` / `bun run pack:full` / `bun run pack:dev`: run pack assembler modes.
- `bun run fmt`: format/lint with Biome (`biome check . --write`).
- `make release`: run full release flow using `packsquash` and produce optimized `dist/` assets.

## Coding Style & Naming Conventions
- Follow `.editorconfig`: 2-space indentation for `*.js` and `*.json`, LF endings.
- TypeScript is `strict` (see `tsconfig.json`); preserve explicit, typed script logic.
- Use Biome as the canonical formatter/linter (`biome.json`), and do not hand-format around it.
- Keep filenames descriptive and aligned to current patterns (`pack.ts`, `mmeta.ts`, patch folders like `N.name`).

## Testing Guidelines
No dedicated unit-test framework is configured in this repository today. Validate changes by:
- running `bun run build` locally,
- checking generated artifacts in `dist/`,
- opening `explore.html` for decal/asset preview when relevant.

## Commit & Pull Request Guidelines
Recent history favors short, imperative subjects, often with prefixes: `feat:`, `fix:`, `chore:`, `hotfix:`, `release:`. Continue that style.
- Keep commits focused and scoped to one change.
- PRs should include: what changed, why, impacted assets/scripts, and local validation steps.
- For visual/resource changes, include before/after screenshots (or equivalent preview evidence).
