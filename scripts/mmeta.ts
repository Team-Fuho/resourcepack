import { join, resolve } from "path";
import { readdir } from "node:fs/promises";

const distPath = resolve(process.cwd(), "dist");

async function processZipFiles() {
  const zipFiles = [];

  try {
    const files = await readdir(distPath);
    for (const file of files) {
      if (file.endsWith(".zip")) {
        zipFiles.push(join(distPath, file));
      }
    }
  } catch (error) {
    console.error(`Error reading directory: ${error.message}`);
    console.error(`Attempted to read directory: ${distPath}`);
    return;
  }

  const fileMetadata = [];

  for (const zipFile of zipFiles) {
    try {
      const fileContent = await Bun.file(zipFile).arrayBuffer();
      const hasher = new Bun.CryptoHasher("sha1");
      hasher.update(new Uint8Array(fileContent));
      const hashHex = hasher.digest("hex");

      const fileName = zipFile.split(/[/\\]/).pop();
      const url = `https://whitespace.teamfuho.net/Team-Fuho/resourcepacks/dist/${fileName}`;

      fileMetadata.push({ url, hash: hashHex });
    } catch (error) {
      console.error(`Error processing file ${zipFile}: ${error.message}`);
    }
  }

  try {
    await Bun.write(
      `${distPath}/metadata.json`,
      JSON.stringify(fileMetadata, null, 2),
    );
  } catch (error) {
    console.error(`Error writing metadata file: ${error.message}`);
  }
}

processZipFiles();
