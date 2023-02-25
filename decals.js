const fs = require("fs"),
  path = require("path"),
  crc32 = require("crc/crc32");

// ["models", "textures"].map((f) =>
//   fs.rm(
//     path.join(__dirname, "assets/decals/", f),
//     {
//       recursive: true,
//       force: true,
//     },
//     () => {
//       fs.mkdirSync(path.join(__dirname, "assets/decals/", f));
//     }
//   )
// );
console.log(__dirname);
function vd(p) {
  console.log(p);
  return p;
}

function lfs(...a) {
  return (...b) => {
    console.log(...a, ...b);
  };
}

const textures = {},
  models = {};

const df = fs
  .readFileSync("decals.txt") //
  .toString("utf8")
  .split("\n")
  .map((i) => i.trim())
  .filter((i) => i)
  .filter((i) => !i.trimStart().startsWith("#"));

function sign(n) {
  const { mtime, size } = fs.statSync(n);
  return `${mtime} ${size}`;
}

function ha(t) {
  return (n) => {
    return (
      (t ? textures : models)[n] ||
      ((t ? textures : models)[n] = crc32(
        `${n} ${t ? sign(n) : JSON.stringify(n)}`
      )) ||
      (t ? textures : models)[n]
    );
  };
}

const mode = {
  fast: "f",
  default: "d",
};

const tex = ha(!0),
  mod = ha(!1);

function add(i, n, m, x, y, s) {
  m = mode[m];
  const t = mod(n);
  const mn = i + "." + mod(n, [n, m, x, y, s]);
  const mp = vd(path.join(__dirname, "assets/decals/models/", `${mn}.json`));
  fs.writeFile(
    mp,
    JSON.stringify({
      parent: "fuho:" + m,
      textures: {
        [m == mode.default ? "layer0" : "0"]: `decals:${tex(
          path.join(__dirname, "decals/", `${n}.png`)
        )}`,
      },
      display: {
        fixed: {
          translation: [x, y, -0.01],
          scale: Array(3).fill(s * 2),
        },
      },
    }),
    lfs()
  );

  return {
    predicate: {
      custom_model_data: i,
    },
    model: `decals:${mn}`,
  };
}

// console.log(df);
const pp = vd(path.join(__dirname, "assets/minecraft/models/item/paper.json"));
fs.writeFile(
  pp,
  JSON.stringify({
    parent: "minecraft:item/generated",
    textures: {
      layer0: "minecraft:item/paper",
    },
    overrides: df.map((s) => s.split(" ")).map((i) => add(...i)),
  }),
  () =>
    lfs(...arguments) &&
    Object.keys(textures).map((k) => {
      const dn = textures[k];
      fs.copyFile(
        k,
        vd(path.join(__dirname, "assets/decals/textures/", `${dn}.png`)),
        lfs(`* ${k}`)
      );
    })
);
