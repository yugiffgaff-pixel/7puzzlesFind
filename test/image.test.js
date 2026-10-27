import fs from "fs";
import path from "path";
import vm from "vm";
import zlib from "zlib";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const context = { console, performance: { now: () => Date.now() }, Uint8Array, Int16Array };
vm.createContext(context);
for (const file of ["js/grid.js", "js/pieces.js", "js/solver.js", "js/analyze.js", "js/geom.js", "js/image.js", "js/figures.js"]) {
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

function blank(w, h, rgba) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = rgba[0];
    data[i * 4 + 1] = rgba[1];
    data[i * 4 + 2] = rgba[2];
    data[i * 4 + 3] = 255;
  }
  return data;
}

function fillPoly(data, w, h, points, rgb) {
  let minX = w, minY = h, maxX = 0, maxY = 0;
  points.forEach((p) => {
    minX = Math.min(minX, p[0]);
    minY = Math.min(minY, p[1]);
    maxX = Math.max(maxX, p[0]);
    maxY = Math.max(maxY, p[1]);
  });
  minX = Math.max(0, Math.floor(minX));
  minY = Math.max(0, Math.floor(minY));
  maxX = Math.min(w - 1, Math.ceil(maxX));
  maxY = Math.min(h - 1, Math.ceil(maxY));
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (!inside(x + 0.5, y + 0.5, points)) continue;
      const i = (y * w + x) * 4;
      data[i] = rgb[0];
      data[i + 1] = rgb[1];
      data[i + 2] = rgb[2];
      data[i + 3] = 255;
    }
  }
}

