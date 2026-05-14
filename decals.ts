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
	"assets/fuho/models",
]) {
	mkdirSync(dir, { recursive: true });
}

// Shell generation
async function generateShell(
	name: string,
	size: number,
	slices = 8,
	zStart = 0,
) {
	const modelSize = Math.min(size, 48);
	const halfSize = modelSize / 2;
	const fromX = 8 - halfSize;
	const toX = 8 + halfSize;
	const fromY = 8 - halfSize;
	const toY = 8 + halfSize;

	const elements = [];
	for (let i = 0; i < slices; i++) {
		const z = zStart + i / slices;
		elements.push({
			from: [fromX, fromY, z],
			to: [toX, toY, z],
			faces: {
				north: { uv: [0, 0, 16, 16], texture: "#layer0" },
				south: { uv: [16, 0, 0, 16], texture: "#layer1" },
			},
		});
	}

	const model = {
		credit: `fuho:${name} — shell: ${slices} slices, double-faced`,
		textures: { layer0: "fuho:item/noop", layer1: "#layer0" },
		gui_light: "front",
		elements,
		display: {
			thirdperson_righthand: {
				rotation: [68, 0, 0],
				translation: [-6, 0, 0],
				scale: [0.5, 0.5, 0.5],
			},
			thirdperson_lefthand: {
				rotation: [68, 0, 0],
				translation: [-6, 0, 0],
				scale: [0.5, 0.5, 0.5],
			},
			firstperson_righthand: {
				rotation: [0, 180, 0],
				translation: [0, 8, 0],
				scale: [0.25, 0.25, 1],
			},
			firstperson_lefthand: {
				rotation: [0, -180, 0],
				translation: [0, 8, 0],
				scale: [0.25, 0.25, 1],
			},
			gui: { rotation: [0, -180, 0], scale: [0.5, 0.5, 0.5] },
			head: { translation: [0, 0, -6.5], scale: [0.5, 0.5, 1] },
			fixed: { translation: [0, 0, -0.01] },
		},
	};
	await Bun.write(
		`assets/fuho/models/${name}.json`,
		JSON.stringify(model, null, 2),
	);
}

const SHEET_SCALES = 4;
const SHEET_BASE_SCALE = 16;
const SHELL_QUALITY = 16;
const ALIGNMENT_VARIANTS = false;

