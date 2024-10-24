/**
 * @description Minecraft resourcepack production-ready compilation tool
 * @author stdpi
 */

import gulp from "gulp";
import { series } from "async";
import { default as zip } from "gulp-zip";
import { deleteAsync } from "del";
import { relative } from "node:path";
import { Image } from "imagescript";
import { readFileSync, readdirSync, writeFile } from "node:fs";
import { Readable as ReadableStream } from "node:stream";
import { Buffer } from "node:buffer";

const { task, src, dest } = gulp;
const pdot = (s) => `.${s}`;

const typeignore = ["bbmodel", "gitignore"].map(pdot),
  typejson = ["json", "mcmeta"].map(pdot),
  typeimage = ["png"].map(pdot);

const ignoreGlob = typeignore.map((s) => `!./assets/**/*${s}`);

const minJSON = (json) => Buffer.from(JSON.stringify(JSON.parse(json))),
  optimizePNG = (img) =>
    new ReadableStream({
      async read() {
        if (
          img[0] !== 137 ||
          img[1] !== 80 ||
          img[2] !== 78 ||
          img[3] !== 71 ||
          img[4] !== 13 ||
          img[5] !== 10 ||
          img[6] !== 26 ||
          img[7] !== 10
        ) {
          throw new Error("Invalid PNG signature");
        }
        try {
          const image = await Image.decode(img, { type: "png" });
          const optimized = await image.encode({
            format: "png",
            compression: 9,
          });
          this.push(Buffer.from(optimized));
          this.push(null);
        } catch (err) {
          console.error("Error optimizing PNG:", err);
          this.push(img);
          this.push(null);
        }
      },
    }),
  opt = (file) => {
    if (typejson.includes(file.extname)) {
      file.contents = minJSON(file.contents);
    } else if (typeimage.includes(file.extname)) {
      file.contents = optimizePNG(file.contents);
    }
  },
  dist = (list, dist, base, patch) =>
    src([...list, ...ignoreGlob], {
      base,
      encoding: false,
      buffer: true,
      removeBOM: false,
    })
      // .on("data", opt)
      .on("data", (file) => {
        // console.log(
        //   "\x1b[32m+\x1b[0m",
        //   relative(import.meta.dirname, file.path),
        // );
        process.stdout.write("\x1b[32m+\x1b[0m");
      })
      .pipe(dest(`./dist/${patch || "base"}/${dist}`)),
  // .on("data", async (file) => {
  //   const outputPath = `./dist/${patch || "base"}/${dist}/${file.relative}`;
  //   await Deno.writeFile(outputPath, new Uint8Array(file.contents));
  // }),
  zipack = (outname, patch) =>
    src([`dist/${patch || "base"}/**/*`], { encoding: false })
      .pipe(zip(outname))
      .pipe(dest(".")),
  patch = (cb, list, outname, patch) =>
    series(
      [
        (cb) =>
          dist(["./pack.mcmeta", "./pack.png", "LICENSE"], "./").on("end", cb),
        (cb) =>
          series(
            //
            list.map((l) => (cb) => dist(...l, patch).on("end", cb)),
            cb,
          ),
        (cb) => zipack(`./dist/${outname}`, patch).on("end", cb),
        (cb) =>
          !process.env.noclean
            ? deleteAsync(["./dist/pack/**/*"]).then(() => cb())
            : cb(),
      ],
      cb,
    );

const disabled_patches = readFileSync("./patches/.disabled.txt", {
  encoding: "utf8",
}).split("\n");
const patches = readdirSync("./patches").filter(
  (i) => !i.startsWith(".") && !disabled_patches.includes(i),
);
task("default", (end) =>
  patch(
    end,
    [
      [["./assets/**/*"], "./", "./"],
      ...patches.map((pn) => [
        [`./patches/${pn}/**/*`],
        "./",
        `./patches/${pn}`,
      ]),
    ],
    "tfh.fullpatch.zip",
  ),
);

task("patch", (end) => {
  series(
    [
      // Base patch
      (end) => patch(end, [[["./assets/**/*"], "./", "./"]], "tfh.base.zip"),
      ...patches.map(
        (pn) => (end) =>
          patch(
            end,
            [[[`./patches/${pn}/**/*`], "./", `./patches/${pn}`]],
            `tfh.${pn}.zip`,
            pn.split(".")[0],
          ),
      ),
    ],
    end,
  );
});

task("pdev", (end) =>
  series(
    [
      ...patches.map(
        (pn) => (cb) =>
          series(
            [
              (cb) =>
                src([`./patches/${pn}/**/*`, ...ignoreGlob], {
                  base: `./patches/${pn}`,
                  encoding: false,
                })
                  .pipe(dest(`../DEV--${pn}`))
                  .on("end", cb),
              (cb) =>
                writeFile(
                  `../DEV--${pn}/pack.mcmeta`,
                  JSON.stringify({
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
                  }),
                  cb,
                ),
            ],
            cb,
          ),
      ),
    ],
    end,
  ),
);
