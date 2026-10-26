import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const context = {
  console,
  performance: { now: () => Date.now() },
};
vm.createContext(context);
for (const file of ["js/grid.js", "js/pieces.js", "js/solver.js", "js/analyze.js"]) {
  vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
}
const T = context.Tangram;

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed++;
    console.error("FAIL:", msg);
  }
}

function samePoly(a, b) {
  if (a.length !== b.length) return false;
  const n = a.length;
  for (let shift = 0; shift < n; shift++) {
    let ok = true;
    for (let i = 0; i < n; i++) {
      const p = a[(i + shift) % n];
      if (p[0] !== b[i][0] || p[1] !== b[i][1]) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
    ok = true;
    for (let i = 0; i < n; i++) {
      const p = a[(shift - i + n * 2) % n];
      if (p[0] !== b[i][0] || p[1] !== b[i][1]) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

const counts = {};
for (const type of Object.keys(T.orientations)) {
  counts[type] = T.orientations[type].length;
  for (const ori of T.orientations[type]) {
    const again = T.rasterize(ori.outer);
    assert(again.quarters.length === T.PIECE_QUARTERS[type], type + " raster count " + ori.id);
    const got = new Set(again.quarters.map((q) => q.cx - Math.min(...again.quarters.map((p) => p.cx)) + "," + (q.cy - Math.min(...again.quarters.map((p) => p.cy))) + "," + q.q));
    for (const q of ori.quarters) {
      const minCx = 0;
      assert(got.has(q.cx - minCx + "," + q.cy + "," + q.q) || true, "placeholder");
    }
    const keys = new Set(ori.quarters.map(T.quarterKey));
    let minCx = Infinity;
    let minCy = Infinity;
    again.quarters.forEach((q) => {
      minCx = Math.min(minCx, q.cx);
      minCy = Math.min(minCy, q.cy);
    });
    const keys2 = new Set(again.quarters.map((q) => q.cx - minCx + "," + (q.cy - minCy) + "," + q.q));
    assert(keys.size === keys2.size && [...keys].every((k) => keys2.has(k)), type + " outer matches quarters " + ori.id);
  }
}
console.log("orientations", counts);
assert(counts.square >= 1, "square orientations");
assert(counts.small >= 4, "small orientations");
assert(counts.large >= 4, "large orientations");
assert(counts.para >= 2, "para has a mirror");
assert(T.orientations.para.some((o) => o.flip) && T.orientations.para.some((o) => !o.flip), "para flip both");

function solvePoly(points, limit) {
  const a = T.analyze(points);
  if (!a.ok) return { analysis: a, solved: null };
  const t0 = Date.now();
  const solved = T.solveSync(a.quarters, limit || 300000);
  return { analysis: a, solved, ms: Date.now() - t0 };
}

const diamond = [
  [2, 0],
  [4, 2],
  [2, 4],
  [0, 2],
];
const d = solvePoly(diamond);
console.log("diamond", d.analysis.ok, d.analysis.code, d.analysis.message, d.solved && d.solved.status, d.ms, d.solved && d.solved.nodes, "quarters", d.analysis.quarters && d.analysis.quarters.length);
if (d.solved && d.solved.status === "solved") {
  const present = T.presentSolution(d.analysis.quarters, d.solved.solution);
  console.log(
    "diamond steps",
    present.map((p) => p.label + " r" + p.rot + (p.flip ? " flip" : "")).join(" | ")
  );
  const types = present.map((p) => p.type).sort().join(",");
  assert(types === "large,large,medium,para,small,small,square", "piece multiset " + types);
}

const triangle = [
  [0, 0],
  [4, 0],
  [0, 4],
];
const tri = solvePoly(triangle);
console.log("triangle", tri.analysis.ok, tri.analysis.code, tri.solved && tri.solved.status, tri.ms, tri.solved && tri.solved.nodes);

const rect = [
  [0, 0],
  [4, 0],
  [4, 2],
  [0, 2],
];
const r = solvePoly(rect);
console.log("rect", r.analysis.ok, r.analysis.code, r.solved && r.solved.status, r.ms, r.solved && r.solved.nodes);

const thin = [
  [0, 0],
  [8, 0],
  [8, 1],
  [0, 1],
];
const thinR = solvePoly(thin);
console.log("thin", thinR.analysis.ok, thinR.analysis.code, thinR.solved && thinR.solved.status, thinR.solved && thinR.solved.reason, thinR.ms);

const smallTri = [
  [0, 0],
  [2, 0],
  [0, 2],
];
const st = T.analyze(smallTri);
console.log("small area", st.code, st.areaText, st.message);

const skew = [
  [0, 0],
  [3, 0],
  [2, 2],
];
const sk = T.analyze(skew);
console.log("skew", sk.code, sk.message);

const cross = [
  [0, 0],
  [3, 1],
  [0, 1],
  [3, 0],
];
const cr = T.analyze(cross);
console.log("cross", cr.code);

const candidates = [
  ["diamond", diamond],
  ["triangle", triangle],
  ["rect2x4", rect],
  ["para", [[0, 0], [4, 0], [5, 2], [1, 2]]],
  ["arrow", [[0, 2], [2, 0], [4, 2], [3, 2], [3, 4], [1, 4], [1, 2]]],
  ["house", [[0, 0], [4, 0], [4, 2], [2, 4], [0, 2]]],
  ["chevron", [[0, 0], [2, 0], [2, 2], [4, 2], [4, 4], [2, 4], [2, 2], [0, 2]]],
];

for (const [name, pts] of candidates) {
  const res = solvePoly(pts, 200000);
  console.log(
    name,
    "area",
    res.analysis.areaText,
    "code",
    res.analysis.code,
    "solve",
    res.solved && res.solved.status,
    "nodes",
    res.solved && res.solved.nodes,
    "ms",
    res.ms
  );
}

console.log(failed ? failed + " assertions failed" : "assertions ok");
process.exit(failed ? 1 : 0);
