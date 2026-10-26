var Tangram = globalThis.Tangram || (globalThis.Tangram = {});

(function () {
  "use strict";

  function luminance(r, g, b) {
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  function buildMask(rgba, w, h) {
    const n = w * h;
    let transparent = 0;
    for (let i = 0; i < n; i++) if (rgba[i * 4 + 3] < 128) transparent++;
    const useAlpha = transparent > n * 0.2;
    const mask = new Uint8Array(n);
    let bg = 255;
    if (!useAlpha) {
      const samples = [];
      const m = Math.max(2, Math.min(8, Math.floor(Math.min(w, h) / 8)));
      const corners = [
        [0, 0],
        [w - m, 0],
        [0, h - m],
        [w - m, h - m],
      ];
      for (let c = 0; c < corners.length; c++) {
        const x0 = corners[c][0];
        const y0 = corners[c][1];
        for (let y = y0; y < y0 + m; y++) {
          for (let x = x0; x < x0 + m; x++) {
            const i = (y * w + x) * 4;
            samples.push(rgba[i + 3] < 128 ? 255 : luminance(rgba[i], rgba[i + 1], rgba[i + 2]));
          }
        }
      }
      samples.sort(function (a, b) {
        return a - b;
      });
      bg = samples[samples.length >> 1];
    }
    let count = 0;
    for (let i = 0; i < n; i++) {
      const o = i * 4;
      const a = rgba[o + 3];
      let on = false;
      if (a >= 128) {
        if (useAlpha) on = true;
        else on = Math.abs(luminance(rgba[o], rgba[o + 1], rgba[o + 2]) - bg) > 36;
      }
      if (on) {
        mask[i] = 1;
        count++;
      }
    }
    return { mask: mask, count: count, useAlpha: useAlpha };
  }

  function largestComponent(mask, w, h) {
    const seen = new Uint8Array(mask.length);
    const comps = [];
    const qx = new Int32Array(mask.length);
    const qy = new Int32Array(mask.length);
    for (let i = 0; i < mask.length; i++) {
      if (!mask[i] || seen[i]) continue;
      let qs = 0;
      let qe = 0;
      qx[qe] = i % w;
      qy[qe] = (i / w) | 0;
      qe++;
      seen[i] = 1;
      const pixels = [];
      while (qs < qe) {
        const x = qx[qs];
        const y = qy[qs];
        qs++;
        pixels.push(y * w + x);
        const nbs = [
          [x + 1, y],
          [x - 1, y],
          [x, y + 1],
          [x, y - 1],
        ];
        for (let k = 0; k < 4; k++) {
          const nx = nbs[k][0];
          const ny = nbs[k][1];
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const ni = ny * w + nx;
          if (!mask[ni] || seen[ni]) continue;
          seen[ni] = 1;
          qx[qe] = nx;
          qy[qe] = ny;
          qe++;
        }
      }
      comps.push(pixels);
    }
    comps.sort(function (a, b) {
      return b.length - a.length;
    });
    return comps;
  }

  function holeCount(mask, w, h) {
    const seen = new Uint8Array(mask.length);
    const qx = [];
    const qy = [];
    function push(x, y) {
      if (x < 0 || y < 0 || x >= w || y >= h) return;
      const i = y * w + x;
      if (mask[i] || seen[i]) return;
      seen[i] = 1;
      qx.push(x);
      qy.push(y);
    }
    for (let x = 0; x < w; x++) {
      push(x, 0);
      push(x, h - 1);
    }
    for (let y = 0; y < h; y++) {
      push(0, y);
      push(w - 1, y);
    }
    for (let s = 0; s < qx.length; s++) {
      const x = qx[s];
      const y = qy[s];
      push(x + 1, y);
      push(x - 1, y);
      push(x, y + 1);
      push(x, y - 1);
    }
    let holes = 0;
    for (let i = 0; i < mask.length; i++) if (!mask[i] && !seen[i]) holes++;
    return holes;
  }

  function traceContour(mask, w, h) {
    const adj = new Map();
    function add(ax, ay, bx, by) {
      const ka = ax + "," + ay;
      const kb = bx + "," + by;
      let la = adj.get(ka);
      if (!la) {
        la = [];
        adj.set(ka, la);
      }
      let lb = adj.get(kb);
      if (!lb) {
        lb = [];
        adj.set(kb, lb);
      }
      la.push([bx, by]);
      lb.push([ax, ay]);
    }
    function on(x, y) {
      return x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] === 1;
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!on(x, y)) continue;
        if (!on(x - 1, y)) add(x, y, x, y + 1);
        if (!on(x + 1, y)) add(x + 1, y, x + 1, y + 1);
        if (!on(x, y - 1)) add(x, y, x + 1, y);
        if (!on(x, y + 1)) add(x, y + 1, x + 1, y + 1);
      }
    }
    if (adj.size === 0) return null;
    let start = null;
    adj.forEach(function (_v, k) {
      if (!start) start = k;
    });
    const sp = start.split(",").map(Number);
    const poly = [[sp[0], sp[1]]];
    let prev = null;
    let cur = sp;
    const guard = w * h * 8;
    for (let step = 0; step < guard; step++) {
      const nbs = adj.get(cur[0] + "," + cur[1]) || [];
      let next = null;
      for (let i = 0; i < nbs.length; i++) {
        const nb = nbs[i];
        if (prev && nb[0] === prev[0] && nb[1] === prev[1]) continue;
        next = nb;
        break;
      }
      if (!next) break;
      if (next[0] === sp[0] && next[1] === sp[1]) break;
      poly.push(next);
      prev = cur;
      cur = next;
    }
    return poly;
  }

  function pointLineDist(p, a, b) {
    const vx = b[0] - a[0];
    const vy = b[1] - a[1];
    const len = Math.hypot(vx, vy);
    if (len < 1e-9) return Math.hypot(p[0] - a[0], p[1] - a[1]);
    return Math.abs(vx * (a[1] - p[1]) - vy * (a[0] - p[0])) / len;
  }

  function dpOpen(points, eps) {
    if (points.length < 3) return points.slice();
    const a = points[0];
    const b = points[points.length - 1];
    let maxD = -1;
    let idx = -1;
    for (let i = 1; i < points.length - 1; i++) {
      const d = pointLineDist(points[i], a, b);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (maxD > eps && idx > 0) {
      const left = dpOpen(points.slice(0, idx + 1), eps);
      const right = dpOpen(points.slice(idx), eps);
      return left.slice(0, -1).concat(right);
    }
    return [a, b];
  }

  function dropCollinear(points) {
    if (points.length < 3) return points.slice();
    const out = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[(i + points.length - 1) % points.length];
      const b = points[i];
      const c = points[(i + 1) % points.length];
      const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      if (cross === 0) continue;
      out.push(b);
    }
    return out.length >= 3 ? out : points.slice();
  }

  function simplifyClosed(points, eps) {
    if (points.length <= 4) return points.slice();
    let far = 1;
    let best = -1;
    for (let i = 1; i < points.length; i++) {
      const d = (points[i][0] - points[0][0]) ** 2 + (points[i][1] - points[0][1]) ** 2;
      if (d > best) {
        best = d;
        far = i;
      }
    }
    const left = dpOpen(points.slice(0, far + 1), eps);
    const right = dpOpen(points.slice(far).concat([points[0]]), eps);
    const merged = left.slice(0, -1).concat(right.slice(0, -1));
    return dropCollinear(merged);
  }

  function shoelace(points) {
    let s = 0;
    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      s += a[0] * b[1] - b[0] * a[1];
    }
    return Math.abs(s) / 2;
  }

  function alignAngle(points) {
    let bestT = 0;
    let bestE = Infinity;
    const step = Math.PI / 180 / 2;
    for (let t = 0; t < Math.PI / 4; t += step) {
      let err = 0;
      for (let i = 0; i < points.length; i++) {
        const a = points[i];
        const b = points[(i + 1) % points.length];
        const ang = Math.atan2(b[1] - a[1], b[0] - a[0]) - t;
        const period = Math.PI / 4;
        let m = ((ang % period) + period) % period;
        if (m > period / 2) m = period - m;
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        err += len * m * m;
      }
      if (err < bestE) {
        bestE = err;
        bestT = t;
      }
    }
    return bestT;
  }

  function bestFrac(values, unit) {
    const fr = values.map(function (v) {
      const t = v / unit;
      return t - Math.floor(t);
    });
    let bestF = 0;
    let bestErr = Infinity;
    const cands = fr.concat([0]);
    for (let i = 0; i < cands.length; i++) {
      const f = cands[i];
      let err = 0;
      for (let j = 0; j < fr.length; j++) {
        let d = Math.abs(fr[j] - f);
        if (d > 0.5) d = 1 - d;
        err += d * d;
      }
      if (err < bestErr) {
        bestErr = err;
        bestF = f;
      }
    }
    return bestF;
  }

  function fail(code, message) {
    return { ok: false, code: code, message: message, points: [] };
  }

  function extractSilhouette(rgba, w, h) {
    if (!rgba || w < 12 || h < 12) {
      return fail("small", "图片太小，看不清轮廓。请换一张更大的剪影。");
    }
    const built = buildMask(rgba, w, h);
    if (built.count < 20) {
      return fail("empty", "没有看到一块实心剪影。请上传黑白分明、或带透明底的一块图形。");
    }
    const comps = largestComponent(built.mask, w, h);
    if (!comps.length) return fail("empty", "没有看到一块实心剪影。请上传黑白分明、或带透明底的一块图形。");
    if (comps.length > 1 && comps[1].length > comps[0].length * 0.15) {
      return fail("multi", "图里有不止一块剪影。请只留一块实心图形。");
    }
    const mask = new Uint8Array(w * h);
    for (let i = 0; i < comps[0].length; i++) mask[comps[0][i]] = 1;
    const holes = holeCount(mask, w, h);
    if (holes > Math.max(12, comps[0].length * 0.01)) {
      return fail("hole", "剪影中间有空洞。标准七巧板拼出来的是一整块、中间不留孔。");
    }
    const contour = traceContour(mask, w, h);
    if (!contour || contour.length < 4) {
      return fail("contour", "没能沿着剪影走出外轮廓。");
    }
    const diag = Math.hypot(w, h);
    let simple = dropCollinear(contour);
    let tol = Math.max(1.15, diag * 0.004);
    let simp = simplifyClosed(simple, tol);
    while (simp.length > 64 && tol < diag * 0.04) {
      tol *= 1.35;
      simp = simplifyClosed(simple, tol);
    }
    if (simp.length < 3) return fail("contour", "没能把剪影收成一个多边形。");
    const areaPx = shoelace(simp);
    if (areaPx < 80) return fail("small", "图形太小，看不清轮廓。请换一张更大的剪影。");
    const theta = alignAngle(simp);
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < comps[0].length; i++) {
      const p = comps[0][i];
      cx += p % w;
      cy += (p / w) | 0;
    }
    cx /= comps[0].length;
    cy /= comps[0].length;
    const co = Math.cos(-theta);
    const si = Math.sin(-theta);
    const rotated = simp.map(function (p) {
      const x = p[0] - cx;
      const y = p[1] - cy;
      return [cx + x * co - y * si, cy + x * si + y * co];
    });
    const unit = Math.sqrt(areaPx / Tangram.TARGET_AREA);
    if (unit < 8) return fail("small", "图形太小，吸附到网格后会失真。请换一张更大的剪影。");
    const fx = bestFrac(
      rotated.map(function (p) {
        return p[0];
      }),
      unit
    );
    const fy = bestFrac(
      rotated.map(function (p) {
        return p[1];
      }),
      unit
    );
    let maxErr = 0;
    let sumErr = 0;
    const rounded = rotated.map(function (p) {
      const x = p[0] / unit - fx;
      const y = p[1] / unit - fy;
      const rx = Math.round(x);
      const ry = Math.round(y);
      maxErr = Math.max(maxErr, Math.abs(x - rx), Math.abs(y - ry));
      sumErr += Math.abs(x - rx) + Math.abs(y - ry);
      return [rx, ry];
    });
    const meanErr = sumErr / (rounded.length * 2);
    if (meanErr > 0.18 || maxErr > 0.42) {
      return fail(
        "snap",
        "这张剪影的边角对不齐标准网格，程序没有把它改成另一张图。请换一块本来就能用七巧板拼成的轮廓，或在网格上点顶点。"
      );
    }
    // Pixel y grows downward. World y grows upward, so the picture keeps the same upright pose.
    const upright = rounded.map(function (p) {
      return [p[0], -p[1]];
    });
    let minX = Infinity;
    let minY = Infinity;
    for (let i = 0; i < upright.length; i++) {
      minX = Math.min(minX, upright[i][0]);
      minY = Math.min(minY, upright[i][1]);
    }
    const shifted = upright.map(function (p) {
      return [p[0] - minX, p[1] - minY];
    });
    const cleaned = Tangram.cleanPoints(shifted);
    if (cleaned.length < 3) return fail("contour", "吸附之后没有剩下一块完整图形。");
    return {
      ok: true,
      code: "ok",
      message: "已把剪影的边角吸附到 45° 网格。",
      points: cleaned,
      snapError: meanErr,
    };
  }

  Tangram.extractSilhouette = extractSilhouette;
})();
