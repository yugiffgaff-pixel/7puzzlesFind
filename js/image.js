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

  function periodResidual(ang) {
    const period = Math.PI / 4;
    let m = ((ang % period) + period) % period;
    if (m > period / 2) m = period - m;
    return m;
  }

  function angleEnergy(points, theta) {
    let err = 0;
    let lenSum = 0;
    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const m = periodResidual(Math.atan2(b[1] - a[1], b[0] - a[0]) - theta);
      err += len * m * m;
      lenSum += len;
    }
    return { err: err, len: lenSum };
  }

  // Smallest rotation that puts edges on the horizontal / vertical / 45° family.
  // Searching a full 45° would spin an already upright figure onto its diagonal.
  function alignmentOptions(points) {
    const step = Math.PI / 180 / 2;
    const limit = Math.PI / 8;
    let bestT = 0;
    let bestE = Infinity;
    let perim = 1;
    const samples = [];
    for (let t = -limit; t <= limit + 1e-9; t += step) {
      const scored = angleEnergy(points, t);
      perim = scored.len;
      samples.push([t, scored.err]);
      if (scored.err < bestE) {
        bestE = scored.err;
        bestT = t;
      }
    }
    function refine(center) {
      let tBest = center;
      let eBest = angleEnergy(points, center).err;
      const fine = Math.PI / 180 / 20;
      for (let t = center - step; t <= center + step; t += fine) {
        if (t < -limit - 1e-9 || t > limit + 1e-9) continue;
        const e = angleEnergy(points, t).err;
        if (e < eBest) {
          eBest = e;
          tBest = t;
        }
      }
      return tBest;
    }
    bestT = refine(bestT);
    const options = [bestT];
    let secondT = null;
    let secondE = Infinity;
    for (let i = 0; i < samples.length; i++) {
      const t = samples[i][0];
      const e = samples[i][1];
      if (Math.abs(t - bestT) < Math.PI / 18) continue;
      if (e < secondE) {
        secondE = e;
        secondT = t;
      }
    }
    if (secondT !== null && Math.sqrt(secondE / perim) < 0.05) {
      options.push(refine(secondT));
    }
    return options;
  }

  function contourBulge(contour, simplified) {
    const idx = indicesOf(contour, simplified);
    if (!idx) return { max: Infinity, mean: Infinity };
    let maxB = 0;
    let wsum = 0;
    let w = 0;
    for (let i = 0; i < idx.length; i++) {
      const nxt = (i + 1) % idx.length;
      const pts = chainBetween(contour, idx[i], idx[nxt]);
      const a = simplified[i];
      const b = simplified[nxt];
      let edgeMax = 0;
      for (let k = 0; k < pts.length; k++) {
        const d = pointLineDist(pts[k], a, b);
        if (d > edgeMax) edgeMax = d;
      }
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (edgeMax > maxB) maxB = edgeMax;
      wsum += len * edgeMax;
      w += len;
    }
    return { max: maxB, mean: w === 0 ? 0 : wsum / w };
  }

  // A small circle collapses to an octagon before the bow in each chord is obvious.
  // Tangram edges come in lengths 1 and √2, so they are not all the same.
  function roundLikeACircle(points, bulgeMean) {
    if (points.length < 7 || bulgeMean < 0.6) return false;
    let minL = Infinity;
    let maxL = 0;
    let n = 0;
    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < 2) continue;
      n++;
      if (len < minL) minL = len;
      if (len > maxL) maxL = len;
    }
    return n >= 6 && minL > 0 && maxL / minL < 1.28;
  }

  function edgeAngleError(points) {
    let wsum = 0;
    let w = 0;
    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < 1e-6) continue;
      wsum += len * periodResidual(Math.atan2(b[1] - a[1], b[0] - a[0]));
      w += len;
    }
    return w === 0 ? Math.PI : wsum / w;
  }

  function rotateAround(points, cx, cy, co, si) {
    const out = new Array(points.length);
    for (let i = 0; i < points.length; i++) {
      const x = points[i][0] - cx;
      const y = points[i][1] - cy;
      out[i] = [cx + x * co - y * si, cy + x * si + y * co];
    }
    return out;
  }

  // On the circle R/Z, center the tightest arc that covers every fractional part.
  // Equal gaps (a coordinate and the same coordinate plus half a unit) both get returned,
  // because rounding one of them can collapse a real edge.
  function offsetCandidates(values, unit) {
    const n = values.length;
    const fr = new Array(n);
    for (let i = 0; i < n; i++) {
      const t = values[i] / unit;
      fr[i] = t - Math.floor(t);
    }
    fr.sort(function (a, b) {
      return a - b;
    });
    const gaps = new Array(n);
    for (let i = 0; i < n - 1; i++) gaps[i] = { gap: fr[i + 1] - fr[i], startAt: i + 1 };
    gaps[n - 1] = { gap: fr[0] + 1 - fr[n - 1], startAt: 0 };
    gaps.sort(function (a, b) {
      return b.gap - a.gap;
    });
    const out = [];
    for (let i = 0; i < gaps.length && i < 2; i++) {
      if (i > 0 && gaps[0].gap - gaps[i].gap > 0.04) break;
      const span = 1 - gaps[i].gap;
      const start = fr[gaps[i].startAt];
      const mid = start + span / 2;
      const f = mid - Math.floor(mid);
      let dup = false;
      for (let k = 0; k < out.length; k++) {
        const d = Math.abs(out[k].f - f);
        if (Math.min(d, 1 - d) < 0.01) dup = true;
      }
      if (dup) continue;
      let sum = 0;
      let maxE = 0;
      for (let j = 0; j < n; j++) {
        const w = values[j] / unit - f;
        const e = Math.abs(w - Math.round(w));
        if (e > maxE) maxE = e;
        sum += e;
      }
      out.push({ f: f, max: maxE, mean: sum / n });
    }
    return out;
  }

  function indicesOf(contour, simplified) {
    const idx = [];
    let cursor = 0;
    for (let s = 0; s < simplified.length; s++) {
      const p = simplified[s];
      let found = -1;
      for (let k = 0; k < contour.length; k++) {
        const j = (cursor + k) % contour.length;
        if (contour[j][0] === p[0] && contour[j][1] === p[1]) {
          found = j;
          break;
        }
      }
      if (found < 0) return null;
      idx.push(found);
      cursor = found;
    }
    return idx;
  }

  function chainBetween(contour, i0, i1) {
    const pts = [];
    let i = i0;
    for (let guard = 0; guard <= contour.length; guard++) {
      pts.push(contour[i]);
      if (i === i1) break;
      i = (i + 1) % contour.length;
    }
    return pts;
  }

  function fitEdge(points, a, b) {
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const snapped = Math.round(ang / (Math.PI / 4)) * (Math.PI / 4);
    const dx = Math.cos(snapped);
    const dy = Math.sin(snapped);
    const nx = -dy;
    const ny = dx;
    const offs = new Array(points.length);
    for (let i = 0; i < points.length; i++) offs[i] = points[i][0] * nx + points[i][1] * ny;
    offs.sort(function (p, q) {
      return p - q;
    });
    return { nx: nx, ny: ny, c: offs[offs.length >> 1] };
  }

  function intersectLines(l1, l2) {
    const det = l1.nx * l2.ny - l2.nx * l1.ny;
    if (Math.abs(det) < 1e-8) return null;
    return [(l1.c * l2.ny - l2.c * l1.ny) / det, (l1.nx * l2.c - l2.nx * l1.c) / det];
  }

  // Stairs and a one-pixel fringe pull corners off the true edge.
  // Fit each simplified edge to the nearest 45° direction, then take intersections.
  function refitCorners(contour, simplified, unit0) {
    const idx = indicesOf(contour, simplified);
    if (!idx) return simplified.map(function (p) { return p.slice(); });
    const lines = [];
    for (let i = 0; i < idx.length; i++) {
      const nxt = (i + 1) % idx.length;
      const pts = chainBetween(contour, idx[i], idx[nxt]);
      lines.push(fitEdge(pts, simplified[i], simplified[nxt]));
    }
    const corners = [];
    const limit = Math.max(unit0 * 0.55, 3);
    for (let i = 0; i < lines.length; i++) {
      const prev = lines[(i + lines.length - 1) % lines.length];
      const hit = intersectLines(prev, lines[i]);
      if (!hit || Math.hypot(hit[0] - simplified[i][0], hit[1] - simplified[i][1]) > limit) {
        corners.push(simplified[i].slice());
      } else {
        corners.push(hit);
      }
    }
    return corners;
  }

  function snapCandidates(rotated, unit0) {
    const xs = new Array(rotated.length);
    const ys = new Array(rotated.length);
    for (let i = 0; i < rotated.length; i++) {
      xs[i] = rotated[i][0];
      ys[i] = rotated[i][1];
    }
    const found = [];
    function pushScale(unit) {
      const oxs = offsetCandidates(xs, unit);
      const oys = offsetCandidates(ys, unit);
      for (let a = 0; a < oxs.length; a++) {
        for (let b = 0; b < oys.length; b++) {
          const ox = oxs[a];
          const oy = oys[b];
          const maxErr = Math.max(ox.max, oy.max);
          const meanErr = (ox.mean + oy.mean) / 2;
          const rounded = new Array(rotated.length);
          for (let i = 0; i < rotated.length; i++) {
            rounded[i] = [Math.round(rotated[i][0] / unit - ox.f), Math.round(rotated[i][1] / unit - oy.f)];
          }
          found.push({
            unit: unit,
            fx: ox.f,
            fy: oy.f,
            maxErr: maxErr,
            meanErr: meanErr,
            rounded: rounded,
          });
        }
      }
    }
    for (let s = 0.8; s <= 1.22 + 1e-9; s += 0.008) pushScale(unit0 * s);
    found.sort(function (a, b) {
      return a.maxErr - b.maxErr || a.meanErr - b.meanErr;
    });
    const seeds = [];
    for (let i = 0; i < found.length && seeds.length < 3; i++) {
      if (seeds.every(function (u) { return Math.abs(u - found[i].unit) / unit0 > 0.02; })) seeds.push(found[i].unit);
    }
    for (let i = 0; i < seeds.length; i++) {
      for (let d = -0.012; d <= 0.012 + 1e-9; d += 0.002) pushScale(seeds[i] + unit0 * d);
    }
    return found;
  }

  function pointInPolyFloat(x, y, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0];
      const yi = poly[i][1];
      const xj = poly[j][0];
      const yj = poly[j][1];
      const cross = (xj - xi) * (y - yi) - (yj - yi) * (x - xi);
      if (Math.abs(cross) < 1e-8) {
        const dot = (x - xi) * (x - xj) + (y - yi) * (y - yj);
        if (dot <= 1e-6) return true;
      }
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  function moduleFit(corners) {
    const fit = Tangram.fitModulePolygon(corners);
    if (!fit) return null;
    const flipped = fit.pts.map(function (p) {
      return Tangram.exactPoint(p.x, Tangram.nNeg(p.y));
    });
    let minX = Infinity;
    let minY = Infinity;
    for (let i = 0; i < flipped.length; i++) {
      const x = Tangram.nNum(flipped[i].x);
      const y = Tangram.nNum(flipped[i].y);
      if (x < minX) minX = x;
      if (y < minY) minY = y;
    }
    const exact = Tangram.shiftMinExact(flipped);
    return {
      maxErr: fit.maxErr,
      unit: fit.unit,
      points: exact.map(function (p) { return Tangram.pNum(p); }),
      exact: exact,
      minX: minX,
      minY: minY,
    };
  }

  function worldFromRounded(rounded) {
    let minX = Infinity;
    let minY = Infinity;
    const upright = new Array(rounded.length);
    for (let i = 0; i < rounded.length; i++) {
      const x = rounded[i][0];
      const y = -rounded[i][1];
      upright[i] = [x, y];
      if (x < minX) minX = x;
      if (y < minY) minY = y;
    }
    const shifted = new Array(upright.length);
    for (let i = 0; i < upright.length; i++) shifted[i] = [upright[i][0] - minX, upright[i][1] - minY];
    return { minX: minX, minY: minY, points: Tangram.cleanPoints(shifted) };
  }

  function maskAgreement(mask, w, h, bounds, project, poly) {
    let x0 = bounds.minX;
    let y0 = bounds.minY;
    let x1 = bounds.maxX;
    let y1 = bounds.maxY;
    let inter = 0;
    let maskCount = 0;
    let polyCount = 0;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const on = mask[y * w + x] === 1;
        const world = project(x + 0.5, y + 0.5);
        const inside = pointInPolyFloat(world[0], world[1], poly);
        if (on) maskCount++;
        if (inside) polyCount++;
        if (on && inside) inter++;
      }
    }
    const union = maskCount + polyCount - inter;
    return union === 0 ? 0 : inter / union;
  }

  function fail(code, message) {
    return { ok: false, code: code, message: message, points: [] };
  }

  // Shortest edge, in units of sqrt(area/8). A one-pixel flat on a sharp tip
  // is not a side; anything still under 1 cannot be a standard tangram edge.
  function shortestRealEdge(points) {
    let area = 0;
    const lengths = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      area += a[0] * b[1] - b[0] * a[1];
      lengths.push(Math.hypot(b[0] - a[0], b[1] - a[1]));
    }
    area = Math.abs(area) / 2;
    if (area < 1e-6 || !lengths.length) return 1;
    const unit = Math.sqrt(area / Tangram.TARGET_AREA);
    let minL = Infinity;
    for (let i = 0; i < lengths.length; i++) {
      if (lengths[i] < unit * 0.22) continue;
      if (lengths[i] < minL) minL = lengths[i];
    }
    if (minL === Infinity) minL = Math.min.apply(null, lengths);
    return minL / unit;
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
    // Pixel count estimates the tangram unit. A screenshot is rarely an integer
    // number of those units across, and anti-aliased stairs are not real corners.
    const unit0 = Math.sqrt(comps[0].length / Tangram.TARGET_AREA);
    if (unit0 < 6) return fail("small", "图形太小，吸附到网格后会失真。请换一张更大的剪影。");
    const simple = dropCollinear(contour);
    const tol = Math.min(Math.max(unit0 * 0.16, 1.8), unit0 * 0.3);
    const simp = simplifyClosed(simple, tol);
    if (!simp || simp.length < 3) return fail("contour", "没能把剪影收成一个多边形。");
    let cx = 0;
    let cy = 0;
    let minPX = w;
    let minPY = h;
    let maxPX = 0;
    let maxPY = 0;
    for (let i = 0; i < comps[0].length; i++) {
      const p = comps[0][i];
      const x = p % w;
      const y = (p / w) | 0;
      cx += x;
      cy += y;
      if (x < minPX) minPX = x;
      if (y < minPY) minPY = y;
      if (x > maxPX) maxPX = x;
      if (y > maxPY) maxPY = y;
    }
    cx /= comps[0].length;
    cy /= comps[0].length;
    const bulge = contourBulge(contour, simp);
    // A circle's best 45° fit is an octagon whose chords still bow out.
    // Real tangram edges stay within a pixel of a straight line.
    if ((bulge.mean > unit0 * 0.085 && bulge.mean > 1.35) || roundLikeACircle(simp, bulge.mean)) {
      return fail(
        "snap",
        "这张剪影的边角对不齐标准网格，程序没有把它改成另一张图。请换一块本来就能用七巧板拼成的轮廓，或在网格上点顶点。"
      );
    }
    const thetas = alignmentOptions(simp);
    const SNAP_MAX = 0.36;
    const IOU_MIN = 0.74;
    const viable = [];
    let bestModule = null;
    let sawAligned = false;
    let shortest = Infinity;
    const pad = Math.ceil(unit0) + 2;
    const bounds = {
      minX: Math.max(0, minPX - pad),
      minY: Math.max(0, minPY - pad),
      maxX: Math.min(w - 1, maxPX + pad),
      maxY: Math.min(h - 1, maxPY + pad),
    };
    for (let t = 0; t < thetas.length; t++) {
      const theta = thetas[t];
      const co = Math.cos(-theta);
      const si = Math.sin(-theta);
      const rotatedSimp = rotateAround(simp, cx, cy, co, si);
      const angErr = edgeAngleError(rotatedSimp);
      if (angErr > 0.14) continue;
      const rotatedContour = rotateAround(contour, cx, cy, co, si);
      const corners = refitCorners(rotatedContour, rotatedSimp, unit0);
      if (corners.length < 3) continue;
      sawAligned = true;
      const ratio = shortestRealEdge(corners);
      if (ratio < shortest) shortest = ratio;
      const fitted = moduleFit(corners);
      if (fitted && fitted.maxErr <= 0.12) {
        const project = function (x, y) {
          const dx = x - cx;
          const dy = y - cy;
          const rx = cx + dx * co - dy * si;
          const ry = cy + dx * si + dy * co;
          const gx = (rx - corners[0][0]) / fitted.unit;
          const gy = (ry - corners[0][1]) / fitted.unit;
          return [gx - fitted.minX, -gy - fitted.minY];
        };
        const iou = maskAgreement(mask, w, h, bounds, project, fitted.points);
        if (iou >= 0.88 && (!bestModule || fitted.maxErr < bestModule.maxErr - 1e-9 || (Math.abs(fitted.maxErr - bestModule.maxErr) <= 1e-9 && iou > bestModule.iou))) {
          bestModule = {
            maxErr: fitted.maxErr,
            iou: iou,
            points: fitted.points,
            exact: fitted.exact,
          };
        }
      }
      const raw = snapCandidates(corners, unit0);
      raw.sort(function (a, b) {
        return a.maxErr - b.maxErr || a.meanErr - b.meanErr;
      });
      const seen = new Set();
      let kept = 0;
      for (let i = 0; i < raw.length && kept < 6; i++) {
        const cand = raw[i];
        if (cand.maxErr > SNAP_MAX) break;
        const world = worldFromRounded(cand.rounded);
        if (!world.points || world.points.length < 3) continue;
        const key = world.points
          .map(function (p) {
            return p[0] + "," + p[1];
          })
          .join(";");
        if (seen.has(key)) continue;
        seen.add(key);
        kept++;
        const project = function (x, y) {
          const dx = x - cx;
          const dy = y - cy;
          const rx = cx + dx * co - dy * si;
          const ry = cy + dx * si + dy * co;
          const gx = rx / cand.unit - cand.fx;
          const gy = ry / cand.unit - cand.fy;
          return [gx - world.minX, -gy - world.minY];
        };
        const iou = maskAgreement(mask, w, h, bounds, project, world.points);
        if (iou < IOU_MIN) continue;
        viable.push({
          maxErr: cand.maxErr,
          meanErr: cand.meanErr,
          unit: cand.unit,
          iou: iou,
          points: world.points,
          analysis: Tangram.analyze(world.points),
        });
      }
    }
    const bestLatticeErr = viable.length ? viable.reduce(function (m, item) { return Math.min(m, item.maxErr); }, Infinity) : Infinity;
    if (bestModule && (!viable.length || bestModule.maxErr + 0.04 < bestLatticeErr)) {
      const onLattice = Tangram.analyze(bestModule.points).ok;
      const scaleNote = bestModule.maxErr > 0.08;
      return {
        ok: true,
        code: "ok",
        message: onLattice
          ? (scaleNote ? "已按这张图的实际尺寸，把边角吸附到 45° 网格。" : "已把剪影的边角吸附到 45° 网格。")
          : "已按这张图的实际尺寸，把边角收到 45° 方向上。拼块可以离开整格交点。",
        points: bestModule.points,
        exact: onLattice ? null : bestModule.exact,
        snapError: bestModule.maxErr,
      };
    }
    if (!viable.length) {
      if (sawAligned) {
        return fail(
          "shape",
          shortest < 0.75
            ? "这张剪影的边已经沿水平、垂直或 45°，但有一条边比最小的那块三角还短，标准七块拼不出这种长短。程序没有把它改成另一张图。"
            : "这张剪影的边已经沿水平、垂直或 45°，但这些长短对不上标准的七块，拼不出来。程序没有把它改成另一张图。"
        );
      }
      return fail(
        "snap",
        "这张剪影的边角对不齐标准网格，程序没有把它改成另一张图。请换一块本来就能用七巧板拼成的轮廓，或在网格上点顶点。"
      );
    }
    viable.sort(function (a, b) {
      return a.maxErr - b.maxErr;
    });
    const errCut = viable[0].maxErr + 0.08;
    const pool = [];
    for (let i = 0; i < viable.length; i++) if (viable[i].maxErr <= errCut) pool.push(viable[i]);
    function gridRank(code) {
      if (code === "ok") return 0;
      if (code === "area" || code === "hole" || code === "disconnect") return 1;
      return 3;
    }
    pool.sort(function (a, b) {
      const ag = gridRank(a.analysis.code);
      const bg = gridRank(b.analysis.code);
      if (ag !== bg) return ag - bg;
      if (Math.abs(a.maxErr - b.maxErr) > 0.02) return a.maxErr - b.maxErr;
      return b.iou - a.iou;
    });
    const chosen = pool[0];
    const scaleOff = Math.abs(chosen.unit - unit0) / unit0;
    const fitted = scaleOff > 0.03 || chosen.maxErr > 0.08;
    return {
      ok: true,
      code: "ok",
      message: fitted
        ? "已按这张图的实际尺寸，把边角吸附到 45° 网格。"
        : "已把剪影的边角吸附到 45° 网格。",
      points: chosen.points,
      snapError: chosen.maxErr,
    };
  }

  Tangram.extractSilhouette = extractSilhouette;
})();
