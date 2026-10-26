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

function rng(seed) {
  let s = seed >>> 0;
  return function () {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function keyOf(q) {
  return q.cx + "," + q.cy + "," + q.q;
}

function touches(qs, occupied) {
  for (let i = 0; i < qs.length; i++) {
    const nbs = T.neighborsOf(qs[i]);
    for (let k = 0; k < nbs.length; k++) {
      if (occupied.has(keyOf(nbs[k]))) return true;
    }
  }
  return false;
}

function assemble(seed) {
  const rand = rng(seed);
  const types = ["large", "large", "medium", "square", "para", "small", "small"];
  const occupied = new Map();
  const placed = [];

  function search(idx) {
    if (idx === types.length) return true;
    const oris = T.orientations[types[idx]];
    const cands = [];
    for (let o = 0; o < oris.length; o++) {
      for (let dx = -1; dx <= 6; dx++) {
        for (let dy = -1; dy <= 6; dy++) cands.push({ o: o, dx: dx, dy: dy });
      }
    }
    for (let i = cands.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const tmp = cands[i];
      cands[i] = cands[j];
      cands[j] = tmp;
    }
    const limit = idx === 0 ? 1 : 120;
    for (let n = 0; n < cands.length && n < limit; n++) {
      const c = cands[n];
      const ori = oris[c.o];
      const qs = ori.quarters.map(function (q) {
        return { cx: q.cx + c.dx, cy: q.cy + c.dy, q: q.q };
      });
      let hit = false;
      for (let i = 0; i < qs.length; i++) {
        if (occupied.has(keyOf(qs[i]))) {
          hit = true;
          break;
        }
      }
      if (hit) continue;
      if (idx > 0 && !touches(qs, occupied)) continue;
      for (let i = 0; i < qs.length; i++) occupied.set(keyOf(qs[i]), 1);
      placed.push({
        type: types[idx],
        flip: ori.flip,
        rot: ori.rot,
        outer: ori.outer.map(function (p) {
          return [p[0] + c.dx, p[1] + c.dy];
        }),
      });
      if (search(idx + 1)) return true;
      placed.pop();
      for (let i = 0; i < qs.length; i++) occupied.delete(keyOf(qs[i]));
    }
    return false;
  }

  if (!search(0)) return null;
  const quarters = [];
  occupied.forEach(function (_, k) {
    const p = k.split(",").map(Number);
    quarters.push({ cx: p[0], cy: p[1], q: p[2] });
  });
  const loops = T.traceOutline(quarters);
  if (loops.length !== 1) return null;
  const analysis = T.analyze(loops[0]);
  if (!analysis.ok) return null;
  const solved = T.solveSync(analysis.quarters, 100000);
  if (!solved || solved.status !== "solved") return null;
  const present = T.presentSolution(analysis.quarters, solved.solution);
  let minX = Infinity, minY = Infinity;
  analysis.points.forEach(function (p) {
    minX = Math.min(minX, p[0]);
    minY = Math.min(minY, p[1]);
  });
  function shift(poly) {
    return poly.map(function (p) {
      return [p[0] - minX, p[1] - minY];
    });
  }
  const sig = analysis.quarters
    .map(function (q) {
      return q.cx - minX + "," + (q.cy - minY) + "," + q.q;
    })
    .sort()
    .join(";");
  return {
    points: shift(analysis.points),
    pieces: present.map(function (p) {
      return { type: p.type, color: p.color, outer: shift(p.outer), label: p.label };
    }),
    sig: sig,
  };
}

const handmade = [
  { name: "正方形", points: [[2, 0], [4, 2], [2, 4], [0, 2]] },
  { name: "直角三角形", points: [[0, 0], [4, 0], [0, 4]] },
  { name: "矩形", points: [[0, 0], [4, 0], [4, 2], [0, 2]] },
  { name: "箭头", points: [[0, 2], [2, 0], [4, 2], [3, 2], [3, 4], [1, 4], [1, 2]] },
  { name: "小屋", points: [[0, 0], [4, 0], [4, 1], [2, 3], [0, 1]] },
  { name: "长条加头", points: [[0, 0], [6, 0], [6, 1], [4, 1], [4, 2], [2, 2], [2, 1], [0, 1]] },
];

const gallery = [];
for (const item of handmade) {
  const a = T.analyze(item.points);
  const solved = a.ok ? T.solveSync(a.quarters, 200000) : null;
  console.log("hand", item.name, a.ok ? a.code : a.code + " " + a.message, solved && solved.status, solved && solved.nodes);
  if (a.ok && solved && solved.status === "solved") {
    const present = T.presentSolution(a.quarters, solved.solution);
    gallery.push({
      name: item.name,
      points: a.points,
      pieces: present.map((p) => ({ type: p.type, color: p.color, outer: p.outer, label: p.label, rot: p.rot, flip: p.flip })),
    });
  }
}

const seen = new Set(gallery.map((g) => JSON.stringify(g.points)));
let made = 0;
for (let seed = 1; seed <= 400 && gallery.length < 28; seed++) {
  const fig = assemble(seed);
  if (!fig) continue;
  made++;
  if (seen.has(fig.sig)) continue;
  seen.add(fig.sig);
  gallery.push({ name: "随机" + gallery.length, points: fig.points, pieces: fig.pieces });
}
console.log("assembled ok", made, "gallery", gallery.length);
fs.writeFileSync("/tmp/tangram-gallery.json", JSON.stringify(gallery));
