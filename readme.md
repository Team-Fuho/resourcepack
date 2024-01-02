# `Team Fuho's texture pack`

## Roadmap
- [x] Bootstrap decals
- [x] DecalScript, easy, ease and clean
- [x] Pack n patches selector (Working)
- [ ] Props

## How does it work?
This repo, can be cloned directly into `.minecraft/resourcepack` with fully functional features. However, you 
need to setup first

Simple, just `pnpm i` (`npm install` is ok but break the git).(2) Then `node decals` to generate decal file. Reload the game. Add more decals, define into `decals.txt`, repeat step (2)

### 1. Decals
- First, add pictures into `decals/`, guides and schema written in `decals.txt`.
- Run `pnpm decals` to generate minecraft-compatible models apply to `minecraft:paper` item
- Open `explore.html` in browser. Please don't use IE :)

### 2. Blockbench
Still need to export manually, but you can reserve `bbmodel` files in source!

Comming soon

### 3. Patches
Comming soon

## To production
Just run `pnpm build` and it should be ready! zip and optimized.