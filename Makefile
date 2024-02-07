PACKSQUASH_VER = 0.4.0

all: clean release
preview: dist/tfh.base.zip on/finish
release: dist/tfh_dist.zip

node_modules:
	pnpm i -d
dist/packsquash:
	sh scripts/getsquash
dist/tfh.base.zip: node_modules
	pnpm build
dist/tfh_dist.zip: dist/packsquash dist/tfh.base.zip
	dist/packsquash packsquash.toml
on/finish:
	@[ -f trigger_finish.sh ] && sh trigger_finish.sh
clean:
	rm -rvf \
		node_modules \
		dist \
		assets/decals \
		assets/minecraft/models/item/paper.json
