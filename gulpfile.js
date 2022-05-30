/*/==========================================================/*/
/*/ Minecraft resourcepack production-ready compilation tool /*/
/*/==========================================================/*/
/*/  author: hUwUtao                                         /*/
/*/==========================================================/*/

const gulp = require("gulp"),
  { task } = require("gulp"),
  zip = require("gulp-zip"),
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
  bundling = (list) =>
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
        console.log(file.path);
      })
      .pipe(zip("final.zip"))
      .pipe(gulp.dest("."));

task("default", function (cb) {
  bundling(["./pack.mcmeta", "./pack.png", "./assets/**/*", "./assets/*"]);
});