for (let i = 1; i <= SHEET_SCALES; i++) {
	const scale = 2 ** (i - 1);
	await generateShell(`f${i}`, SHEET_BASE_SCALE * scale, 1, 8);
	await generateShell(`f${i}s`, SHEET_BASE_SCALE * scale, SHELL_QUALITY, 7);
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

type PostprocessRule = {
	regexes: RegExp[];
	size: number;
	fit: boolean;
	nearest: boolean;
	alphaBoolean: boolean;
	stretch: boolean;
};

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
			const sizeRaw = parts.pop() ?? "";
			const alphaBoolean = sizeRaw.endsWith("a");
			const strippedA = alphaBoolean ? sizeRaw.slice(0, -1) : sizeRaw;
			const nearest = strippedA.endsWith("n");
			const strippedN = nearest ? strippedA.slice(0, -1) : strippedA;
			const stretch = strippedN.endsWith("s");
			const strippedS = stretch ? strippedN.slice(0, -1) : strippedN;
			const fit = strippedS.endsWith("f");
			const size = Number.parseInt(strippedS, 10);
			if (!Number.isFinite(size) || size <= 0) return null;
			const patterns = parts
				.join(" ")
				.split(",")
				.map((pattern) => pattern.trim())
				.filter(Boolean);
			if (!patterns.length) return null;
			return {
				regexes: patterns.map(globToRegex),
				size,
				fit,
				nearest,
				alphaBoolean,
				stretch,
			};
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

const matchPostprocessRule = (
	relPath: string,
	relNoExt: string,
): PostprocessRule | null => {
	for (const rule of postprocessRules) {
		for (const regex of rule.regexes) {
			if (regex.test(relPath) || regex.test(relNoExt)) {
				return rule;
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

const rescaleFit = async (
	input: Buffer,
	targetSize: number,
	nearest = false,
	alphaBoolean = false,
): Promise<Buffer> => {
	const image = sharp(input, { limitInputPixels: false });
	const meta = await image.metadata();
	if (!meta.width || !meta.height) return input;
	if (meta.width === targetSize && meta.height === targetSize && !alphaBoolean)
		return input;

	let pipe = image;
	if (meta.width !== targetSize || meta.height !== targetSize) {
		pipe = pipe.resize(targetSize, targetSize, {
			fit: "contain",
			background: { r: 0, g: 0, b: 0, alpha: 0 },
			kernel: nearest ? "nearest" : "lanczos3",
		});
	}
	let result = await pipe
		.png({ compressionLevel: 8, progressive: false })
		.toBuffer();
	if (alphaBoolean) {
		const raw = await sharp(result)
			.ensureAlpha()
			.raw()
			.toBuffer({ resolveWithObject: true });
		for (let i = 3; i < raw.data.length; i += 4) {
			raw.data[i] = raw.data[i] < 128 ? 0 : 255;
		}
		result = await sharp(raw.data, {
			raw: {
				width: raw.info.width,
				height: raw.info.height,
				channels: raw.info.channels,
			},
		})
			.png({ compressionLevel: 8, progressive: false })
			.toBuffer();
	}
	return result;
};

const rescaleStretch = async (
	input: Buffer,
	targetSize: number,
	nearest = false,
	alphaBoolean = false,
): Promise<Buffer> => {
	const image = sharp(input, { limitInputPixels: false });
	const meta = await image.metadata();
	if (!meta.width || !meta.height) return input;
	if (meta.width === targetSize && meta.height === targetSize && !alphaBoolean)
		return input;

	let pipe = image;
	if (meta.width !== targetSize || meta.height !== targetSize) {
		pipe = pipe.resize(targetSize, targetSize, {
			fit: "fill",
			kernel: nearest ? "nearest" : "lanczos3",
		});
	}
	let result = await pipe
		.png({ compressionLevel: 8, progressive: false })
		.toBuffer();
	if (alphaBoolean) {
		const raw = await sharp(result)
			.ensureAlpha()
			.raw()
			.toBuffer({ resolveWithObject: true });
		for (let i = 3; i < raw.data.length; i += 4) {
			raw.data[i] = raw.data[i] < 128 ? 0 : 255;
		}
		result = await sharp(raw.data, {
			raw: {
				width: raw.info.width,
				height: raw.info.height,
				channels: raw.info.channels,
			},
		})
			.png({ compressionLevel: 8, progressive: false })
			.toBuffer();
	}
	return result;
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
	createHash("sha1").update(text).digest("base64url").slice(0, 12).toLowerCase();

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
	shell: "s",
} as const;

const tex = makeHasher(true);
const parseDecalLine = (line: string) => {
	const parts = line.split(/\s+/);
	if (parts.length < 6) {
		throw new Error(`Invalid decal line: "${line}"`);
	}
	let depthScaleStr: string | undefined;
	let stencilRef: string | undefined;
	if (parts.length >= 7) {
		const candidate = parts[6];
		const candidateNum = Number.parseFloat(candidate);
		if (!Number.isNaN(candidateNum)) {
			depthScaleStr = candidate;
			stencilRef = parts[7];
		} else {
			stencilRef = candidate;
		}
	}
	return {
		iStr: parts[0],
		name: parts[1],
		modeKey: parts[2],
		xStr: parts[3],
		yStr: parts[4],
		scaleStr: parts[5],
		depthScaleStr,
		stencilRef,
	};
};

// Add a decal entry
function add(
	iStr: string,
	name: string,
	modeKey: string,
	xStr: string,
	yStr: string,
	scaleStr: string,
	depthScaleStr?: string,
	stencilRef?: string,
) {
	const i = Number.parseInt(iStr, 10);
	const resolvedMode = mode[modeKey as keyof typeof mode] ?? mode.fast;
	const x = Number.parseFloat(xStr);
	const y = Number.parseFloat(yStr);
	const s = Number.parseFloat(scaleStr);
	const depthScale = depthScaleStr ? Number.parseFloat(depthScaleStr) : 1;

	const texKey = tex(path.join("decals/", `${name}.png`));
	let stencilTexKey: string | undefined;
	if (stencilRef) {
		stencilTexKey = tex(path.join("decals/", `${stencilRef}.png`));
	}

	explorable.push({
		id: i,
		name,
		mode: resolvedMode,
		texPath: `assets/decals/textures/item/t${texKey}.png`,
		x,
		y,
		s,
	});

	// make sense?
	function f(x: number) {
		return 16 / x;
	}

	const d = -f(s);

	const n = Math.min(SHEET_SCALES, Math.max(1, Math.ceil(Math.log2(s))));
	const parentScale = 2 ** (n - 1);
	const geometryScale = Math.min(parentScale, 3);
	const s_mc = s / geometryScale;

	// a:0=c a:1=t a:2=b a:3=l a:4=r a:5=tl a:6=tr a:7=bl a:8=br
	const alignmentOffsets = [
		{ a: 0, dx: 0, dy: 0 }, // c
		{ a: 1, dx: 0, dy: -d * s }, // t
		{ a: 2, dx: 0, dy: d * s }, // b
		{ a: 3, dx: d * s, dy: 0 }, // l
		{ a: 4, dx: -d * s, dy: 0 }, // r
		{ a: 5, dx: d * s, dy: -d * s }, // tl
		{ a: 6, dx: -d * s, dy: -d * s }, // tr
		{ a: 7, dx: d * s, dy: d * s }, // bl
		{ a: 8, dx: -d * s, dy: d * s }, // br
	];

	const isFastOrShell =
		resolvedMode === mode.fast || resolvedMode === mode.shell;
	const parentMode =
		resolvedMode === mode.inbetween
			? mode.fast
			: isFastOrShell
				? `f${n}${resolvedMode === mode.shell ? "s" : ""}`
				: resolvedMode;
	const texRef = `decals:item/t${texKey}`;

	const makeDisplay = (dx: number, dy: number) => {
		// Base visual shifts
		const visual_x = -x * 32 + dx;
		const visual_y = y * 32 + dy;

		// fuho:f renders north face (mirrored X vs fuho:d which corrects via [0,180,0]).
		// Negate tx for fast mode to flip X back to correct direction.
		// Negate ty always: dy is screen-space (down+), MC translation Y is up+.
		const xSign = isFastOrShell ? -1 : -1;

		// Scale bypass logic: s_mc = s / parentScale.
		// To preserve displacement D = tx * scale_mc * 2, we need tx_mc = tx * parentScale.
		const scaleFactor = isFastOrShell ? parentScale : 1;
		let tx = visual_x * xSign * scaleFactor;
		let ty = visual_y * scaleFactor;

		if (resolvedMode === mode.inbetween) {
			tx += 8 / s;
			ty += 8 / s;
		}
		const displayScale = isFastOrShell ? Math.min(s_mc * 2, 4) : s * 2;
		const tf = {
			translation: [tx, ty, -0.03 * depthScale],
			scale: [displayScale, displayScale, displayScale * depthScale],
			...(resolvedMode === "d" ? { rotation: [0, 180, 0] } : {}),
		};
		return { head: tf, fixed: tf };
	};

	lfs()();
	return {
		threshold: i,
		texRef,
		stencilTexKey,
		parentMode,
		alignmentOffsets,
		makeDisplay,
	};
}

// Create item model resources
const paperItemPath = vd(path.join("assets/minecraft/items/paper.json"));
const paperModelPath = vd(path.join("assets/minecraft/models/item/paper.json"));
const entries = df
	.map((line) => {
		const {
			iStr,
			name,
			modeKey,
			xStr,
			yStr,
			scaleStr,
			depthScaleStr,
			stencilRef,
		} = parseDecalLine(line);
		return add(
			iStr as string,
			name as string,
			modeKey as string,
			xStr as string,
			yStr as string,
			scaleStr as string,
			depthScaleStr as string | undefined,
			stencilRef as string | undefined,
		);
	})
	.sort((a, b) => a.threshold - b.threshold);

// Float abuse: id.a (e.g., 10001.0 for a=0, 10001.1 for a=1)
const rangeEntries: { threshold: number; model: unknown }[] = [];
for (const e of entries) {
	// a: 0=c, 1=t, 2=b, 3=l, 4=r, 5=tl, 6=tr, 7=bl, 8=br
	const offsets = ALIGNMENT_VARIANTS
		? e.alignmentOffsets
		: [e.alignmentOffsets[0]];
	for (const { a, dx, dy } of offsets) {
		const modelPath = vd(
			path.join("assets/decals/models/", `v${e.threshold}_${a}.json`),
		);
		const modelData: any = {
			parent: a === 0 ? `fuho:${e.parentMode}` : `decals:v${e.threshold}_0`,
		};
		if (a === 0) {
			modelData.textures = { layer0: e.texRef, particle: "fuho:item/noop" };
			if (e.stencilTexKey) {
				modelData.textures.layer1 = `decals:item/t${e.stencilTexKey}`;
			}
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
	const ppRule = matchPostprocessRule(relPath, relNoExt);

	const copyOrResize = async (src: string, dst: string) => {
		if (!ppRule) {
			await copyFile(src, dst);
		} else if (ppRule.stretch) {
			const input = Buffer.from(await Bun.file(src).arrayBuffer());
			const resized = await rescaleStretch(
				input,
				ppRule.size,
				ppRule.nearest,
				ppRule.alphaBoolean,
			);
			await Bun.write(dst, resized);
		} else {
			const input = Buffer.from(await Bun.file(src).arrayBuffer());
			const resized = await rescaleFit(
				input,
				ppRule.size,
				ppRule.nearest,
				ppRule.alphaBoolean,
			);
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
