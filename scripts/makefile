all: init decals
init:
	pnpm i
	mkdir -p assets/decals/models
	mkdir -p assets/decals/textures
clean:
	rm assets/decals/*/* -rvf
decals:
	node decals
build:
	pnpm gulp default
patch:
	pnpm gulp patch
dev:
	pnpm gulp pdev
mkdbg:
	mkdir -p dist
	esbuild decals.js --platform=node --target=node12.16 --bundle --minify --charset=utf8 --format=cjs > decals.min.js
	nexe decals.min.js -t 12.16.3 --cwd . -o decals.exe