function inside(x, y, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1];
    const xj = poly[j][0], yj = poly[j][1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

function decodePng(buf) {
  const input = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  let p = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat = [];
  while (p < input.length) {
    const len = input.readUInt32BE(p);
    p += 4;
    const type = input.toString("ascii", p, p + 4);
    p += 4;
    const data = input.subarray(p, p + len);
    p += len + 4;
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
  }
  if (bitDepth !== 8 || (colorType !== 6 && colorType !== 2)) throw new Error("unsupported png");
  const bpp = colorType === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const out = new Uint8Array(width * height * 4);
  const prev = Buffer.alloc(stride);
  const row = Buffer.alloc(stride);
  let src = 0;
  function paeth(a, b, c) {
    const pred = a + b - c;
    const pa = Math.abs(pred - a);
    const pb = Math.abs(pred - b);
    const pc = Math.abs(pred - c);
    if (pa <= pb && pa <= pc) return a;
    if (pb <= pc) return b;
    return c;
  }
  for (let y = 0; y < height; y++) {
    const filter = raw[src++];
    for (let i = 0; i < stride; i++) row[i] = raw[src++];
    for (let i = 0; i < stride; i++) {
      const left = i >= bpp ? row[i - bpp] : 0;
      const up = prev[i];
      const ul = i >= bpp ? prev[i - bpp] : 0;
      if (filter === 1) row[i] = (row[i] + left) & 255;
      else if (filter === 2) row[i] = (row[i] + up) & 255;
      else if (filter === 3) row[i] = (row[i] + ((left + up) >> 1)) & 255;
      else if (filter === 4) row[i] = (row[i] + paeth(left, up, ul)) & 255;
      else if (filter !== 0) throw new Error("png filter " + filter);
    }
    row.copy(prev);
    for (let x = 0; x < width; x++) {
      const s = x * bpp;
      const o = (y * width + x) * 4;
      out[o] = row[s];
      out[o + 1] = bpp > 1 ? row[s + 1] : row[s];
      out[o + 2] = bpp > 2 ? row[s + 2] : row[s];
      out[o + 3] = bpp === 4 ? row[s + 3] : 255;
    }
  }
  return { width, height, data: out };
}

function normSig(points) {
  const a = T.analyze(points);
  if (!a.ok) return a.code + ":" + a.message;
  let minX = Infinity, minY = Infinity;
  a.quarters.forEach((q) => {
    minX = Math.min(minX, q.cx);
    minY = Math.min(minY, q.cy);
  });
  return a.quarters
    .map((q) => q.cx - minX + "," + (q.cy - minY) + "," + q.q)
    .sort()
    .join(";");
}

T.prepareFigures();
for (const fig of T.FIGURES) {
  assert(fig.ready && fig.ready.steps.length === 7, fig.name + " solves in 7 steps");
  const covered = new Set();
  let overlap = false;
  for (const step of fig.ready.steps) {
    const r = T.rasterize(step.outer);
    for (const q of r.quarters) {
      const k = T.quarterKey(q);
      if (covered.has(k)) overlap = true;
      covered.add(k);
    }
  }
  const target = new Set(fig.ready.analysis.quarters.map(T.quarterKey));
  assert(!overlap && covered.size === target.size && [...target].every((k) => covered.has(k)), fig.name + " pieces cover the outline");
  const types = fig.ready.steps.map((s) => s.type).sort().join(",");
  assert(types === "large,large,medium,para,small,small,square", fig.name + " multiset " + types);
  console.log(fig.name, "ok", fig.ready.steps.map((s) => s.label).join(" → "));
}

const thin = T.analyze(T.SAMPLE_FAIL.points);
assert(thin.ok, "thin is grid area 8");
const thinSol = T.solveSync(thin.quarters, 50000);
assert(thinSol.status === "none", "thin unsolved " + thinSol.status + " " + thinSol.reason);

// rectangle silhouette
{
  const w = 120, h = 80;
  const data = blank(w, h, [255, 255, 255]);
  for (let y = 20; y < 40; y++) {
    for (let x = 30; x < 70; x++) {
      const i = (y * w + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 0;
    }
  }
  const ex = T.extractSilhouette(data, w, h);
  console.log("rect extract", ex.ok, ex.code, ex.message, ex.points);
  assert(ex.ok, "rect extract");
  const a = T.analyze(ex.points);
  assert(a.ok, "rect analyze " + a.code + " " + a.message);
  const sig = normSig(ex.points);
  const expect = normSig([[0, 0], [4, 0], [4, 2], [0, 2]]);
  assert(sig === expect, "rect shape matches");
}

// diamond, white on black, slightly rotated
{
  const w = 220, h = 220;
  const data = blank(w, h, [20, 20, 20]);
  const unit = 28;
  const cx = 110, cy = 110;
  const ang = (12 * Math.PI) / 180;
  const base = [[2, 0], [4, 2], [2, 4], [0, 2]];
  const poly = base.map((p) => {
    const x = (p[0] - 2) * unit;
    const y = (p[1] - 2) * unit;
    const co = Math.cos(ang), si = Math.sin(ang);
    return [cx + x * co - y * si, cy + x * si + y * co];
  });
  fillPoly(data, w, h, poly, [245, 245, 245]);
  const ex = T.extractSilhouette(data, w, h);
  console.log("diamond extract", ex.ok, ex.code, ex.points, "err", ex.snapError);
  assert(ex.ok, "diamond extract " + (ex.message || ""));
  const sig = normSig(ex.points);
  const expect = normSig(base);
  assert(sig === expect, "diamond shape matches\n got " + sig + "\n exp " + expect);
}

// house from black on white
{
  const w = 240, h = 200;
  const data = blank(w, h, [250, 250, 248]);
  const unit = 32;
  const house = T.FIGURES.find((f) => f.id === "house").points;
  const poly = house.map((p) => [28 + p[0] * unit, 170 - p[1] * unit]);
  fillPoly(data, w, h, poly, [10, 10, 10]);
  const ex = T.extractSilhouette(data, w, h);
  console.log("house extract", ex.ok, ex.code, ex.points, ex.snapError);
  assert(ex.ok, "house extract " + (ex.message || ""));
  assert(normSig(ex.points) === normSig(house), "house shape");
  const solved = T.solveSync(T.analyze(ex.points).quarters);
  assert(solved.status === "solved", "house from image solves");
}

// circle should not be forced
{
  const w = 160, h = 160;
  const data = blank(w, h, [255, 255, 255]);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x - 80, dy = y - 80;
      if (dx * dx + dy * dy < 50 * 50) {
        const i = (y * w + x) * 4;
        data[i] = data[i + 1] = data[i + 2] = 0;
      }
    }
  }
  const ex = T.extractSilhouette(data, w, h);
  console.log("circle", ex.ok, ex.code, ex.message);
  assert(!ex.ok && ex.code === "snap", "circle rejected");
}

// Same diamond, turned the other way. Alignment must not spin it by 45°.
{
  const w = 220, h = 220;
  const data = blank(w, h, [20, 20, 20]);
  const unit = 28;
  const cx = 110, cy = 110;
  const ang = (-12 * Math.PI) / 180;
  const base = [[2, 0], [4, 2], [2, 4], [0, 2]];
  const poly = base.map((p) => {
    const x = (p[0] - 2) * unit;
    const y = (p[1] - 2) * unit;
    const co = Math.cos(ang), si = Math.sin(ang);
    return [cx + x * co - y * si, cy + x * si + y * co];
  });
  fillPoly(data, w, h, poly, [245, 245, 245]);
  const ex = T.extractSilhouette(data, w, h);
  console.log("diamond -12", ex.ok, ex.code, ex.points, "err", ex.snapError);
  assert(ex.ok, "negative diamond extract " + (ex.message || ""));
  assert(normSig(ex.points) === normSig(base), "negative diamond shape");
}

