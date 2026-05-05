import { createHash } from "node:crypto";
import { mkdirSync, statSync } from "node:fs";
import { copyFile } from "node:fs/promises";
import * as path from "node:path";
import sharp from "sharp";

// Ensure required directories exist
for (const dir of ["dist", "assets/decals/textures/item"]) {
	mkdirSync(dir, { recursive: true });
}

// Logging utilities
const vd = <T>(a: T): T => (console.log(a), a);
const lfs =
	(...prefix: any[]) =>
	(...suffix: any[]): void =>
		prefix[0] && console.log(...prefix, ...suffix);

// Texture mappings
const textures: Record<string, string> = {};
const explorable: string[] = [
	`<h1>Team Fuho's decal explorer</h1>
Invisible item_frame: <span class=ip>minecraft:give @p item_frame{EntityTag:{Invisible:1}}</span>
<span class=ip>minecraft:give @p item_frame[entity_data={id:"minecraft:item_frame",Invisible:true}] 1</span>
<link rel="stylesheet" type="text/css" href="explore.css" />
<div class=expl_gr>`.replace("\n", "<br>"),
];

const DECALS_DIR = "decals";
const POSTPROCESS_PATH = path.join(DECALS_DIR, "postprocess.txt");

type PostprocessRule = { regexes: RegExp[]; size: number };

const globToRegex = (pattern: string): RegExp => {
	const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
	const regex = `^${escaped.replace(/\*/g, "[^/]*")}$`;
	return new RegExp(regex);
};

const parsePostprocess = (raw: string): PostprocessRule[] =>
	raw
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line && !line.startsWith("#"))
		.map((line) => {
			const parts = line.split(/\s+/);
			if (parts.length < 2) return null;
			const sizeRaw = parts.pop();
			const size = Number.parseInt(sizeRaw ?? "", 10);
			if (!Number.isFinite(size) || size <= 0) return null;
			const patterns = parts
				.join(" ")
				.split(",")
				.map((pattern) => pattern.trim())
				.filter(Boolean);
			if (!patterns.length) return null;
			return { regexes: patterns.map(globToRegex), size };
		})
		.filter((rule): rule is PostprocessRule => Boolean(rule));

let postprocessRules: PostprocessRule[] = [];
try {
	const raw = await Bun.file(POSTPROCESS_PATH).text();
	postprocessRules = parsePostprocess(raw);
} catch {
	postprocessRules = [];
}

const matchPostprocessSize = (
	relPath: string,
	relNoExt: string,
): number | null => {
	for (const rule of postprocessRules) {
		for (const regex of rule.regexes) {
			if (regex.test(relPath) || regex.test(relNoExt)) {
				return rule.size;
			}
		}
	}
	return null;
};

const rescaleToLongEdge = async (
	input: Buffer,
	targetSize: number,
): Promise<Buffer> => {
	const image = sharp(input, { limitInputPixels: false });
	const meta = await image.metadata();
	if (!meta.width || !meta.height) return input;
	if (Math.max(meta.width, meta.height) === targetSize) return input;

	return await image
		.resize(targetSize, targetSize, { fit: "inside" })
		.png({ compressionLevel: 8, progressive: false })
		.toBuffer();
};

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
	createHash("sha1")
		.update(text)
		.digest("base64url")
		.slice(0, 12)
		.toLowerCase();

// Generate hash-based key and memoize
const makeHasher =
	(isTexture: boolean) =>
	(filePath: string): string => {
		if (textures[filePath]) return textures[filePath];
		const input = isTexture
			? `${filePath} ${sign(filePath)}`
			: filePath;
		const result = hash(input);
		textures[filePath] = result;
		return result;
	};

const mode = {
	fast: "f",
	default: "d",
	inbetween: "i",
} as const;

const tex = makeHasher(true);
const parseDecalLine = (line: string) => {
	const [iStr, name, modeKey, xStr, yStr, scaleStr] = line.split(/\s+/);
	if (!scaleStr) {
		throw new Error(`Invalid decal line: "${line}"`);
	}
	return { iStr, name, modeKey, xStr, yStr, scaleStr };
};

