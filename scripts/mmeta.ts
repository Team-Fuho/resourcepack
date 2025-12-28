import fs from "node:fs/promises";
import path from "node:path";

const distPath = path.resolve(process.cwd(), "dist");
const defaultBaseUrl =
	"https://whitespace.teamfuho.net/Team-Fuho/resourcepacks/dist";

const normalizeBaseUrl = (baseUrl: string) => baseUrl.replace(/\/+$/, "");
const baseUrl = normalizeBaseUrl(
	process.env.RESOURCEPACK_BASE_URL || defaultBaseUrl,
);
const latestBaseUrl = normalizeBaseUrl(
	process.env.RESOURCEPACK_LATEST_BASE_URL || baseUrl,
);

async function getZipFiles() {
	const zipFiles: string[] = [];
	const files = await fs.readdir(distPath);

	for (const file of files) {
		const filePath = path.join(distPath, file);
		const stat = await fs.stat(filePath);
		if (stat.isFile() && file.endsWith(".zip")) {
			zipFiles.push(filePath);
		}
	}

	return zipFiles;
}

async function computeHash(filePath: string): Promise<string> {
	const hasher = new Bun.CryptoHasher("sha1");
	const fileBuffer = await fs.readFile(filePath);
	hasher.update(fileBuffer);
	return hasher.digest("hex");
}

async function processZipFiles() {
	const zipFiles = await getZipFiles();
	const fileMetadata: { url: string; hash: string; latest_url?: string }[] =
		[];

	for (const zipFile of zipFiles) {
		try {
			const hash = await computeHash(zipFile);
			const fileName = path.basename(zipFile);
			const url = `${baseUrl}/${fileName}`;
			const latestUrl = `${latestBaseUrl}/${fileName}`;
			fileMetadata.push({ url, hash, latest_url: latestUrl });
		} catch (error) {
			console.error(`Error processing file ${zipFile}: ${error.message}`);
		}
	}

	try {
		const metadataPath = path.join(distPath, "metadata.json");
		await fs.writeFile(metadataPath, JSON.stringify(fileMetadata, null, 2));
	} catch (error) {
		console.error(`Error writing metadata file: ${error.message}`);
	}
}

processZipFiles();
