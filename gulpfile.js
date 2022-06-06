/*/==========================================================/*/
/*/ Minecraft resourcepack production-ready compilation tool /*/
/*/==========================================================/*/
/*/  author: hUwUtao                                         /*/
/*/==========================================================/*/

const gulp = require("gulp"),
  { task } = require("gulp"),
  { series } = require("async"),
  argv = require("yargs").argv,
  zip = require("gulp-zip"),
  del = require("del"),
  sharp = require("sharp"),
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
  bundling = (list, dist) =>
    gulp
      .src([...list, ...typeignore.map((s) => `!./assets/**/*${s}`)])
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
      .pipe(gulp.dest("dist/" + dist)),
  zipping = () =>
    gulp.src(["dist/**/*"]).pipe(zip("final.zip")).pipe(gulp.dest("."));

task("default", (end) =>
  series([
    (cb) => bundling(["./pack.mcmeta", "./pack.png"], "./").on("end", cb),
    (cb) => bundling(["./assets/**/*"], "./assets").on("end", cb),
    (cb) => zipping().on("end", cb),
    (cb) => (!argv.noClean ? del(["dist/**/*"]).then(() => cb()) : cb()),
    (cb) => cb() && end(),
  ])
);