// Add a decal entry
function add(
	iStr: string,
	name: string,
	modeKey: string,
	xStr: string,
	yStr: string,
	scaleStr: string,
) {
	const i = Number.parseInt(iStr, 10);
	const resolvedMode = mode[modeKey as keyof typeof mode] ?? mode.fast;
	const x = Number.parseFloat(xStr);
	const y = Number.parseFloat(yStr);
	const s = Number.parseFloat(scaleStr);

	const texKey = tex(path.join("decals/", `${name}.png`));

	explorable.push(
		`<div class=expl_i>
<b><code>${i} ${name}</code> ${resolvedMode}</b> <span class=ip>minecraft:give @p paper[custom_data={n:${i}}]</span>
<div class=expl_bg><img src=assets/decals/textures/item/t${texKey}.png class=${resolvedMode} style=--x:${-x};--y:${-y};--s:${s}></div>
</div>`,
	);

	// a:0=c a:1=t a:2=b a:3=l a:4=r a:5=tl a:6=tr a:7=bl a:8=br
	const alignmentOffsets = [
		{ a: 0, dx: 0,          dy: 0 },         // c
		{ a: 1, dx: 0,          dy: 8 - 8 * s }, // t
		{ a: 2, dx: 0,          dy: 8 * s - 8 }, // b
		{ a: 3, dx: 8 - 8 * s, dy: 0 },         // l
		{ a: 4, dx: 8 * s - 8, dy: 0 },         // r
		{ a: 5, dx: 8 - 8 * s, dy: 8 - 8 * s }, // tl
		{ a: 6, dx: 8 * s - 8, dy: 8 - 8 * s }, // tr
		{ a: 7, dx: 8 - 8 * s, dy: 8 * s - 8 }, // bl
		{ a: 8, dx: 8 * s - 8, dy: 8 * s - 8 }, // br
	];

	const parentMode = resolvedMode === mode.inbetween ? mode.fast : resolvedMode;
	const texRef = `decals:item/t${texKey}`;

	const makeDisplay = (dx: number, dy: number) => {
		let tx = x * 32 + dx;
		let ty = y * 32 + dy;
		if (resolvedMode === mode.inbetween) {
			tx += 8 / s;
			ty += 8 / s;
		}
			const tf = {
			translation: [tx, ty, -0.03],
			scale: Array(3).fill(s * 2),
			...(resolvedMode === "d" ? { rotation: [0, 180, 0] } : {}),
		};
		return { head: tf, fixed: tf };
	};

	lfs()();
	return { threshold: i, texRef, parentMode, alignmentOffsets, makeDisplay };
}

// Create item model resources
const paperItemPath = vd(path.join("assets/minecraft/items/paper.json"));
const paperModelPath = vd(path.join("assets/minecraft/models/item/paper.json"));
const entries = df
	.map((line) => {
		const { iStr, name, modeKey, xStr, yStr, scaleStr } = parseDecalLine(line);
		return add(iStr!, name!, modeKey!, xStr!, yStr!, scaleStr!);
	})
	.sort((a, b) => a.threshold - b.threshold);

// Flat cases: one entry per (decal × alignment), keyed by SNBT compound {n:<id>,a:<idx>}
const customDataCases: { when: string; model: unknown }[] = [];
for (const e of entries) {
	for (const { a, dx, dy } of e.alignmentOffsets) {
		customDataCases.push({
			when: `{n:${e.threshold},a:${a}}`,
			model: {
				type: "minecraft:model",
				model: `fuho:${e.parentMode}`,
				textures: { layer0: e.texRef },
				display: e.makeDisplay(dx, dy),
			},
		});
	}
}

// Backward-compat: range_dispatch on custom_model_data (center only)
const rangeEntries = entries.map((e) => ({
	threshold: e.threshold,
	model: {
		type: "minecraft:model",
		model: `fuho:${e.parentMode}`,
		textures: { layer0: e.texRef },
		display: e.makeDisplay(0, 0),
	},
}));

Bun.write(
	paperItemPath,
	JSON.stringify({
		model: {
			type: "minecraft:select",
			property: "minecraft:custom_data",
			cases: customDataCases,
			fallback: {
				type: "minecraft:range_dispatch",
				property: "minecraft:custom_model_data",
				fallback: { type: "minecraft:model", model: "minecraft:item/paper" },
				entries: rangeEntries,
			},
		},
	}),
);

/*
Bun.write(
	paperModelPath,
	JSON.stringify({
		parent: "minecraft:item/generated",
		textures: { layer0: "minecraft:item/paper" },
	}),
);
*/

lfs()();

// Generate explorer HTML
Bun.write("explore.html", [...explorable, "</div>"].join("\n"));

// Copy texture files

for (const i of Object.entries(textures)) {
	const [sourcePath, hashId] = i;
	if (!sourcePath || !hashId) continue;
	const destPath = vd(
		path.join("assets/decals/textures/", `item/t${hashId}.png`),
	);
	const relPath = path
		.relative(DECALS_DIR, sourcePath)
		.replaceAll(path.sep, "/");
	const relNoExt = relPath.replace(/\.png$/i, "");
	const targetSize = matchPostprocessSize(relPath, relNoExt);
	if (!targetSize) {
		await copyFile(sourcePath, destPath);
		lfs(`* ${sourcePath}`)();
		continue;
	}
	const input = Buffer.from(await Bun.file(sourcePath).arrayBuffer());
	const resized = await rescaleToLongEdge(input, targetSize);
	await Bun.write(destPath, resized);
	lfs(`* ${sourcePath}`)();
}
