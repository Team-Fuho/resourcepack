const fs = require("fs"),
  path = require("path"),
  crc32 = require("crc/crc32");

// function crc32() {
//   console.log(...arguments);
//   return hcrc32(...arguments);
// }

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
  models = {},
  explorable = `
<h1>Team Fuho's decal explorer</h1>  
<sub>Tech tip: Click twice to select all</sub>
<style>
body{
display: flex;
flex-direction: column;
align-items: center;
}
.expl_gr{
display: flex;
flex-direction: row;
align-items: flex-start;
flex-wrap: wrap;
justify-content: center;
}
.expl_gr>*{
margin:1em;
}
div.expl_bg{
width:384px;
height:384px;
border: solid;
display: flex;
align-items: center;
justify-content: center;
background-color: #eee;
background-image: linear-gradient(45deg, black 25%, transparent 25%, transparent 75%, black 75%, black),
linear-gradient(45deg, black 25%, transparent 25%, transparent 75%, black 75%, black);
background-size: 256px 256px;
background-position: 0 0, 128px 128px;
}
.expl_i{
display: flex;
flex-direction: column;
align-items: center;
}
.expl_i>*{
margin-bottom: 3px;
}
input{
width: 100%;
}
img{--s:1; width: calc(var(--s) * 128px);height: calc(var(--s) * 128px);transform: translate(calc(var(--x) * 128px), calc(var(--y) * 128px));}
</style>
<div class=expl_gr>
`.split("\n");

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
  return (n, s) => {
    return (
      (t ? textures : models)[n] ||
      ((t ? textures : models)[n] = crc32(
        `${n} ${t ? sign(n) : JSON.stringify([n, s])}`
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
  const mn = i + "." + mod(n, [n, m, x, y, s]),
    mp = vd(path.join(__dirname, "assets/decals/models/", `${mn}.json`)),
    dt = tex(path.join(__dirname, "decals/", `${n}.png`));
  explorable.push(
    `<div class=expl_i>
    <b>${i}</b> <input value="minecraft:give @p paper{CustomModelData:${i}}" readonly>
    <div class=expl_bg><img src=assets/decals/textures/${dt}.png class=${m} style=--x:${x};--y:${y};--s:${s}></div>
    </div>`
  );
  fs.writeFile(
    mp,
    JSON.stringify({
      parent: "fuho:" + m,
      textures: {
        [m == mode.default ? "layer0" : "0"]: `decals:${dt}`,
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
        vd(path.join(__dirname, "assets/decals/textures/", `${dn}.png`)),
        lfs(`* ${k}`)
      );
    })
  )
);
