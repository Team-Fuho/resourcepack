const fs = require("fs"),
  path = require("path"),
  crc32 = require("crc/crc32");

[
  "dist", //
  "assets/decals",
  "assets/decals/models",
  "assets/decals/textures",
].map((d) => fs.mkdirSync(d, { recursive: true }));

console.log(__dirname);

const vd = (a) => (console.log(a), a),
  lfs =
    (...a) =>
    (...b) =>
      a[0] && console.log(...a, ...b);

const textures = {},
  models = {},
  explorable =
    //
    [
      `<h1>Team Fuho's decal explorer</h1>
Invisible item_frame: <span class=ip>minecraft:give @p item_frame{EntityTag:{Invisible:1}}</span>
<link rel="stylesheet" type="text/css" href="explore.css" />
<div class=expl_gr>` //
        .replace("\n", "<br>"),
    ];

const df = fs
  .readFileSync("decals/decals.txt") //
  .toString("utf8")
  .split("\n")
  .map((i) => i.trim())
  .filter((i) => i)
  .filter((i) => !i.trimStart().startsWith("#"));

function sign(n) {
  const { mtime, size } = fs.statSync(n);
  return `${mtime} ${size}`;
}

const ha = (t) => (n, s) =>
  (t ? textures : models)[n] ||
  ((t ? textures : models)[n] = crc32(
    `${n} ${t ? sign(n) : [n, s || []].flat().join()}`
  )) ||
  (t ? textures : models)[n];

const mode = {
  fast: "f",
  default: "d",
};

const tex = ha(!0),
  mod = ha(!1);

function add(i, n, m, x, y, s) {
  i = parseInt(i);
  m = mode[m] || mode["fast"];
  x = parseFloat(x);
  y = parseFloat(y);
  s = parseFloat(s);
  const mn = "m" + i + "_" + mod(n, [n, m, x, y, s]),
    mp = vd(path.join(__dirname, "assets/decals/models/", `${mn}.json`)),
    dt = tex(path.join(__dirname, "decals/", `${n}.png`));
  explorable.push(
    `<div class=expl_i>
<b><code>${i} ${n}</code> ${m}</b> <span class=ip>minecraft:give @p paper{CustomModelData:${i}\}</span>
<div class=expl_bg><img src=assets/decals/textures/t${dt}.png class=${m} style=--x:${-x};--y:${-y};--s:${s}></div>
</div>`
  );
  function gentf(slt) {
    return {
      translation: [x * 32, y * 32, -0.01],
      scale: Array(3).fill(
        s * (m == mode.default ? 2 : 1) * (slt == "head" ? 1 : 1)
      ),
      rotation: m == "d" ? [0, 180, 0] : undefined,
    };
  }
  fs.writeFile(
    mp,
    JSON.stringify({
      parent: `fuho:${m}`,
      textures: {
        [m == mode.default ? "layer0" : "0"]: `decals:t${dt}`,
      },
      display: {
        head: gentf("head"),
        fixed: gentf("frame"),
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
  () => (
    lfs(...arguments),
    fs.writeFile(
      "explore.html",
      [...explorable, "</div>"].join("\n"),
      () => {}
    ),
    Object.keys(textures).map((k) => {
      const dn = textures[k];
      fs.copyFile(
        k,
        vd(path.join(__dirname, "assets/decals/textures/", `t${dn}.png`)),
        lfs(`* ${k}`)
      );
    })
  )
);
