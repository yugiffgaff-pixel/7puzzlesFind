import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const context = { console, performance: { now: () => Date.now() } };
vm.createContext(context);
for (const file of ["js/grid.js", "js/pieces.js", "js/solver.js", "js/analyze.js"]) {
  vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
}
const T = context.Tangram;

function keyOf(points) {
  const a = T.analyze(points);
  if (!a.ok && a.code !== "area") {
    return "bad:" + a.code;
  }
  const r = T.rasterize(points);
  if (!r.quarters.length) return "empty";
  let minCx = Infinity, minCy = Infinity;
  r.quarters.forEach((q) => {
    minCx = Math.min(minCx, q.cx);
    minCy = Math.min(minCy, q.cy);
  });
  return r.quarters
    .map((q) => q.cx - minCx + "," + (q.cy - minCy) + "," + q.q)
    .sort()
    .join(";");
}

const known = {};
for (const type of Object.keys(T.orientations)) {
  known[type] = new Set(T.orientations[type].map((o) => o.key));
}

function checkTriangles(leg2, hyp2, type, lo, hi) {
  const pts = [];
  for (let x = lo; x <= hi; x++) for (let y = lo; y <= hi; y++) pts.push([x, y]);
  let found = 0;
  let missing = 0;
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      for (let k = j + 1; k < pts.length; k++) {
        const d = [
          dist2(pts[i], pts[j]),
          dist2(pts[j], pts[k]),
          dist2(pts[k], pts[i]),
        ].sort((a, b) => a - b);
        if (d[0] !== leg2 || d[1] !== leg2 || d[2] !== hyp2) continue;
        const key = keyOf([pts[i], pts[j], pts[k]]);
        if (key.startsWith("bad") || key === "empty") {
          missing++;
          if (missing < 5) console.log("unrasterized", type, pts[i], pts[j], pts[k], key);
          continue;
        }
        found++;
        if (!known[type].has(key)) {
          missing++;
          if (missing < 8) console.log("MISSING", type, pts[i], pts[j], pts[k], key);
        }
      }
    }
  }
  console.log(type, "lattice triangles", found, "missing", missing);
}

function dist2(a, b) {
  const dx = a[0] - b[0], dy = a[1] - b[1];
  return dx * dx + dy * dy;
}

checkTriangles(1, 2, "small", 0, 4);
checkTriangles(2, 4, "medium", 0, 5);
checkTriangles(4, 8, "large", 0, 6);

// squares side 1
let squares = 0;
let squareMiss = 0;
for (let x = 0; x <= 4; x++) {
  for (let y = 0; y <= 4; y++) {
    const poly = [[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1]];
    const key = keyOf(poly);
    squares++;
    if (!known.square.has(key)) {
      squareMiss++;
      console.log("MISSING square", poly, key);
    }
  }
}
console.log("squares", squares, "missing", squareMiss);

// parallelograms: sides 1 and sqrt2 (dist2 1 and 2), angles via cross
let paras = 0;
let paraMiss = 0;
const pts = [];
for (let x = 0; x <= 5; x++) for (let y = 0; y <= 5; y++) pts.push([x, y]);
for (const a of pts) {
  for (const b of pts) {
    if (dist2(a, b) !== 1) continue;
    for (const d of pts) {
      if (dist2(a, d) !== 2) continue;
      const vx = b[0] - a[0], vy = b[1] - a[1];
      const ux = d[0] - a[0], uy = d[1] - a[1];
      const cross = vx * uy - vy * ux;
      const dot = vx * ux + vy * uy;
      if (Math.abs(cross) !== 1 || dot !== 1) continue;
      const c = [b[0] + ux, b[1] + uy];
      const poly = [a, b, c, d];
      if (c[0] < 0 || c[1] < 0 || c[0] > 7 || c[1] > 7) continue;
      const key = keyOf(poly);
      paras++;
      if (!known.para.has(key)) {
        paraMiss++;
        if (paraMiss < 8) console.log("MISSING para", poly, key);
      }
    }
  }
}
console.log("paras", paras, "missing", paraMiss);
