import { createHash } from "node:crypto";
import { copyFile, mkdirSync, statSync } from "node:fs";
import * as path from "node:path";

// Ensure required directories exist
for (const dir of [
	"dist",
	"assets/decals/models",
	"assets/decals/textures/item",
]) {
	mkdirSync(dir, { recursive: true });
}

// Logging utilities
const vd = <T>(a: T): T => (console.log(a), a);
const lfs =
	(...prefix: any[]) =>
	(...suffix: any[]): void =>
		prefix[0] && console.log(...prefix, ...suffix);

// Model and texture mappings
const textures: Record<string, string> = {};
const models: Record<string, string> = {};
const explorable: string[] = [
	`<h1>Team Fuho's decal explorer</h1>
Invisible item_frame: <span class=ip>minecraft:give @p item_frame{EntityTag:{Invisible:1}}</span>
<span class=ip>minecraft:give @p item_frame[entity_data={id:"minecraft:item_frame",Invisible:true}] 1</span>
<link rel="stylesheet" type="text/css" href="explore.css" />
<div class=expl_gr>`.replace("\n", "<br>"),
];

// Read and process decals
const rawDecalText = await Bun.file("decals/decals.txt").text();
const df = rawDecalText
	.split("\n")
	.map((line) => line.trim())
	.filter((line) => line && !line.startsWith("#"));

// Sign and hash helpers
function sign(filePath: string): string {
	const { mtime, size } = statSync(filePath);
	return `${mtime} ${size}`;
}

const hash = (text: string): string =>
	createHash("sha1").update(text).digest("base64url").slice(0, 12).toLowerCase();

// Generate hash-based key and memoize
const makeHasher =
	(isTexture: boolean) =>
	(filePath: string, metadata?: unknown): string => {
		const store = isTexture ? textures : models;
		if (store[filePath]) return store[filePath];
		const input = isTexture
			? `${filePath} ${sign(filePath)}`
			: [filePath, metadata ?? []].flat().join();
		const result = hash(input);
		store[filePath] = result;
		return result;
	};

const mode = {
	fast: "f",
	default: "d",
} as const;

const tex = makeHasher(true);
const mod = makeHasher(false);

// Add a decal entry
function add(
	iStr: string,
	name: string,
	modeKey: string,
	xStr: string,
	yStr: string,
	scaleStr: string,
): { predicate: { custom_model_data: number }; model: string } {
	const i = Number.parseInt(iStr, 10);
	const resolvedMode = mode[modeKey as keyof typeof mode] ?? mode.fast;
	const x = Number.parseFloat(xStr);
	const y = Number.parseFloat(yStr);
	const s = Number.parseFloat(scaleStr);

	const modelKey = `m${i}_${mod(name, [name, resolvedMode, x, y, s])}`;
	const modelPath = vd(path.join("assets/decals/models/", `${modelKey}.json`));
	const texKey = tex(path.join("decals/", `${name}.png`));

	explorable.push(
		`<div class=expl_i>
<b><code>${i} ${name}</code> ${resolvedMode}</b> <span class=ip>minecraft:give @p paper{CustomModelData:${i}}</span><span class=ip>minecraft:give @p paper[custom_model_data=${i}]</span>
<div class=expl_bg><img src=assets/decals/textures/item/t${texKey}.png class=${resolvedMode} style=--x:${-x};--y:${-y};--s:${s}></div>
</div>`,
	);

	const gentf = (slot: string) => ({
		translation: [x * 32, y * 32, -0.03],
		scale: Array(3).fill(s * (resolvedMode === mode.default ? 2 : 1)),
		rotation: resolvedMode === "d" ? [0, 180, 0] : undefined,
	});

	Bun.write(
		modelPath,
		JSON.stringify({
			parent: `fuho:${resolvedMode}`,
			textures: {
				[resolvedMode === mode.default ? "layer0" : "0"]:
					`decals:item/t${texKey}`,
			},
			display: {
				head: gentf("head"),
				fixed: gentf("frame"),
			},
		}),
	);

	lfs()();
	return {
		predicate: { custom_model_data: i },
		model: `decals:${modelKey}`,
	};
}

// Create main item override model file
const paperPath = vd(path.join("assets/minecraft/models/item/paper.json"));
Bun.write(
	paperPath,
	JSON.stringify({
		parent: "minecraft:item/generated",
		textures: {
			layer0: "minecraft:item/paper",
		},
		overrides: df.map((line) =>
			// @ts-ignore
			add(...line.split(" ")),
		),
	}),
);

lfs()();

// Generate explorer HTML
Bun.write("explore.html", [...explorable, "</div>"].join("\n"));

// Copy texture files

for (const i of Object.entries(textures)) {
	const [sourcePath, hashId] = i;
	if (!sourcePath || !hashId) continue;
	copyFile(
		sourcePath,
		vd(path.join("assets/decals/textures/", `item/t${hashId}.png`)),
		() => {},
	);
	lfs(`* ${sourcePath}`)();
}
