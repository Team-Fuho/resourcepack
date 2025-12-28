all: init decals
init:
	bun install
	mkdir -p assets/decals/models
	mkdir -p assets/decals/textures
clean:
	rm assets/decals/*/* -rvf
decals:
	bun run decals
build:
	bun scripts/pack.ts full
patch:
	bun scripts/pack.ts patch
dev:
	bun scripts/pack.ts pdev
mkdbg:
	mkdir -p dist
	esbuild decals.js --platform=node --target=node12.16 --bundle --minify --charset=utf8 --format=cjs > decals.min.js
	nexe decals.min.js -t 12.16.3 --cwd . -o decals.exe
