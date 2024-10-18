import { crypto } from "https://deno.land/std/crypto/mod.ts";
import { resolve, normalize } from "https://deno.land/std/path/mod.ts";

const distPath = normalize(resolve(Deno.cwd(), "dist"));

async function processZipFiles() {
  const zipFiles = [];

  try {
    for await (const entry of Deno.readDir(distPath)) {
      if (entry.isFile && entry.name.endsWith(".zip")) {
        zipFiles.push(resolve(distPath, entry.name));
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
      const fileContent = await Deno.readFile(zipFile);
      const hash = await crypto.subtle.digest("SHA-1", fileContent);
      const hashHex = Array.from(new Uint8Array(hash))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      const fileName = zipFile.split(/[/\\]/).pop();
      const url = `https://whitespace.teamfuho.net/Team-Fuho/resourcepacks/dist/${fileName}`;

      fileMetadata.push({ url, hash: hashHex });
    } catch (error) {
      console.error(`Error processing file ${zipFile}: ${error.message}`);
    }
  }

  try {
    await Deno.writeTextFile(
      `${distPath}/metadata.json`,
      JSON.stringify(fileMetadata, null, 2),
    );
  } catch (error) {
    console.error(`Error writing metadata file: ${error.message}`);
  }
}

processZipFiles();
