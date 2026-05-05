import { createHash } from "node:crypto";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { copyFile } from "node:fs/promises";
import * as path from "node:path";
import sharp from "sharp";
import { buildExplorerHtml } from "./scripts/explore-template.ts";

// Ensure required directories exist
for (const dir of [
	"dist",
	"assets/decals/textures/item",
	"assets/decals/models",
]) {
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

type ExplorerEntry = {
	id: number;
	name: string;
	mode: string;
	texPath: string;
	x: number;
	y: number;
	s: number;
};
const explorable: ExplorerEntry[] = [];

const DECALS_DIR = "decals";
const POSTPROCESS_PATH = path.join(DECALS_DIR, "postprocess.txt");
const PBR_PATH = path.join(DECALS_DIR, "pbr.txt");

type PostprocessRule = { regexes: RegExp[]; size: number };

type PbrRule = {
	regexes: RegExp[];
	roughness: number;
	metalnessStr: string;
	ao: number;
	glowness: number;
};

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

const parsePbr = (raw: string): PbrRule[] =>
	raw
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line && !line.startsWith("#"))
		.map((line) => {
			const parts = line.split(/\s+/);
			if (parts.length < 5) return null;
			const glowness = Number.parseFloat(parts.pop() ?? "0");
			const ao = Number.parseFloat(parts.pop() ?? "0");
			const metalnessStr = parts.pop() ?? "0";
			const roughness = Number.parseFloat(parts.pop() ?? "0");
			const patterns = parts
				.join(" ")
				.split(",")
				.map((pattern) => pattern.trim())
				.filter(Boolean);
			if (!patterns.length) return null;
			return {
				regexes: patterns.map(globToRegex),
				roughness,
				metalnessStr,
				ao,
				glowness,
			};
		})
		.filter((rule): rule is PbrRule => Boolean(rule));

let postprocessRules: PostprocessRule[] = [];
try {
	const raw = await Bun.file(POSTPROCESS_PATH).text();
	postprocessRules = parsePostprocess(raw);
} catch {
	postprocessRules = [];
}

