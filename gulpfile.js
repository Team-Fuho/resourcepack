/**
 * @description Minecraft resourcepack production-ready compilation tool
 * @author stdpi
 */
module.exports = {};

const gulp = require("node:gulp"),
  { task } = require("node:gulp"),
  { series } = require("node:async"),
  zip = require("gulp-zip"),
  del = require("del"),
  { relative } = require("node:path"),
  sharp = require("sharp"),
  { readFileSync, readdirSync, writeFile } = require("node:fs"),
  ReadableStream = require("node:stream").Readable;

const pdot = (s) => `.${s}`;

const typeignore = ["bbmodel", "gitignore"].map(pdot),
  typejson = ["json", "mcmeta"].map(pdot),
  typeimage = ["png"].map(pdot);

const ignoreGlob = typeignore.map((s) => `!./assets/**/*${s}`);

const minJSON = (json) => Buffer.from(JSON.stringify(JSON.parse(json))),
  optimizePNG = (img) =>
    new ReadableStream({
      read() {
        sharp(img)
          .png({
            compressionLevel: 8,
            progressive: true,
          })
          .toBuffer()
          .then((data) => {
            this.push(data);
            this.push(null);
          });
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
    gulp
      .src([...list, ...ignoreGlob], {
        base,
      })
      .on("data", opt)
      .on("data", (file) => {
        console.log("\x1b[32m+\x1b[0m", relative(__dirname, file.path));
      })
      .pipe(gulp.dest(`./dist/${patch || "base"}/${dist}`)),
  zipack = (outname, patch) =>
    gulp
      .src([`dist/${patch || "base"}/**/*`])
      .pipe(zip(outname))
      .pipe(gulp.dest(".")),
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
            ? del(["./dist/pack/**/*"]).then(() => cb())
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
  ));

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
                gulp
                  .src([`./patches/${pn}/**/*`, ...ignoreGlob], {
                    base: `./patches/${pn}`,
                  })
                  .pipe(gulp.dest(`../DEV--${pn}`))
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
  ));
