/*/==========================================================/*/
/*/ Minecraft resourcepack production-ready compilation tool /*/
/*/==========================================================/*/
/*/  author: hUwUtao                                         /*/
/*/==========================================================/*/

const gulp = require("gulp"),
  { task, series } = require("gulp"),
  zip = require("gulp-zip"),
  del = require("del"),
  sharp = require("sharp"),
  ReadableStream = require("stream").Readable;

const pdot = (s) => `.${s}`;

const typejson = ["json", "mcmeta"].map(pdot),
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
  addDist = (list, dest) =>
    list.map((src) =>
      gulp
        .src(src)
        .on("data", function (file) {
          if (typejson.includes(file.extname)) {
            file.contents = minJSON(file.contents);
          } else if (typeimage.includes(file.extname)) {
            file.contents = optimizePNG(file.contents);
          }
        })
        .pipe(gulp.dest(dest))
    ),
  addZip = (list) =>
    list.map((src) =>
      gulp.src(src).pipe(zip("final.zip")).pipe(gulp.dest("./"))
    );

task("clean", function (cb) {
  del.sync(["dist"]);
  cb();
});
task("optimizing", function (cb) {
  addDist(["./pack.mcmeta"], "./dist/");
  addDist(["./assets/**/*", "./assets/*"], "./dist/assets");
  cb();
});

task("pack", function (cb) {
  addZip(["./dist/*", "./dist/**"]);
  cb();
});

task("default", function (cb) {
  series("clean", "optimizing", "pack")(cb);
});
