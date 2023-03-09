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