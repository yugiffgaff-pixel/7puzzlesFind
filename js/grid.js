var Tangram = globalThis.Tangram || (globalThis.Tangram = {});

(function () {
  "use strict";

  // World coordinates use the small-triangle leg as 1.
  // Doubled coordinates are 2x world, so cell centers are odd integers.
  // Each unit cell is split by both diagonals into 4 quarters of area 1/4.

  function doubledOf(points) {
    const out = new Array(points.length);
    for (let i = 0; i < points.length; i++) {
      out[i] = [Math.round(points[i][0] * 2), Math.round(points[i][1] * 2)];
    }
    return out;
  }

  function worldOf(dpts) {
    const out = new Array(dpts.length);
    for (let i = 0; i < dpts.length; i++) out[i] = [dpts[i][0] / 2, dpts[i][1] / 2];
    return out;
  }

  function shoelace(dpts) {
    let s = 0;
    for (let i = 0; i < dpts.length; i++) {
      const a = dpts[i];
      const b = dpts[(i + 1) % dpts.length];
      s += a[0] * b[1] - b[0] * a[1];
    }
    return s;
  }

  function areaOfDoubled(s) {
    return Math.abs(s) / 8;
  }

  function dedupeConsecutive(dpts) {
    if (dpts.length === 0) return dpts;
    const out = [dpts[0]];
    for (let i = 1; i < dpts.length; i++) {
      const p = dpts[i];
      const q = out[out.length - 1];
      if (p[0] !== q[0] || p[1] !== q[1]) out.push(p);
    }
    if (out.length > 1) {
      const a = out[0];
      const b = out[out.length - 1];
      if (a[0] === b[0] && a[1] === b[1]) out.pop();
    }
    return out;
  }

  function removeCollinear(dpts) {
    if (dpts.length < 3) return dpts.slice();
    let cur = dpts.slice();
    let guard = cur.length + 2;
    while (guard-- > 0 && cur.length >= 3) {
      const next = [];
      let dropped = false;
      for (let i = 0; i < cur.length; i++) {
        const a = cur[(i + cur.length - 1) % cur.length];
        const b = cur[i];
        const c = cur[(i + 1) % cur.length];
        const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
        if (cross === 0) {
          dropped = true;
          continue;
        }
        next.push(b);
      }
      cur = next;
      if (!dropped) break;
    }
    return cur;
  }

  function cleanDoubled(dpts) {
    let cur = dedupeConsecutive(dpts);
    cur = removeCollinear(cur);
    if (cur.length >= 3 && shoelace(cur) < 0) cur.reverse();
    return cur;
  }

  function edgeAxisOrDiagonal(a, b) {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    if (dx === 0 || dy === 0) return dx !== 0 || dy !== 0;
    return Math.abs(dx) === Math.abs(dy);
  }

  function allVerticesEven(dpts) {
    for (let i = 0; i < dpts.length; i++) {
      if ((dpts[i][0] & 1) || (dpts[i][1] & 1)) return false;
    }
    return true;
  }

  function edgesGridAligned(dpts) {
    if (!allVerticesEven(dpts)) return false;
    for (let i = 0; i < dpts.length; i++) {
      if (!edgeAxisOrDiagonal(dpts[i], dpts[(i + 1) % dpts.length])) return false;
    }
    return true;
  }

  function onSegment(px, py, ax, ay, bx, by) {
    const cross = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
    if (cross !== 0) return false;
    if (px < Math.min(ax, bx) || px > Math.max(ax, bx)) return false;
    if (py < Math.min(ay, by) || py > Math.max(ay, by)) return false;
    return true;
  }

  function segmentsConflict(a, b, c, d) {
    function orient(p, q, r) {
      return (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
    }
    const o1 = orient(a, b, c);
    const o2 = orient(a, b, d);
    const o3 = orient(c, d, a);
    const o4 = orient(c, d, b);
    if (o1 === 0 && o2 === 0 && o3 === 0 && o4 === 0) {
      return (
        onSegment(a[0], a[1], c[0], c[1], d[0], d[1]) ||
        onSegment(b[0], b[1], c[0], c[1], d[0], d[1]) ||
        onSegment(c[0], c[1], a[0], a[1], b[0], b[1]) ||
        onSegment(d[0], d[1], a[0], a[1], b[0], b[1])
      );
    }
    const abSplit = o1 === 0 || o2 === 0 ? false : (o1 > 0) !== (o2 > 0);
    const cdSplit = o3 === 0 || o4 === 0 ? false : (o3 > 0) !== (o4 > 0);
    if (abSplit && cdSplit) return true;
    if (o1 === 0 && onSegment(c[0], c[1], a[0], a[1], b[0], b[1])) return true;
    if (o2 === 0 && onSegment(d[0], d[1], a[0], a[1], b[0], b[1])) return true;
    if (o3 === 0 && onSegment(a[0], a[1], c[0], c[1], d[0], d[1])) return true;
    if (o4 === 0 && onSegment(b[0], b[1], c[0], c[1], d[0], d[1])) return true;
    return false;
  }

  function selfIntersects(dpts) {
    const n = dpts.length;
    for (let i = 0; i < n; i++) {
      const a = dpts[i];
      const b = dpts[(i + 1) % n];
      for (let j = i + 1; j < n; j++) {
        if ((i + 1) % n === j) continue;
        if ((j + 1) % n === i) continue;
        const c = dpts[j];
        const d = dpts[(j + 1) % n];
        if (segmentsConflict(a, b, c, d)) return true;
      }
    }
    return false;
  }

  function quarterVerts(cx, cy, q) {
    const x = cx * 2;
    const y = cy * 2;
    const A = [x, y];
    const B = [x + 2, y];
    const C = [x + 2, y + 2];
    const D = [x, y + 2];
    const M = [x + 1, y + 1];
    if (q === 0) return [A, B, M];
    if (q === 1) return [B, C, M];
    if (q === 2) return [C, D, M];
    return [D, A, M];
  }

  function location(px, py, poly) {
    const n = poly.length;
    for (let i = 0; i < n; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % n];
      if (onSegment(px, py, a[0], a[1], b[0], b[1])) return "boundary";
    }
    let inside = false;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = poly[i][0];
      const yi = poly[i][1];
      const xj = poly[j][0];
      const yj = poly[j][1];
      if ((yi > py) !== (yj > py)) {
        const lhs = (px - xi) * (yj - yi);
        const rhs = (xj - xi) * (py - yi);
        if ((yj > yi && lhs < rhs) || (yj < yi && lhs > rhs)) inside = !inside;
      }
    }
    return inside ? "in" : "out";
  }

  function rasterizeDoubled(dpts) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < dpts.length; i++) {
      const p = dpts[i];
      if (p[0] < minX) minX = p[0];
      if (p[1] < minY) minY = p[1];
      if (p[0] > maxX) maxX = p[0];
      if (p[1] > maxY) maxY = p[1];
    }
    const scaled = dpts.map(function (p) {
      return [p[0] * 3, p[1] * 3];
    });
    const quarters = [];
    let boundary = 0;
    const minCx = Math.floor(minX / 2) - 1;
    const maxCx = Math.floor(maxX / 2) + 1;
    const minCy = Math.floor(minY / 2) - 1;
    const maxCy = Math.floor(maxY / 2) + 1;
    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        for (let q = 0; q < 4; q++) {
          const v = quarterVerts(cx, cy, q);
          const tx = v[0][0] + v[1][0] + v[2][0];
          const ty = v[0][1] + v[1][1] + v[2][1];
          const loc = location(tx, ty, scaled);
          if (loc === "in") quarters.push({ cx: cx, cy: cy, q: q });
          else if (loc === "boundary") boundary++;
        }
      }
    }
    return { quarters: quarters, boundary: boundary };
  }

  function quarterKey(q) {
    return q.cx + "," + q.cy + "," + q.q;
  }

  function undirectedEdgeKey(a, b) {
    if (a[0] < b[0] || (a[0] === b[0] && a[1] <= b[1])) {
      return a[0] + "," + a[1] + "|" + b[0] + "," + b[1];
    }
    return b[0] + "," + b[1] + "|" + a[0] + "," + a[1];
  }

  function directedKey(a, b) {
    return a[0] + "," + a[1] + ">" + b[0] + "," + b[1];
  }

  function ccwEdges(q) {
    const v = quarterVerts(q.cx, q.cy, q.q);
    return [
      [v[0], v[1]],
      [v[1], v[2]],
      [v[2], v[0]],
    ];
  }

  function neighborsOf(q) {
    const cx = q.cx;
    const cy = q.cy;
    if (q.q === 0) {
      return [
        { cx: cx, cy: cy, q: 1 },
        { cx: cx, cy: cy, q: 3 },
        { cx: cx, cy: cy - 1, q: 2 },
      ];
    }
    if (q.q === 1) {
      return [
        { cx: cx, cy: cy, q: 0 },
        { cx: cx, cy: cy, q: 2 },
        { cx: cx + 1, cy: cy, q: 3 },
      ];
    }
    if (q.q === 2) {
      return [
        { cx: cx, cy: cy, q: 1 },
        { cx: cx, cy: cy, q: 3 },
        { cx: cx, cy: cy + 1, q: 0 },
      ];
    }
    return [
      { cx: cx, cy: cy, q: 0 },
      { cx: cx, cy: cy, q: 2 },
      { cx: cx - 1, cy: cy, q: 1 },
    ];
  }

  function connectivity(quarters) {
    const index = new Map();
    for (let i = 0; i < quarters.length; i++) index.set(quarterKey(quarters[i]), i);
    const adj = quarters.map(function () {
      return [];
    });
    let overlap = false;
    const seenEdge = new Map();
    for (let i = 0; i < quarters.length; i++) {
      const edges = ccwEdges(quarters[i]);
      for (let e = 0; e < edges.length; e++) {
        const k = undirectedEdgeKey(edges[e][0], edges[e][1]);
        if (seenEdge.has(k)) {
          const j = seenEdge.get(k);
          if (j < 0) overlap = true;
          else {
            adj[i].push(j);
            adj[j].push(i);
            seenEdge.set(k, -1);
          }
        } else seenEdge.set(k, i);
      }
    }
    const seen = new Uint8Array(quarters.length);
    let components = 0;
    for (let i = 0; i < quarters.length; i++) {
      if (seen[i]) continue;
      components++;
      const stack = [i];
      seen[i] = 1;
      while (stack.length) {
        const u = stack.pop();
        const nb = adj[u];
        for (let k = 0; k < nb.length; k++) {
          const v = nb[k];
          if (!seen[v]) {
            seen[v] = 1;
            stack.push(v);
          }
        }
      }
    }
    return { components: components, overlap: overlap, index: index };
  }

  function turnScore(incoming, option) {
    const rx = incoming.a[0] - incoming.b[0];
    const ry = incoming.a[1] - incoming.b[1];
    const ox = option.b[0] - option.a[0];
    const oy = option.b[1] - option.a[1];
    const cross = rx * oy - ry * ox;
    const dot = rx * ox + ry * oy;
    let ang = Math.atan2(cross, dot);
    if (ang <= 1e-12) ang += Math.PI * 2;
    return ang;
  }

  function traceLoops(quarters) {
    const dir = new Map();
    for (let i = 0; i < quarters.length; i++) {
      const edges = ccwEdges(quarters[i]);
      for (let e = 0; e < edges.length; e++) {
        const a = edges[e][0];
        const b = edges[e][1];
        const rev = directedKey(b, a);
        const fwd = directedKey(a, b);
        if (dir.has(rev)) dir.delete(rev);
        else dir.set(fwd, { a: a, b: b });
      }
    }
    const outgoing = new Map();
    dir.forEach(function (edge) {
      const k = edge.a[0] + "," + edge.a[1];
      let list = outgoing.get(k);
      if (!list) {
        list = [];
        outgoing.set(k, list);
      }
      list.push(edge);
    });
    const unused = new Set(dir.keys());
    const loops = [];
    dir.forEach(function (edge0) {
      const startKey = directedKey(edge0.a, edge0.b);
      if (!unused.has(startKey)) return;
      const loop = [];
      let cur = edge0;
      let guard = dir.size + 2;
      while (guard-- > 0) {
        const ck = directedKey(cur.a, cur.b);
        if (!unused.has(ck)) break;
        unused.delete(ck);
        loop.push(cur.a);
        const vk = cur.b[0] + "," + cur.b[1];
        const options = outgoing.get(vk) || [];
        let next = null;
        let best = Infinity;
        for (let i = 0; i < options.length; i++) {
          const cand = options[i];
          if (!unused.has(directedKey(cand.a, cand.b)) && directedKey(cand.a, cand.b) !== startKey) {
            continue;
          }
          if (!unused.has(directedKey(cand.a, cand.b))) continue;
          const score = turnScore(cur, cand);
          if (score < best) {
            best = score;
            next = cand;
          }
        }
        if (!next) break;
        cur = next;
        if (cur === edge0) break;
      }
      if (loop.length >= 3) loops.push(loop);
    });
    return loops;
  }

  function formatArea(absShoelace) {
    const rem = absShoelace % 8;
    const whole = (absShoelace - rem) / 8;
    const frac = { 0: "", 1: ".125", 2: ".25", 3: ".375", 4: ".5", 5: ".625", 6: ".75", 7: ".875" };
    if (rem === 0) return String(whole);
    if (whole === 0) return ("0" + frac[rem]).replace(/^0/, "0");
    return String(whole) + frac[rem];
  }

  Tangram.TARGET_AREA = 8;
  Tangram.TARGET_QUARTERS = 32;
  Tangram.quarterKey = quarterKey;
  Tangram.neighborsOf = neighborsOf;
  Tangram.doubledOf = doubledOf;
  Tangram.worldOf = worldOf;
  Tangram.cleanPoints = function (points) {
    return worldOf(cleanDoubled(doubledOf(points)));
  };
  Tangram.polygonStats = function (points) {
    const dpts = cleanDoubled(doubledOf(points));
    const s = dpts.length >= 3 ? shoelace(dpts) : 0;
    return {
      points: worldOf(dpts),
      doubled: dpts,
      shoelace: s,
      area: areaOfDoubled(s),
      areaText: formatArea(Math.abs(s)),
    };
  };
  Tangram.edgesGridAligned = function (points) {
    const dpts = cleanDoubled(doubledOf(points));
    return edgesGridAligned(dpts);
  };
  Tangram.selfIntersects = function (points) {
    const dpts = cleanDoubled(doubledOf(points));
    if (dpts.length < 4) return false;
    return selfIntersects(dpts);
  };
  Tangram.rasterize = function (points) {
    const dpts = cleanDoubled(doubledOf(points));
    const hit = rasterizeDoubled(dpts);
    return {
      points: worldOf(dpts),
      doubled: dpts,
      shoelace: shoelace(dpts),
      quarters: hit.quarters,
      boundary: hit.boundary,
    };
  };
  Tangram.traceOutline = function (quarters) {
    const loops = traceLoops(quarters);
    return loops.map(function (loop) {
      return worldOf(cleanDoubled(loop));
    });
  };
  Tangram.connectivity = connectivity;
  Tangram.formatArea = formatArea;
})();
