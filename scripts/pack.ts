import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import archiver from "archiver";
import pngquant from "pngquant-bin";
import sharp from "sharp";

const ROOT = process.cwd();
const DIST_DIR = path.join(ROOT, "dist");
const ASSETS_DIR = path.join(ROOT, "assets");
const PATCHES_DIR = path.join(ROOT, "patches");

const PACK_FILES = ["pack.mcmeta", "pack.png", "LICENSE"];
const IGNORE_EXTS = new Set([".bbmodel"]);
const IGNORE_NAMES = new Set([".gitignore"]);
const JSON_EXTS = new Set([".json", ".mcmeta"]);
const PNG_EXTS = new Set([".png"]);
const MAX_TEXTURE_SIZE = 2048;
const PNGQUANT_QUALITY_DEFAULT = "60-85";
const PNGQUANT_QUALITY_ALPHA = "30-60";
const PNGQUANT_FLOYD_ALPHA = "0";
const PNGQUANT_PATH =
	typeof pngquant === "string" && pngquant.length > 0 ? pngquant : null;

const powerOfTwoFloor = (value: number) => 2 ** Math.floor(Math.log2(value));

const runPngquant = async (
	input: Buffer,
	options?: { quality?: string; floyd?: string },
): Promise<Buffer | null> => {
	if (!PNGQUANT_PATH) return null;
	const quality = options?.quality ?? PNGQUANT_QUALITY_DEFAULT;
	const floyd = options?.floyd;
	const proc = Bun.spawn({
		cmd: [
			PNGQUANT_PATH,
			`--quality=${quality}`,
			"--speed",
			"1",
			"--strip",
			...(floyd ? [`--floyd=${floyd}`] : []),
			"--output",
			"-",
			"--force",
			"-",
		],
		stdin: "pipe",
		stdout: "pipe",
		stderr: "pipe",
	});
	proc.stdin?.write(input);
	proc.stdin?.end();

	const [output, exitCode] = await Promise.all([
		new Response(proc.stdout).arrayBuffer(),
		proc.exited,
	]);

	if (exitCode !== 0) return null;
	return Buffer.from(output);
};

const optimizePng = async (src: string): Promise<Buffer> => {
	const input = await fs.readFile(src);
	const image = sharp(input, { limitInputPixels: false });
	const meta = await image.metadata();

	if (!meta.width || !meta.height) return input;

	let hasPartialAlpha = false;
	if (meta.hasAlpha) {
		const stats = await image.stats();
		const alpha = stats.channels[3];
		if (alpha?.histogram) {
			for (let i = 1; i < 255; i += 1) {
				if (alpha.histogram[i] > 0) {
					hasPartialAlpha = true;
					break;
				}
			}
		}
	}

	const longest = Math.max(meta.width, meta.height);
	const capped = Math.min(longest, MAX_TEXTURE_SIZE);
	const targetSize = Math.max(1, powerOfTwoFloor(capped));
	const resizedLabel =
		meta.width === targetSize && meta.height === targetSize ? " (no-op)" : "";
	console.log(
		`[pack] ${src}: ${meta.width}x${meta.height} -> ${targetSize}x${targetSize}${resizedLabel}`,
	);

	const resized = await sharp(input, { limitInputPixels: false })
		.resize(targetSize, targetSize, {
			fit: "contain",
			background: { r: 0, g: 0, b: 0, alpha: 0 },
		})
		.png({ compressionLevel: 8, progressive: false })
		.toBuffer();

	const quantized = await runPngquant(resized, {
		quality: hasPartialAlpha ? PNGQUANT_QUALITY_ALPHA : undefined,
		floyd: hasPartialAlpha ? PNGQUANT_FLOYD_ALPHA : undefined,
	});
	return quantized ?? resized;
};

const ensureDir = async (dir: string) => {
	await fs.mkdir(dir, { recursive: true });
};

const emptyDir = async (dir: string) => {
	await fs.rm(dir, { recursive: true, force: true });
	await ensureDir(dir);
};

const shouldIgnore = (filePath: string) => {
	const baseName = path.basename(filePath);
	const ext = path.extname(filePath).toLowerCase();
	return IGNORE_NAMES.has(baseName) || IGNORE_EXTS.has(ext);
};

const copyFileTransformed = async (src: string, dest: string) => {
	if (shouldIgnore(src)) return;
	await ensureDir(path.dirname(dest));
	const ext = path.extname(src).toLowerCase();
	if (JSON_EXTS.has(ext)) {
		const raw = await fs.readFile(src, "utf8");
		try {
			const minified = JSON.stringify(JSON.parse(raw));
			await fs.writeFile(dest, minified);
			return;
		} catch {
			// Fall through to raw copy if JSON parse fails.
		}
	}
	if (PNG_EXTS.has(ext)) {
		const optimized = await optimizePng(src);
		await fs.writeFile(dest, optimized);
		return;
	}
	await fs.copyFile(src, dest);
};