// House drawn at a scale that is not an integer number of pixels per unit.
{
  const w = 280, h = 260;
  const data = blank(w, h, [250, 250, 248]);
  const unit = 19.4;
  const ang = (-8 * Math.PI) / 180;
  const house = T.FIGURES.find((f) => f.id === "house").points;
  const cx = 140, cy = 130;
  const poly = house.map((p) => {
    const x = (p[0] - 2) * unit;
    const y = (p[1] - 1.5) * unit;
    const co = Math.cos(ang), si = Math.sin(ang);
    const rx = x * co - y * si;
    const ry = x * si + y * co;
    return [cx + rx, cy - ry];
  });
  fillPoly(data, w, h, poly, [10, 10, 10]);
  const ex = T.extractSilhouette(data, w, h);
  console.log("odd house", ex.ok, ex.code, ex.points, ex.snapError);
  assert(ex.ok, "odd-scale house " + (ex.message || ""));
  assert(normSig(ex.points) === normSig(house), "odd-scale house shape");
}

// Screenshot of a finished tree: pixel size is not a clean multiple of the unit,
// and the fringe is anti-aliased.
{
  const png = decodePng(fs.readFileSync(path.join(root, "test/fixtures/tree-silhouette.png")));
  const ex = T.extractSilhouette(png.data, png.width, png.height);
  console.log("tree", ex.ok, ex.code, ex.message, ex.points, ex.snapError);
  assert(ex.ok, "tree extract " + (ex.message || ""));
  assert(ex.exact, "tree keeps an off-grid outline");
  const tree = [
    [4, 2], [3, 2], [4, 1], [2.5, 1], [2.5, 0], [1.5, 0], [1.5, 1], [0, 1], [1, 2], [0, 2], [2, 4],
  ];
  function sig(points) {
    const pts = points.map((p) => [Math.round(p[0] * 1000) / 1000, Math.round(p[1] * 1000) / 1000]);
    let start = 0;
    for (let i = 1; i < pts.length; i++) {
      if (pts[i][0] < pts[start][0] - 1e-9 || (Math.abs(pts[i][0] - pts[start][0]) < 1e-9 && pts[i][1] < pts[start][1])) start = i;
    }
    const ordered = [];
    for (let i = 0; i < pts.length; i++) ordered.push(pts[(start + i) % pts.length]);
    return ordered.map((p) => p[0] + "," + p[1]).join(";");
  }
  assert(sig(ex.points) === sig(tree), "tree keeps the centered trunk\n got " + sig(ex.points) + "\n exp " + sig(tree));
  const solved = T.solveGeom(ex.exact, 20000);
  assert(solved.status === "solved" && solved.solution.length === 7, "tree solves " + solved.status);
  const apex = ex.points.reduce((a, p) => (p[1] > a[1] ? p : a));
  const trunk = solved.solution.find((piece) => piece.type === "square");
  const txs = trunk.outer.map((p) => p[0]);
  const mid = (Math.min.apply(null, txs) + Math.max.apply(null, txs)) / 2;
  assert(Math.abs(mid - apex[0]) < 1e-6, "trunk center " + mid + " lines up with the apex " + apex[0]);
}

// Shirt silhouette from the same batch: a lattice tangram, still solves.
{
  const png = decodePng(fs.readFileSync(path.join(root, "test/fixtures/shirt-silhouette.png")));
  const ex = T.extractSilhouette(png.data, png.width, png.height);
  console.log("shirt", ex.ok, ex.code, ex.message, ex.points, ex.snapError);
  assert(ex.ok && !ex.exact, "shirt stays on the integer grid");
  const solved = T.solveSync(T.analyze(ex.points).quarters);
  assert(solved.status === "solved" && solved.solution.length === 7, "shirt solves " + solved.status);
}

// Hen silhouette: edges are already on the 45° family, but the beak is shorter
// than the smallest piece. Do not report that as a grid-alignment failure,
// and do not replace it with a different figure.
{
  const png = decodePng(fs.readFileSync(path.join(root, "test/fixtures/hen-silhouette.png")));
  const ex = T.extractSilhouette(png.data, png.width, png.height);
  console.log("hen", ex.ok, ex.code, ex.message);
  assert(!ex.ok && ex.code === "shape", "hen is a 45° outline that is not a tangram");
  assert(ex.message.indexOf("比最小的那块三角还短") >= 0, "hen explains the short edge");
  assert(ex.message.indexOf("对不齐标准网格") < 0, "hen is not blamed on the grid");
}

// two blobs
{
  const w = 120, h = 80;
  const data = blank(w, h, [255, 255, 255]);
  for (let y = 10; y < 40; y++) for (let x = 10; x < 40; x++) data[(y * w + x) * 4] = 0;
  for (let y = 10; y < 40; y++) for (let x = 70; x < 100; x++) data[(y * w + x) * 4] = 0;
  const ex = T.extractSilhouette(data, w, h);
  console.log("multi", ex.code, ex.message);
  assert(ex.code === "multi", "two shapes");
}

// closest: a square with a bite still prefers 正方形, and the thin bar is not solved
{
  const partial = T.rasterize([[0, 0], [3, 0], [3, 2], [0, 2]]).quarters;
  const near = T.closestFigure(partial);
  console.log("closest partial rect", near && near.name, near && near.iou.toFixed(2));
  assert(near && near.iou > 0.4, "closest has a score");
}

console.log(failed ? failed + " failed" : "image tests ok");
process.exit(failed ? 1 : 0);