let pbrRules: PbrRule[] = [];
try {
	const raw = await Bun.file(PBR_PATH).text();
	pbrRules = parsePbr(raw);
} catch {
	pbrRules = [];
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

const matchPbrRule = (relPath: string, relNoExt: string): PbrRule | null => {
	for (const rule of pbrRules) {
		for (const regex of rule.regexes) {
			if (regex.test(relPath) || regex.test(relNoExt)) {
				return rule;
			}
		}
	}
	return null;
};

const generateSpecMapBuffer = async (rule: PbrRule): Promise<Buffer> => {
	// R: roughness (0-10) -> perceptualSmoothness -> linearRoughness
	let r = Math.round(255 * (1.0 - Math.sqrt(rule.roughness / 10.0)));
	if (r < 0) r = 0;
	if (r > 255) r = 255;
	if (rule.roughness === 0) r = 255;

	// G: metalness
	let g = 9; // default dielectric ~0.04
	const m = rule.metalnessStr.toLowerCase();
	const metals: Record<string, number> = {
		iron: 230,
		gold: 231,
		aluminum: 232,
		chrome: 233,
		copper: 234,
		lead: 235,
		platinum: 236,
		silver: 237,
	};
	if (metals[m] !== undefined) {
		g = metals[m];
	} else {
		const mNum = Number.parseFloat(m);
		if (!Number.isNaN(mNum)) {
			if (mNum > 0) g = 255; // Custom metal
			if (mNum === 0) g = 9; // Dielectric
		}
	}

	// B: Porosity / SSS
	const b = 0;

	// A: Emission
	let a = 255;
	if (rule.glowness > 0) {
		a = Math.round((rule.glowness / 10.0) * 254);
	}

	const raw = Buffer.from([r, g, b, a]);
	return await sharp(raw, {
		raw: { width: 1, height: 1, channels: 4 },
	})
		.png()
		.toBuffer();
};

const generateNormalMapBuffer = async (rule: PbrRule): Promise<Buffer> => {
	const r = 128;
	const g = 128;
	const b = Math.round((rule.ao / 10.0) * 255);
	const a = 255;

	const raw = Buffer.from([r, g, b, a]);
	return await sharp(raw, {
		raw: { width: 1, height: 1, channels: 4 },
	})
		.png()
		.toBuffer();
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
		const input = isTexture ? `${filePath} ${sign(filePath)}` : filePath;
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

	explorable.push({
		id: i,
		name,
		mode: resolvedMode,
		texPath: `assets/decals/textures/item/t${texKey}.png`,
		x,
		y,
		s,
	});

	// a:0=c a:1=t a:2=b a:3=l a:4=r a:5=tl a:6=tr a:7=bl a:8=br
	const alignmentOffsets = [
		{ a: 0, dx: 0, dy: 0 },
		{ a: 1, dx: 0, dy: 8 - 8 * s }, // t
		{ a: 2, dx: 0, dy: 8 * s - 8 }, // b
		{ a: 3, dx: 8 * s - 8, dy: 0 }, // l
		{ a: 4, dx: 8 - 8 * s, dy: 0 }, // r
		{ a: 5, dx: 8 * s - 8, dy: 8 - 8 * s }, // tl
		{ a: 6, dx: 8 - 8 * s, dy: 8 - 8 * s }, // tr
		{ a: 7, dx: 8 * s - 8, dy: 8 * s - 8 }, // bl
		{ a: 8, dx: 8 - 8 * s, dy: 8 * s - 8 }, // br
	];

	const parentMode = resolvedMode === mode.inbetween ? mode.fast : resolvedMode;
	const texRef = `decals:item/t${texKey}`;

	const makeDisplay = (dx: number, dy: number) => {
		// Base visual shifts
		const visual_x = -x * 32 + dx;
		const visual_y = y * 32 + dy;

		// fuho:f has geometry centered at (8,8) in model space; generated items
		// (fuho:d) are implicitly centered at origin. Compensate so both align.
		const geomOffset = resolvedMode === mode.fast ? -8 : 0;
		let tx = visual_x + geomOffset;
		let ty = visual_y + geomOffset;

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
		return add(
			iStr as string,
			name as string,
			modeKey as string,
			xStr as string,
			yStr as string,
			scaleStr as string,
		);
	})
	.sort((a, b) => a.threshold - b.threshold);

// Float abuse: id.a (e.g., 10001.0 for a=0, 10001.1 for a=1)
const rangeEntries: { threshold: number; model: unknown }[] = [];
for (const e of entries) {
	// a: 0=c, 1=t, 2=b, 3=l, 4=r, 5=tl, 6=tr, 7=bl, 8=br
	for (const { a, dx, dy } of e.alignmentOffsets) {
		const modelPath = vd(
			path.join("assets/decals/models/", `v${e.threshold}_${a}.json`),
		);
		const modelData: any = {
			parent: a === 0 ? `fuho:${e.parentMode}` : `decals:v${e.threshold}_0`,
		};
		if (a === 0) {
			modelData.textures = { layer0: e.texRef, particle: "fuho:item/noop" };
		}
		modelData.display = e.makeDisplay(dx, dy);

		Bun.write(modelPath, JSON.stringify(modelData));

		rangeEntries.push({
			// format as float
			threshold: e.threshold + a / 10,
			model: {
				type: "minecraft:model",
				model: `decals:v${e.threshold}_${a}`,
			},
		});
	}
}

Bun.write(
	paperItemPath,
	JSON.stringify({
		model: {
			type: "minecraft:range_dispatch",
			property: "minecraft:custom_model_data",
			fallback: { type: "minecraft:model", model: "minecraft:item/paper" },
			entries: rangeEntries,
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
Bun.write("explore.html", buildExplorerHtml(explorable));

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

	const copyOrResize = async (src: string, dst: string) => {
		if (!targetSize) {
			await copyFile(src, dst);
		} else {
			const input = Buffer.from(await Bun.file(src).arrayBuffer());
			const resized = await rescaleToLongEdge(input, targetSize);
			await Bun.write(dst, resized);
		}
	};

	const normalSource = sourcePath.replace(/\.png$/i, "_n.png");
	const specSource = sourcePath.replace(/\.png$/i, "_s.png");
	const normalDest = destPath.replace(/\.png$/i, "_n.png");
	const specDest = destPath.replace(/\.png$/i, "_s.png");

	if (existsSync(normalSource)) {
		await copyOrResize(normalSource, normalDest);
		lfs(`* ${normalSource}`)();
	}

	if (existsSync(specSource)) {
		await copyOrResize(specSource, specDest);
		lfs(`* ${specSource}`)();
	}

	const pbrRule = matchPbrRule(relPath, relNoExt);
	if (pbrRule) {
		if (!existsSync(specSource)) {
			const specBuf = await generateSpecMapBuffer(pbrRule);
			await Bun.write(specDest, specBuf);
			lfs(`* generated spec for ${sourcePath}`)();
		}
		if (!existsSync(normalSource) && pbrRule.ao > 0) {
			const normBuf = await generateNormalMapBuffer(pbrRule);
			await Bun.write(normalDest, normBuf);
			lfs(`* generated normal for ${sourcePath}`)();
		}
	}

	await copyOrResize(sourcePath, destPath);
	lfs(`* ${sourcePath}`)();
}
