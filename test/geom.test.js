import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const context = { console, performance: { now: () => Date.now() } };
vm.createContext(context);
for (const file of ["js/grid.js", "js/pieces.js", "js/solver.js", "js/analyze.js", "js/geom.js", "js/figures.js"]) {
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

function P(x, y) {
  return T.exactPoint(T.num(Math.round(x * 2), 0, 2), T.num(Math.round(y * 2), 0, 2));
}

assert(T.geomOriCounts.square === 2, "square has axis and diamond orientations, got " + T.geomOriCounts.square);
assert(T.geomOriCounts.large === 8, "large orientations");
assert(T.geomOriCounts.para === 8, "para orientations " + T.geomOriCounts.para);

function solve(poly, label, limit) {
  const t0 = Date.now();
  const res = T.solveGeom(poly, limit || 20000);
  console.log(label, res.status, "nodes", res.nodes, "ms", Date.now() - t0);
  assert(res.status === "solved" && res.solution && res.solution.length === 7, label + " " + res.status + " nodes " + res.nodes);
  return res;
}

solve([P(0, 0), P(4, 0), P(4, 2), P(0, 2)], "rect");
solve([P(0, 0), P(4, 0), P(0, 4)], "triangle");
solve([P(2, 0), P(4, 2), P(2, 4), P(0, 2)], "diamond");

const tree = [
  [0, 4], [-2, 2], [-1, 2], [-2, 1], [-0.5, 1], [-0.5, 0],
  [0.5, 0], [0.5, 1], [2, 1], [1, 2], [2, 2],
].map((xy) => P(xy[0], xy[1]));
const treeSol = solve(tree, "centered tree");
const trunk = treeSol.solution && treeSol.solution.find((piece) => piece.type === "square");
assert(trunk, "centered tree places the square");
const txs = trunk ? trunk.outer.map((pt) => pt[0]) : [0];
const trunkMid = (Math.min.apply(null, txs) + Math.max.apply(null, txs)) / 2;
assert(Math.abs(trunkMid) < 1e-6, "trunk stays centered under the apex, mid " + trunkMid);

T.prepareFigures();
for (const fig of T.FIGURES) {
  solve(fig.points.map((pt) => P(pt[0], pt[1])), fig.name);
}

const stepped = T.startGeom([P(0, 0), P(4, 0), P(4, 2), P(0, 2)], 20000);
let guard = 0;
while (stepped.status === "running" && guard++ < 100) T.stepGeom(stepped, 3);
assert(stepped.status === "solved", "stepped rect " + stepped.status);

console.log(failed ? failed + " failed" : "geom tests ok");
process.exit(failed ? 1 : 0);
