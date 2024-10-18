# `Team Fuho's texture pack`

## Roadmap

- [x] Bootstrap decals
- [x] DecalScript, easy, ease and clean
- [x] Pack n patches selector (Working)
- [ ] Props

## How does it work?

This repo, can be cloned directly into `.minecraft/resourcepack` with fully
functional features, still, you need some extra setup.

To preview ingame, or through explorer, you likely don't have to install any
dependencies. Simply have Deno installed and run the `decals.bat`. **`F3` +
`T`** to reload anything in game.

### 1. Decals

- First, add pictures into `decals/`, guides and schema written in `decals.txt`.
- Run `deno run decals.ts` to generate minecraft-compatible models apply to
  `minecraft:paper` item
- Open `explore.html` in browser. Please don't use IE :)

### 2. Blockbench

Still need to export manually, but you can reserve `bbmodel` files in source!

Comming soon

### 3. Patches

Desc: You have multiple minipacks to choose, though all of them should be
installed through a browser-based selector

Comming soon

## To production

Just run `deno run build.ts` and it should be ready! zip and optimized.

Anyways we use `webhookd` to trigger the build and force update through
pterodactyl api btw. Example in our whitespace!

## Caveats

- `default` object size won't bigger than `2` (in decalfile) or `4` in json file
- Natural transformation of `head` and `fixed` may differ ingame
- `fast` object slightly bigger than `default` in some case
- ~~`fast` flicker due to float percision of the renderer~~. This may differ
  across renderers.
