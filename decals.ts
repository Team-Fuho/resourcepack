import { createHash } from "node:crypto";
import * as path from "https://deno.land/std/path/mod.ts";

["dist", "assets/decals/models", "assets/decals/textures/item"].map((d) =>
  Deno.mkdirSync(d, { recursive: true })
);

const vd = (a: any) => (console.log(a), a),
  lfs = (...a: any[]) => (...b: any[]) => a[0] && console.log(...a, ...b);

const textures: Record<string, string> = {},
  models: Record<string, string> = {},
  explorable: string[] = [
    `<h1>Team Fuho's decal explorer</h1>
Invisible item_frame: <span class=ip>minecraft:give @p item_frame{EntityTag:{Invisible:1}}</span>
<link rel="stylesheet" type="text/css" href="explore.css" />
<div class=expl_gr>`.replace("\n", "<br>"),
  ];

const df = Deno.readTextFileSync("decals/decals.txt")
  .split("\n")
  .map((i) => i.trim())
  .filter((i) => i)
  .filter((i) => !i.trimStart().startsWith("#"));

function sign(n: string): string {
  const { mtime, size } = Deno.statSync(n);
  return `${mtime} ${size}`;
}

const hash = (t: string): string =>
  createHash("sha1").update(t).digest("base64url").slice(0, 12);

const ha = (t: boolean) => (n: string, s?: any): string =>
  (t ? textures : models)[n] ||
  ((t ? textures : models)[n] = hash(
    `${n} ${t ? sign(n) : [n, s || []].flat().join()}`,
  )) ||
  (t ? textures : models)[n];

const mode = {
  fast: "f",
  default: "d",
};

const tex = ha(true),
  mod = ha(false);

function add(i: string, n: string, m: string, x: string, y: string, s: string) {
  i = Number.parseInt(i);
  m = mode[m as keyof typeof mode] || mode.fast;
  x = Number.parseFloat(x);
  y = Number.parseFloat(y);
  s = Number.parseFloat(s);
  const mn = `m${i}_${mod(n, [n, m, x, y, s])}`,
    mp = vd(path.join("assets/decals/models/", `${mn}.json`)),
    dt = tex(path.join("decals/", `${n}.png`));
  explorable.push(
    `<div class=expl_i>
<b><code>${i} ${n}</code> ${m}</b> <span class=ip>minecraft:give @p paper{CustomModelData:${i}\}</span>
<div class=expl_bg><img src=assets/decals/textures/t${dt}.png class=${m} style=--x:${-x};--y:${-y};--s:${s}></div>
</div>`,
  );
  function gentf(slt: string) {
    return {
      translation: [x * 32, y * 32, -0.03],
      scale: Array(3).fill(
        s * (m === mode.default ? 2 : 1) * (slt === "head" ? 1 : 1),
      ),
      rotation: m === "d" ? [0, 180, 0] : undefined,
    };
  }
  Deno.writeTextFileSync(
    mp,
    JSON.stringify({
      parent: `fuho:${m}`,
      textures: {
        [m === mode.default ? "layer0" : "0"]: `decals:item/t${dt}`,
      },
      display: {
        head: gentf("head"),
        fixed: gentf("frame"),
      },
    }),
  );
  lfs()();

  return {
    predicate: {
      custom_model_data: i,
    },
    model: `decals:${mn}`,
  };
}

const pp = vd(path.join("assets/minecraft/models/item/paper.json"));
Deno.writeTextFileSync(
  pp,
  JSON.stringify({
    parent: "minecraft:item/generated",
    textures: {
      layer0: "minecraft:item/paper",
    },
    overrides: df.map((s) => s.split(" ")).map((i) => add(...i)),
  }),
);
lfs()();
Deno.writeTextFileSync("explore.html", [...explorable, "</div>"].join("\n"));
for (const [k, dn] of Object.entries(textures)) {
  Deno.copyFileSync(
    k,
    vd(path.join("assets/decals/textures/", `item/t${dn}.png`)),
  );
  lfs(`* ${k}`)();
}
