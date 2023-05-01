all: init decals
init:
	pnpm i
	mkdir -p assets/decals
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
	esbuild decals.js --platform=node --bundle --minify > decals.min.js
	nexe decals.min.js --bundle -t 12.16.3 --cwd .
	rm decals.min.js