const copyTree = async (srcDir: string, destDir: string) => {
	let entries: fs.Dirent[];
	try {
		entries = await fs.readdir(srcDir, { withFileTypes: true });
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
		throw error;
	}

	await ensureDir(destDir);
	for (const entry of entries) {
		const srcPath = path.join(srcDir, entry.name);
		const destPath = path.join(destDir, entry.name);
		if (entry.isDirectory()) {
			await copyTree(srcPath, destPath);
			continue;
		}
		if (entry.isFile()) {
			await copyFileTransformed(srcPath, destPath);
		}
	}
};

const copyPackFiles = async (destDir: string) => {
	await ensureDir(destDir);
	await Promise.all(
		PACK_FILES.map(async (fileName) => {
			const srcPath = path.join(ROOT, fileName);
			const destPath = path.join(destDir, fileName);
			await copyFileTransformed(srcPath, destPath);
		}),
	);
};

let zipCliReady: boolean | null = null;
const hasZipCli = async () => {
	if (zipCliReady !== null) return zipCliReady;
	const proc = Bun.spawn({
		cmd: ["zip", "-v"],
		stdout: "ignore",
		stderr: "ignore",
	});
	zipCliReady = (await proc.exited) === 0;
	return zipCliReady;
};

const zipDirCli = async (srcDir: string, outFile: string) => {
	await fs.rm(outFile, { force: true });
	const proc = Bun.spawn({
		cmd: ["zip", "-9", "-X", "-q", "-r", "-D", outFile, "."],
		cwd: srcDir,
		stdout: "pipe",
		stderr: "pipe",
	});
	const [exitCode, stderr] = await Promise.all([
		proc.exited,
		new Response(proc.stderr).text(),
	]);
	if (exitCode !== 0) {
		throw new Error(`zip failed: ${stderr.trim()}`);
	}
};

const zipDir = async (srcDir: string, outFile: string) => {
	await ensureDir(path.dirname(outFile));
	if (await hasZipCli()) {
		await zipDirCli(srcDir, outFile);
		return;
	}
	await new Promise<void>((resolve, reject) => {
		const output = createWriteStream(outFile);
		const archive = archiver("zip", { zlib: { level: 9 } });

		output.on("close", () => resolve());
		archive.on("error", (error) => reject(error));
		archive.on("warning", (error) => {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
				reject(error);
			}
		});

		archive.pipe(output);
		archive.directory(srcDir, false);
		archive.finalize();
	});
};

const getPatches = async () => {
	const disabledPath = path.join(PATCHES_DIR, ".disabled.txt");
	const disabledRaw = await fs.readFile(disabledPath, "utf8");
	const disabled = new Set(
		disabledRaw
			.split("\n")
			.map((line) => line.trim())
			.filter(Boolean),
	);

	const entries = await fs.readdir(PATCHES_DIR, { withFileTypes: true });
	return entries
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name)
		.filter((name) => !name.startsWith(".") && !disabled.has(name));
};

const buildBasePack = async () => {
	const destDir = path.join(DIST_DIR, "base");
	await emptyDir(destDir);
	await copyPackFiles(destDir);
	await copyTree(ASSETS_DIR, path.join(destDir, "assets"));
	await zipDir(destDir, path.join(DIST_DIR, "tfh.base.zip"));
};

const buildPatchPacks = async () => {
	const patches = await getPatches();
	for (const patchName of patches) {
		const patchId = patchName.split(".")[0] || patchName;
		const destDir = path.join(DIST_DIR, patchId);
		await emptyDir(destDir);
		await copyPackFiles(destDir);
		await copyTree(path.join(PATCHES_DIR, patchName), destDir);
		await zipDir(destDir, path.join(DIST_DIR, `tfh.${patchName}.zip`));
	}
};

const buildFullPack = async () => {
	const destDir = path.join(DIST_DIR, "base");
	await emptyDir(destDir);
	await copyPackFiles(destDir);
	await copyTree(ASSETS_DIR, path.join(destDir, "assets"));
	const patches = await getPatches();
	for (const patchName of patches) {
		await copyTree(path.join(PATCHES_DIR, patchName), destDir);
	}
	await zipDir(destDir, path.join(DIST_DIR, "tfh.fullpatch.zip"));
};

const buildPdev = async () => {
	const patches = await getPatches();
	const packMeta = JSON.stringify({
		pack: {
			pack_format: 6,
			description: [
				"",
				{
					text: "AUTO GENERATED. DO NOT EDIT",
					bold: true,
					color: "red",
				},
			],
		},
	});

	for (const patchName of patches) {
		const destDir = path.resolve(ROOT, `../DEV--${patchName}`);
		await emptyDir(destDir);
		await copyTree(path.join(PATCHES_DIR, patchName), destDir);
		await fs.writeFile(path.join(destDir, "pack.mcmeta"), packMeta);
	}
};

const mode = process.argv[2] ?? "patch";

switch (mode) {
	case "patch":
		await buildBasePack();
		await buildPatchPacks();
		break;
	case "full":
		await buildFullPack();
		break;
	case "pdev":
		await buildPdev();
		break;
	default:
		console.error("Unknown mode. Use one of: patch (default), full, pdev.");
		process.exit(1);
}
