/*/==========================================================/*/
/*/ Minecraft resourcepack production-ready compilation tool /*/
/*/==========================================================/*/
/*/  author: hUwUtao                                         /*/
/*/==========================================================/*/

const gulp = require("gulp"),
  { task } = require("gulp"),
  { series } = require("async"),
  zip = require("gulp-zip"),
  del = require("del"),
  sharp = require("sharp"),
  { readdirSync } = require("fs"),
  ReadableStream = require("stream").Readable;

const pdot = (s) => `.${s}`;

const typeignore = ["bbmodel"].map(pdot),
  typejson = ["json", "mcmeta"].map(pdot),
  typeimage = ["png"].map(pdot);

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
  dist = (list, dist, base) =>
    gulp
      .src([...list, ...typeignore.map((s) => `!./assets/**/*${s}`)], {
        base,
      })
      .on("data", function (file) {
        if (typejson.includes(file.extname)) {
          file.contents = minJSON(file.contents);
        } else if (typeimage.includes(file.extname)) {
          file.contents = optimizePNG(file.contents);
        }
      })
      .on("data", function (file) {
        console.log("\x1b[32m+\x1b[0m", file.path);
      })
      .pipe(gulp.dest("./dist/pack/" + dist)),
  zipping = (fnm) =>
    gulp.src(["dist/**/*"]).pipe(zip(fnm)).pipe(gulp.dest(".")),
  patch = (cb, list, fnm) =>
    series(
      [
        (cb) => dist(["./pack.mcmeta", "./pack.png"], "./").on("end", cb),
        (cb) =>
          series(
            //
            list.map((l) => (cb) => dist(...l).on("end", cb)),
            cb
          ),
        (cb) => zipping(`./dist/${fnm}`).on("end", cb),
        (cb) =>
          !process.env.noclean
            ? del(["./dist/pack/**/*"]).then(() => cb())
            : cb(),
        (cb) => cb() && end(),
      ],
      cb
    );

task("default", (end) =>
  patch(
    end,
    [
      [["./assets/**/*"], "./", "./"],
      ...readdirSync("./patches")
        .filter((i) => !i.startsWith("."))
        .map((patch) => [
          [`./patches/${patch}/**/*`],
          "./",
          `./patches/${patch}`,
        ]),
    ],
    "tfh.fullpatch.zip"
  )
);
