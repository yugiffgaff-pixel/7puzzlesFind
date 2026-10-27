var Tangram = globalThis.Tangram || (globalThis.Tangram = {});

(function () {
  "use strict";

  // A coordinate is (a + b√2) / den. Tangram vertices at 45° increments
  // stay in this form; intersections may double the denominator.
  function gcd(a, b) {
    a = Math.abs(a);
    b = Math.abs(b);
    while (b) {
      const t = a % b;
      a = b;
      b = t;
    }
    return a || 1;
  }

  function num(a, b, den) {
    if (den < 0) {
      a = -a;
      b = -b;
      den = -den;
    }
    if (a === 0 && b === 0) return { a: 0, b: 0, den: 1 };
    const g = gcd(gcd(Math.abs(a), Math.abs(b)), den);
    return { a: a / g, b: b / g, den: den / g };
  }

  function nEq(p, q) {
    const A = num(p.a, p.b, p.den);
    const B = num(q.a, q.b, q.den);
    return A.a === B.a && A.b === B.b && A.den === B.den;
  }

  function nAdd(p, q) {
    const den = (p.den / gcd(p.den, q.den)) * q.den;
    return num(p.a * (den / p.den) + q.a * (den / q.den), p.b * (den / p.den) + q.b * (den / q.den), den);
  }

  function nSub(p, q) {
    return nAdd(p, num(-q.a, -q.b, q.den));
  }

  function nNeg(p) {
    return num(-p.a, -p.b, p.den);
  }

  function nMul(p, q) {
    return num(p.a * q.a + 2 * p.b * q.b, p.a * q.b + p.b * q.a, p.den * q.den);
  }

  function nSign(p) {
    const n = num(p.a, p.b, p.den);
    if (n.a === 0 && n.b === 0) return 0;
    if (n.b === 0) return n.a > 0 ? 1 : -1;
    if (n.b > 0) {
      if (n.a >= 0) return 1;
      const left = n.a * n.a;
      const right = 2 * n.b * n.b;
      return right > left ? 1 : -1;
    }
    if (n.a <= 0) return -1;
    const left = n.a * n.a;
    const right = 2 * n.b * n.b;
    return left > right ? 1 : -1;
  }

  function nCmp(p, q) {
    return nSign(nSub(p, q));
  }

  function nNum(p) {
    return (p.a + p.b * Math.SQRT2) / p.den;
  }

  function pt(x, y) {
    return { x: x, y: y };
  }

  function pEq(a, b) {
    return nEq(a.x, b.x) && nEq(a.y, b.y);
  }

  function pKey(p) {
    const x = num(p.x.a, p.x.b, p.x.den);
    const y = num(p.y.a, p.y.b, p.y.den);
    return x.a + "," + x.b + "," + x.den + ":" + y.a + "," + y.b + "," + y.den;
  }

  function pNum(p) {
    return [nNum(p.x), nNum(p.y)];
  }

  function rot45(p) {
    const halfSqrt2 = num(0, 1, 2);
    return pt(nMul(nSub(p.x, p.y), halfSqrt2), nMul(nAdd(p.x, p.y), halfSqrt2));
  }

  function reflectY(p) {
    return pt(p.x, nNeg(p.y));
  }

  function translate(p, dx, dy) {
    return pt(nAdd(p.x, dx), nAdd(p.y, dy));
  }

  function cross(ax, ay, bx, by) {
    return nSub(nMul(ax, by), nMul(ay, bx));
  }

  function dot(ax, ay, bx, by) {
    return nAdd(nMul(ax, bx), nMul(ay, by));
  }

  function shoelace(poly) {
    let s = num(0, 0, 1);
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      s = nAdd(s, nSub(nMul(a.x, b.y), nMul(b.x, a.y)));
    }
    return s;
  }

  function ensureCCW(poly) {
    if (nSign(shoelace(poly)) < 0) return poly.slice().reverse();
    return poly.slice();
  }

  function cleanPoly(poly) {
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      if (!out.length || !pEq(out[out.length - 1], poly[i])) out.push(poly[i]);
    }
    if (out.length > 1 && pEq(out[0], out[out.length - 1])) out.pop();
    let guard = out.length + 2;
    let cur = out;
    while (guard-- > 0 && cur.length >= 3) {
      const next = [];
      let dropped = false;
      for (let i = 0; i < cur.length; i++) {
        const a = cur[(i + cur.length - 1) % cur.length];
        const b = cur[i];
        const c = cur[(i + 1) % cur.length];
        const cr = cross(nSub(b.x, a.x), nSub(b.y, a.y), nSub(c.x, a.x), nSub(c.y, a.y));
        if (nSign(cr) === 0) {
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

  function onSegment(p, a, b) {
    const abx = nSub(b.x, a.x);
    const aby = nSub(b.y, a.y);
    const apx = nSub(p.x, a.x);
    const apy = nSub(p.y, a.y);
    if (nSign(cross(abx, aby, apx, apy)) !== 0) return false;
    const d = dot(apx, apy, abx, aby);
    if (nSign(d) < 0) return false;
    const len = dot(abx, aby, abx, aby);
    return nCmp(d, len) <= 0;
  }

  function onBoundary(p, poly) {
    for (let i = 0; i < poly.length; i++) {
      if (onSegment(p, poly[i], poly[(i + 1) % poly.length])) return true;
    }
    return false;
  }

  function pointInPoly(p, poly) {
    if (onBoundary(p, poly)) return "boundary";
    let inside = false;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const ay = nCmp(a.y, p.y);
      const by = nCmp(b.y, p.y);
      const aAbove = ay > 0;
      const bAbove = by > 0;
      if (aAbove === bAbove) continue;
      const ox = nSub(a.x, p.x);
      const dx = nSub(b.x, a.x);
      const dy = nSub(b.y, a.y);
      const ty = nSub(p.y, a.y);
      const side = nAdd(nMul(ox, dy), nMul(dx, ty));
      const sgn = nSign(side);
      if (sgn === 0) return "boundary";
      if (nSign(dy) > 0 ? sgn > 0 : sgn < 0) inside = !inside;
    }
    return inside ? "in" : "out";
  }

  function properCross(a, b, c, d) {
    if (pEq(a, c) || pEq(a, d) || pEq(b, c) || pEq(b, d)) return false;
    const abx = nSub(b.x, a.x);
    const aby = nSub(b.y, a.y);
    const acx = nSub(c.x, a.x);
    const acy = nSub(c.y, a.y);
    const adx = nSub(d.x, a.x);
    const ady = nSub(d.y, a.y);
    const cdx = nSub(d.x, c.x);
    const cdy = nSub(d.y, c.y);
    const cax = nSub(a.x, c.x);
    const cay = nSub(a.y, c.y);
    const cbx = nSub(b.x, c.x);
    const cby = nSub(b.y, c.y);
    const s1 = nSign(cross(abx, aby, acx, acy));
    const s2 = nSign(cross(abx, aby, adx, ady));
    const s3 = nSign(cross(cdx, cdy, cax, cay));
    const s4 = nSign(cross(cdx, cdy, cbx, cby));
    if (s1 === 0 || s2 === 0 || s3 === 0 || s4 === 0) return false;
    return s1 !== s2 && s3 !== s4;
  }

  function lineKind(a, b) {
    const dx = nSub(b.x, a.x);
    const dy = nSub(b.y, a.y);
    if (nSign(dx) === 0 && nSign(dy) === 0) return null;
    if (nSign(dx) === 0) return "v";
    if (nSign(dy) === 0) return "h";
    if (nEq(dx, dy)) return "p";
    if (nEq(dx, nNeg(dy))) return "m";
    return null;
  }

  function lineHit(a, b, c, d) {
    const k1 = lineKind(a, b);
    const k2 = lineKind(c, d);
    if (!k1 || !k2 || k1 === k2) return null;
    if (k1 === "h" && k2 === "v") return pt(c.x, a.y);
    if (k1 === "v" && k2 === "h") return pt(a.x, c.y);
    if (k1 === "h" && k2 === "p") return pt(nSub(a.y, nSub(c.y, c.x)), a.y);
    if (k1 === "p" && k2 === "h") return pt(nSub(c.y, nSub(a.y, a.x)), c.y);
    if (k1 === "h" && k2 === "m") return pt(nSub(nAdd(c.x, c.y), a.y), a.y);
    if (k1 === "m" && k2 === "h") return pt(nSub(nAdd(a.x, a.y), c.y), c.y);
    if (k1 === "v" && k2 === "p") return pt(a.x, nAdd(a.x, nSub(c.y, c.x)));
    if (k1 === "p" && k2 === "v") return pt(c.x, nAdd(c.x, nSub(a.y, a.x)));
    if (k1 === "v" && k2 === "m") return pt(a.x, nSub(nAdd(c.x, c.y), a.x));
    if (k1 === "m" && k2 === "v") return pt(c.x, nSub(nAdd(a.x, a.y), c.x));
    if ((k1 === "p" && k2 === "m") || (k1 === "m" && k2 === "p")) {
      const s1 = k1 === "p" ? nSub(a.y, a.x) : nSub(c.y, c.x);
      const s2 = k1 === "m" ? nAdd(a.x, a.y) : nAdd(c.x, c.y);
      return pt(num(nSub(s2, s1).a, nSub(s2, s1).b, nSub(s2, s1).den * 2), num(nAdd(s1, s2).a, nAdd(s1, s2).b, nAdd(s1, s2).den * 2));
    }
    return null;
  }

  function segmentIntersect(a, b, c, d) {
    const kindA = lineKind(a, b);
    const kindB = lineKind(c, d);
    if (kindA && kindB && kindA === kindB) {
      if (!onSegment(c, a, b) && !onSegment(d, a, b) && !onSegment(a, c, d) && !onSegment(b, c, d)) {
        if (nSign(cross(nSub(b.x, a.x), nSub(b.y, a.y), nSub(c.x, a.x), nSub(c.y, a.y))) !== 0) return [];
      }
      const pts = [];
      if (onSegment(c, a, b)) pts.push(c);
      if (onSegment(d, a, b)) pts.push(d);
      if (onSegment(a, c, d)) pts.push(a);
      if (onSegment(b, c, d)) pts.push(b);
      return pts;
    }
    const hit = lineHit(a, b, c, d);
    if (!hit) return [];
    if (onSegment(hit, a, b) && onSegment(hit, c, d)) return [hit];
    return [];
  }

  function sortAlong(a, b, points) {
    const abx = nSub(b.x, a.x);
    const aby = nSub(b.y, a.y);
    const decorated = points.map(function (p) {
      return { p: p, t: dot(nSub(p.x, a.x), nSub(p.y, a.y), abx, aby) };
    });
    decorated.sort(function (u, v) {
      return nCmp(u.t, v.t);
    });
    const out = [];
    for (let i = 0; i < decorated.length; i++) {
      if (!out.length || !pEq(out[out.length - 1], decorated[i].p)) out.push(decorated[i].p);
    }
    return out;
  }

  function atomicEdges(host, other) {
    const segs = [];
    for (let i = 0; i < host.length; i++) {
      const a = host[i];
      const b = host[(i + 1) % host.length];
      const cuts = [a, b];
      for (let j = 0; j < other.length; j++) {
        const c = other[j];
        const d = other[(j + 1) % other.length];
        if (onSegment(c, a, b)) cuts.push(c);
        if (onSegment(d, a, b)) cuts.push(d);
        const hits = segmentIntersect(a, b, c, d);
        for (let k = 0; k < hits.length; k++) cuts.push(hits[k]);
      }
      const ordered = sortAlong(a, b, cuts);
      for (let k = 0; k + 1 < ordered.length; k++) {
        if (!pEq(ordered[k], ordered[k + 1])) segs.push([ordered[k], ordered[k + 1]]);
      }
    }
    return segs;
  }

  function midpoint(a, b) {
    return pt(
      num(nAdd(a.x, b.x).a, nAdd(a.x, b.x).b, nAdd(a.x, b.x).den * 2),
      num(nAdd(a.y, b.y).a, nAdd(a.y, b.y).b, nAdd(a.y, b.y).den * 2)
    );
  }

  function sharpestTurn(incoming, options) {
    const inX = nSub(incoming[1].x, incoming[0].x);
    const inY = nSub(incoming[1].y, incoming[0].y);
    let best = options[0];
    let bestAng = -Infinity;
    for (let i = 0; i < options.length; i++) {
      const opt = options[i];
      const ox = nSub(opt[1].x, opt[0].x);
      const oy = nSub(opt[1].y, opt[0].y);
      const ang = Math.atan2(nNum(cross(inX, inY, ox, oy)), nNum(dot(inX, inY, ox, oy)));
      if (ang > bestAng) {
        bestAng = ang;
        best = opt;
      }
    }
    return best;
  }

  function stitch(segs) {
    const outgoing = new Map();
    function add(seg) {
      const k = pKey(seg[0]);
      let list = outgoing.get(k);
      if (!list) {
        list = [];
        outgoing.set(k, list);
      }
      list.push(seg);
    }
    for (let i = 0; i < segs.length; i++) add(segs[i]);
    const unused = new Set(segs);
    const loops = [];
    for (let s = 0; s < segs.length; s++) {
      if (!unused.has(segs[s])) continue;
      const loop = [];
      let cur = segs[s];
      let guard = segs.length + 2;
      while (guard-- > 0 && unused.has(cur)) {
        unused.delete(cur);
        loop.push(cur[0]);
        const options = outgoing.get(pKey(cur[1])) || [];
        const open = [];
        for (let i = 0; i < options.length; i++) {
          if (unused.has(options[i])) open.push(options[i]);
        }
        if (!open.length) break;
        cur = sharpestTurn(cur, open);
      }
      if (loop.length >= 3) loops.push(loop);
    }
    return loops;
  }

  function subtractPoly(region, piece) {
    const rSeg = atomicEdges(region, piece);
    const pSeg = atomicEdges(piece, region);
    const kept = [];
    for (let i = 0; i < rSeg.length; i++) {
      const mid = midpoint(rSeg[i][0], rSeg[i][1]);
      const loc = pointInPoly(mid, piece);
      if (loc === "out") kept.push(rSeg[i]);
    }
    for (let i = 0; i < pSeg.length; i++) {
      const mid = midpoint(pSeg[i][0], pSeg[i][1]);
      const loc = pointInPoly(mid, region);
      if (loc === "in") kept.push([pSeg[i][1], pSeg[i][0]]);
    }
    const loops = stitch(kept);
    const parts = [];
    for (let i = 0; i < loops.length; i++) {
      const cleaned = cleanPoly(loops[i]);
      if (cleaned.length < 3) continue;
      const area = shoelace(cleaned);
      const sgn = nSign(area);
      if (sgn === 0) continue;
      if (sgn < 0) return null;
      parts.push(ensureCCW(cleaned));
    }
    const before = shoelace(region);
    if (!parts.length) {
      return nEq(shoelace(piece), before) ? [] : null;
    }
    let after = num(0, 0, 1);
    for (let i = 0; i < parts.length; i++) after = nAdd(after, shoelace(parts[i]));
    const pieceArea = shoelace(piece);
    if (!nEq(nAdd(after, pieceArea), before)) return null;
    return parts;
  }

  function pieceInside(piece, region) {
    for (let i = 0; i < piece.length; i++) {
      if (pointInPoly(piece[i], region) === "out") return false;
    }
    for (let i = 0; i < piece.length; i++) {
      const a = piece[i];
      const b = piece[(i + 1) % piece.length];
      for (let j = 0; j < region.length; j++) {
        const c = region[j];
        const d = region[(j + 1) % region.length];
        if (properCross(a, b, c, d)) return false;
      }
    }
    const mid = midpoint(piece[0], piece[1]);
    if (pointInPoly(mid, region) === "out") return false;
    return nCmp(shoelace(piece), shoelace(region)) <= 0;
  }

  const BASES = {
    large: [
      [0, 0],
      [2, 0],
      [0, 2],
    ],
    medium: [
      [0, 0],
      [2, 0],
      [1, 1],
    ],
    small: [
      [0, 0],
      [1, 0],
      [0, 1],
    ],
    square: [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ],
    para: [
      [0, 0],
      [1, 0],
      [2, 1],
      [1, 1],
    ],
  };

  function fromPair(x, y) {
    return pt(num(x * 2, 0, 2), num(y * 2, 0, 2));
  }

  function canonicalKey(poly) {
    const pts = ensureCCW(cleanPoly(poly));
    let best = 0;
    for (let i = 1; i < pts.length; i++) {
      const c = nCmp(pts[i].x, pts[best].x);
      if (c < 0 || (c === 0 && nCmp(pts[i].y, pts[best].y) < 0)) best = i;
    }
    const ordered = [];
    for (let i = 0; i < pts.length; i++) ordered.push(pts[(best + i) % pts.length]);
    const ox = ordered[0].x;
    const oy = ordered[0].y;
    return ordered
      .map(function (p) {
        return pKey(pt(nSub(p.x, ox), nSub(p.y, oy)));
      })
      .join(";");
  }

  function buildOrientations() {
    const byType = {};
    Object.keys(BASES).forEach(function (type) {
      const flips = type === "para" ? [false, true] : [false];
      const seen = new Set();
      const list = [];
      flips.forEach(function (flip) {
        for (let k = 0; k < 8; k++) {
          let verts = BASES[type].map(function (pair) {
            return fromPair(pair[0], pair[1]);
          });
          if (flip) verts = verts.map(reflectY);
          for (let r = 0; r < k; r++) verts = verts.map(rot45);
          verts = ensureCCW(cleanPoly(verts));
          if (lineKind(verts[0], verts[1]) === null) continue;
          const key = canonicalKey(verts);
          if (seen.has(key)) continue;
          seen.add(key);
          list.push({ type: type, flip: flip, rot45: k, verts: verts, area: shoelace(verts) });
        }
      });
      byType[type] = list;
    });
    return byType;
  }

  const ORI = buildOrientations();

  function convexCorners(poly) {
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const prev = poly[(i + poly.length - 1) % poly.length];
      const cur = poly[i];
      const next = poly[(i + 1) % poly.length];
      const ix = nSub(cur.x, prev.x);
      const iy = nSub(cur.y, prev.y);
      const ox = nSub(next.x, cur.x);
      const oy = nSub(next.y, cur.y);
      if (nSign(cross(ix, iy, ox, oy)) <= 0) continue;
      const ang = Math.atan2(nNum(cross(ix, iy, ox, oy)), nNum(dot(ix, iy, ox, oy)));
      out.push({ index: i, angle: ang, at: cur });
    }
    out.sort(function (a, b) {
      if (a.angle !== b.angle) return b.angle - a.angle;
      const c = nCmp(a.at.x, b.at.x);
      if (c !== 0) return c;
      return nCmp(a.at.y, b.at.y);
    });
    return out;
  }

  function placeOri(ori, vertexIndex, target) {
    const v = ori.verts[vertexIndex];
    const dx = nSub(target.x, v.x);
    const dy = nSub(target.y, v.y);
    return ori.verts.map(function (p) {
      return translate(p, dx, dy);
    });
  }

  function shiftMin(poly) {
    let minX = poly[0].x;
    let minY = poly[0].y;
    for (let i = 1; i < poly.length; i++) {
      if (nCmp(poly[i].x, minX) < 0) minX = poly[i].x;
      if (nCmp(poly[i].y, minY) < 0) minY = poly[i].y;
    }
    return poly.map(function (p) {
      return pt(nSub(p.x, minX), nSub(p.y, minY));
    });
  }

  function turnAt(poly, point) {
    let i = -1;
    for (let k = 0; k < poly.length; k++) {
      if (pEq(poly[k], point)) {
        i = k;
        break;
      }
    }
    if (i < 0) return null;
    const prev = poly[(i + poly.length - 1) % poly.length];
    const next = poly[(i + 1) % poly.length];
    const ix = nSub(point.x, prev.x);
    const iy = nSub(point.y, prev.y);
    const ox = nSub(next.x, point.x);
    const oy = nSub(next.y, point.y);
    return Math.atan2(nNum(cross(ix, iy, ox, oy)), nNum(dot(ix, iy, ox, oy)));
  }

  function sameRay(ax, ay, bx, by) {
    return nSign(cross(ax, ay, bx, by)) === 0 && nSign(dot(ax, ay, bx, by)) > 0;
  }

  function edgeMeetsCorner(piece, point, region) {
    let pi = -1;
    let ri = -1;
    for (let i = 0; i < piece.length; i++) if (pEq(piece[i], point)) pi = i;
    for (let i = 0; i < region.length; i++) if (pEq(region[i], point)) ri = i;
    if (pi < 0 || ri < 0) return false;
    const pPrev = piece[(pi + piece.length - 1) % piece.length];
    const pNext = piece[(pi + 1) % piece.length];
    const rPrev = region[(ri + region.length - 1) % region.length];
    const rNext = region[(ri + 1) % region.length];
    const rays = [
      [nSub(pNext.x, point.x), nSub(pNext.y, point.y)],
      [nSub(pPrev.x, point.x), nSub(pPrev.y, point.y)],
    ];
    const walls = [
      [nSub(rNext.x, point.x), nSub(rNext.y, point.y)],
      [nSub(rPrev.x, point.x), nSub(rPrev.y, point.y)],
    ];
    for (let a = 0; a < rays.length; a++) {
      for (let b = 0; b < walls.length; b++) {
        if (sameRay(rays[a][0], rays[a][1], walls[b][0], walls[b][1])) return true;
      }
    }
    return false;
  }

  const TYPE_AREA_ORDER = ["large", "medium", "square", "para", "small"];

  function keyOf(parts, counts) {
    const pk = parts
      .map(canonicalKey)
      .sort()
      .join("|");
    return pk + "#" + TYPE_AREA_ORDER.map(function (t) {
      return counts[t];
    }).join(",");
  }

  function cloneCounts(counts) {
    return {
      large: counts.large,
      medium: counts.medium,
      square: counts.square,
      para: counts.para,
      small: counts.small,
    };
  }

  function takeNext(frame) {
    const region = frame.region;
    const corner = frame.corner;
    while (frame.ti < TYPE_AREA_ORDER.length) {
      const type = TYPE_AREA_ORDER[frame.ti];
      if (!frame.counts[type]) {
        frame.ti++;
        frame.o = 0;
        frame.v = 0;
        continue;
      }
      const oris = ORI[type];
      if (frame.o >= oris.length) {
        frame.ti++;
        frame.o = 0;
        frame.v = 0;
        continue;
      }
      const ori = oris[frame.o];
      if (frame.v >= ori.verts.length) {
        frame.o++;
        frame.v = 0;
        continue;
      }
      const v = frame.v++;
      const placed = ensureCCW(cleanPoly(placeOri(ori, v, corner.at)));
      const pieceTurn = turnAt(placed, corner.at);
      if (pieceTurn === null || pieceTurn + 1e-8 < corner.angle) continue;
      if (!edgeMeetsCorner(placed, corner.at, region)) continue;
      const placedKey = canonicalKey(placed);
      if (frame.tried.has(placedKey)) continue;
      frame.tried.add(placedKey);
      if (!pieceInside(placed, region)) continue;
      return { type: type, flip: ori.flip, rot45: ori.rot45, placed: placed };
    }
    return null;
  }

  function startGeom(startPoly, limit) {
    const root = ensureCCW(cleanPoly(startPoly));
    return {
      nodes: 0,
      limit: limit || 20000,
      status: "running",
      solution: null,
      seen: new Set(),
      stack: [
        {
          parts: [root],
          counts: { large: 2, medium: 1, square: 1, para: 1, small: 2 },
          via: null,
          entered: false,
        },
      ],
    };
  }

  function stepGeom(state, budget) {
    let used = 0;
    const cap = budget || 1;
    while (state.status === "running" && state.stack.length && used < cap) {
      const frame = state.stack[state.stack.length - 1];
      if (!frame.entered) {
        frame.entered = true;
        state.nodes++;
        used++;
        if (state.nodes > state.limit) {
          state.status = "limit";
          break;
        }
        const stamp = keyOf(frame.parts, frame.counts);
        if (state.seen.has(stamp)) {
          state.stack.pop();
          continue;
        }
        state.seen.add(stamp);
        let left = 0;
        for (let t = 0; t < TYPE_AREA_ORDER.length; t++) left += frame.counts[TYPE_AREA_ORDER[t]];
        if (left === 0) {
          if (!frame.parts.length || frame.parts.every(function (part) { return nSign(shoelace(part)) === 0; })) {
            state.status = "solved";
            state.solution = [];
            for (let i = 0; i < state.stack.length; i++) {
              if (state.stack[i].via) state.solution.push(state.stack[i].via);
            }
          }
          state.stack.pop();
          continue;
        }
        if (!frame.parts.length) {
          state.stack.pop();
          continue;
        }
        let corner = null;
        let partIndex = -1;
        for (let i = 0; i < frame.parts.length; i++) {
          const corners = convexCorners(frame.parts[i]);
          if (!corners.length) continue;
          if (!corner || corners[0].angle > corner.angle) {
            corner = corners[0];
            partIndex = i;
          }
        }
        if (!corner) {
          state.stack.pop();
          continue;
        }
        frame.corner = corner;
        frame.partIndex = partIndex;
        frame.region = frame.parts[partIndex];
        frame.ti = 0;
        frame.o = 0;
        frame.v = 0;
        frame.tried = new Set();
        continue;
      }
      const placement = takeNext(frame);
      used++;
      if (!placement) {
        state.stack.pop();
        continue;
      }
      const diff = subtractPoly(frame.region, placement.placed);
      if (!diff) continue;
      const nextCounts = cloneCounts(frame.counts);
      nextCounts[placement.type]--;
      const nextParts = [];
      for (let p = 0; p < frame.parts.length; p++) {
        if (p !== frame.partIndex) nextParts.push(frame.parts[p]);
      }
      for (let d = 0; d < diff.length; d++) nextParts.push(diff[d]);
      state.stack.push({
        parts: nextParts,
        counts: nextCounts,
        via: {
          type: placement.type,
          flip: placement.flip,
          rot45: placement.rot45,
          outer: placement.placed.map(pNum),
        },
        entered: false,
      });
    }
    if (state.status === "running" && !state.stack.length) state.status = "none";
    return state;
  }

  function solveGeom(startPoly, limit) {
    const state = startGeom(startPoly, limit);
    while (state.status === "running") stepGeom(state, 1000000);
    return state;
  }

  const MODULE = [];
  for (let a = -14; a <= 14; a++) {
    for (let b = -4; b <= 4; b++) {
      MODULE.push({ a: a, b: b, den: 2, v: (a + b * Math.SQRT2) / 2 });
    }
  }

  function moduleChoices(value) {
    const found = [];
    for (let i = 0; i < MODULE.length; i++) {
      const d = Math.abs(MODULE[i].v - value);
      if (d > 0.12) continue;
      const pen = Math.abs(MODULE[i].a) + Math.abs(MODULE[i].b);
      found.push({
        a: MODULE[i].a,
        b: MODULE[i].b,
        v: MODULE[i].v,
        err: d,
        score: d + pen * 0.01,
      });
    }
    found.sort(function (p, q) {
      return p.score - q.score || p.err - q.err;
    });
    const out = [];
    for (let i = 0; i < found.length; i++) {
      let dup = false;
      for (let j = 0; j < out.length; j++) {
        if (Math.abs(out[j].v - found[i].v) < 1e-8) dup = true;
      }
      if (dup) continue;
      out.push(found[i]);
      if (out.length === 2) break;
    }
    return out;
  }

  function nearestModule(value) {
    const choices = moduleChoices(value);
    if (!choices.length) return { num: num(0, 0, 1), err: Infinity };
    const best = choices[0];
    return { num: num(best.a, best.b, 2), err: best.err };
  }

  function edgesFamily(poly) {
    for (let i = 0; i < poly.length; i++) {
      if (!lineKind(poly[i], poly[(i + 1) % poly.length])) return false;
    }
    return true;
  }

  function floatEdgeKind(a, b) {
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const m = ((Math.round(ang / (Math.PI / 4)) % 8) + 8) % 8;
    if (m === 0 || m === 4) return "h";
    if (m === 2 || m === 6) return "v";
    if (m === 1 || m === 5) return "p";
    return "m";
  }

  function mergeParallel(points) {
    const out = [];
    for (let i = 0; i < points.length; i++) {
      const prev = points[(i + points.length - 1) % points.length];
      const next = points[(i + 1) % points.length];
      if (floatEdgeKind(prev, points[i]) === floatEdgeKind(points[i], next)) continue;
      out.push(points[i]);
    }
    return out.length >= 3 ? out : points;
  }

  function lineFrom(kind, c) {
    const zero = num(0, 0, 1);
    const one = num(1, 0, 1);
    if (kind === "h") return [pt(zero, c), pt(one, c)];
    if (kind === "v") return [pt(c, zero), pt(c, one)];
    if (kind === "p") return [pt(zero, c), pt(one, nAdd(c, one))];
    return [pt(zero, c), pt(one, nSub(c, one))];
  }

  function polygonFromOffsets(kinds, choices, pick) {
    const snapped = [];
    for (let i = 0; i < kinds.length; i++) {
      const prev = (i + kinds.length - 1) % kinds.length;
      if (kinds[prev] === kinds[i]) return null;
      const ca = choices[prev][pick[prev]];
      const cb = choices[i][pick[i]];
      const la = lineFrom(kinds[prev], num(ca.a, ca.b, 2));
      const lb = lineFrom(kinds[i], num(cb.a, cb.b, 2));
      const hit = lineHit(la[0], la[1], lb[0], lb[1]);
      if (!hit) return null;
      snapped.push(hit);
    }
    return snapped;
  }

  function fitModulePolygon(points) {
    if (!points || points.length < 3) return null;
    const merged = mergeParallel(points);
    let area = 0;
    for (let i = 0; i < merged.length; i++) {
      const a = merged[i];
      const b = merged[(i + 1) % merged.length];
      area += a[0] * b[1] - b[0] * a[1];
    }
    area = Math.abs(area) / 2;
    if (area < 1e-6) return null;
    const unit0 = Math.sqrt(area / 8);
    const kinds = [];
    for (let i = 0; i < merged.length; i++) kinds.push(floatEdgeKind(merged[i], merged[(i + 1) % merged.length]));
    const x0 = merged[0][0];
    const y0 = merged[0][1];
    let best = null;
    const promising = [];
    for (let s = 0.9; s <= 1.12 + 1e-9; s += 0.004) {
      const unit = unit0 * s;
      const choices = [];
      let ok = true;
      for (let i = 0; i < merged.length; i++) {
        const a = merged[i];
        const b = merged[(i + 1) % merged.length];
        const x = ((a[0] + b[0]) / 2 - x0) / unit;
        const y = ((a[1] + b[1]) / 2 - y0) / unit;
        let raw = y;
        if (kinds[i] === "v") raw = x;
        else if (kinds[i] === "p") raw = y - x;
        else if (kinds[i] === "m") raw = x + y;
        const opts = moduleChoices(raw);
        if (!opts.length) {
          ok = false;
          break;
        }
        choices.push(opts);
      }
      if (!ok) continue;
      const primary = new Array(merged.length).fill(0);
      const primarySnap = polygonFromOffsets(kinds, choices, primary);
      let primaryErr = primarySnap ? 0 : Infinity;
      if (primarySnap) {
        for (let i = 0; i < primarySnap.length; i++) {
          const vx = (merged[i][0] - x0) / unit;
          const vy = (merged[i][1] - y0) / unit;
          primaryErr = Math.max(primaryErr, Math.abs(vx - nNum(primarySnap[i].x)), Math.abs(vy - nNum(primarySnap[i].y)));
        }
      }
      if (primaryErr > 0.08) continue;
      promising.push({ choices: choices, unit: unit, primaryErr: primaryErr });
    }
    promising.sort(function (a, b) { return a.primaryErr - b.primaryErr; });
    const pool = promising.slice(0, 3);
    for (let p = 0; p < pool.length; p++) {
      const choices = pool[p].choices;
      const unit = pool[p].unit;
      const ambiguous = [];
      for (let i = 0; i < choices.length; i++) {
        if (choices[i].length > 1) ambiguous.push(i);
      }
      ambiguous.sort(function (i, j) {
        return (choices[i][1].score - choices[i][0].score) - (choices[j][1].score - choices[j][0].score);
      });
      const flip = ambiguous.slice(0, 6);
      const ways = 1 << flip.length;
      for (let mask = 0; mask < ways; mask++) {
        const pick = new Array(choices.length).fill(0);
        for (let b = 0; b < flip.length; b++) if (mask & (1 << b)) pick[flip[b]] = 1;
        const snapped = polygonFromOffsets(kinds, choices, pick);
        if (!snapped) continue;
        let maxErr = 0;
        for (let i = 0; i < snapped.length; i++) {
          const vx = (merged[i][0] - x0) / unit;
          const vy = (merged[i][1] - y0) / unit;
          maxErr = Math.max(maxErr, Math.abs(vx - nNum(snapped[i].x)), Math.abs(vy - nNum(snapped[i].y)));
        }
        if (maxErr > 0.12) continue;
        const cleaned = cleanPoly(snapped);
        if (cleaned.length < 3 || !edgesFamily(cleaned)) continue;
        const signed = shoelace(cleaned);
        const absArea = nSign(signed) < 0 ? nNeg(signed) : signed;
        if (!nEq(absArea, num(16, 0, 1))) continue;
        let complexity = 0;
        for (let i = 0; i < cleaned.length; i++) {
          const x = num(cleaned[i].x.a, cleaned[i].x.b, cleaned[i].x.den);
          const y = num(cleaned[i].y.a, cleaned[i].y.b, cleaned[i].y.den);
          complexity += Math.abs(x.a) + Math.abs(x.b) + Math.abs(y.a) + Math.abs(y.b);
        }
        if (!best || complexity < best.complexity - 1e-9 || (complexity === best.complexity && maxErr < best.maxErr - 1e-9)) {
          best = { maxErr: maxErr, unit: unit, pts: ensureCCW(cleaned), complexity: complexity };
        }
      }
    }
    return best;
  }

  function presentGeom(solution) {
    const pieces = solution.map(function (p, i) {
      return { index: i, outer: p.outer, type: p.type, flip: p.flip, rot45: p.rot45 };
    });
    function centroid(outer) {
      let x = 0;
      let y = 0;
      for (let i = 0; i < outer.length; i++) {
        x += outer[i][0];
        y += outer[i][1];
      }
      return [x / outer.length, y / outer.length];
    }
    function share(a, b) {
      let total = 0;
      for (let i = 0; i < a.length; i++) {
        const a1 = a[i];
        const a2 = a[(i + 1) % a.length];
        for (let j = 0; j < b.length; j++) {
          const b1 = b[j];
          const b2 = b[(j + 1) % b.length];
          const dxa = a2[0] - a1[0];
          const dya = a2[1] - a1[1];
          const dxb = b2[0] - b1[0];
          const dyb = b2[1] - b1[1];
          const cross = dxa * dyb - dya * dxb;
          if (Math.abs(cross) > 1e-6) continue;
          const len = Math.hypot(dxa, dya);
          if (len < 1e-8) continue;
          function proj(p) {
            return ((p[0] - a1[0]) * dxa + (p[1] - a1[1]) * dya) / (len * len);
          }
          const t1 = Math.max(0, Math.min(proj(b1), proj(b2)));
          const t0 = Math.min(1, Math.max(proj(b1), proj(b2)));
          const lo = Math.max(0, Math.min(t0, t1));
          const hi = Math.min(1, Math.max(t0, t1));
          if (hi > lo) total += (hi - lo) * len;
        }
      }
      return total;
    }
    pieces.sort(function (a, b) {
      const ca = centroid(a.outer);
      const cb = centroid(b.outer);
      if (ca[1] !== cb[1]) return ca[1] - cb[1];
      return ca[0] - cb[0];
    });
    const ordered = [pieces[0]];
    const used = new Set([pieces[0].index]);
    while (ordered.length < pieces.length) {
      let best = null;
      let bestScore = -1;
      for (let i = 0; i < pieces.length; i++) {
        if (used.has(pieces[i].index)) continue;
        let s = 0;
        for (let k = 0; k < ordered.length; k++) s += share(pieces[i].outer, ordered[k].outer);
        const ci = centroid(pieces[i].outer);
        if (!best || s > bestScore + 1e-6 || (Math.abs(s - bestScore) <= 1e-6 && (ci[1] < centroid(best.outer)[1] || (ci[1] === centroid(best.outer)[1] && ci[0] < centroid(best.outer)[0])))) {
          best = pieces[i];
          bestScore = s;
        }
      }
      ordered.push(best);
      used.add(best.index);
    }
    const typeSeen = { large: 0, medium: 0, square: 0, para: 0, small: 0 };
    return ordered.map(function (p, step) {
      const style = Tangram.PIECE_STYLE[p.type];
      const n = typeSeen[p.type]++;
      const label = style.name + (style.colors.length > 1 ? (n === 0 ? "甲" : "乙") : "");
      return {
        step: step + 1,
        type: p.type,
        name: style.name,
        label: label,
        color: style.colors[Math.min(n, style.colors.length - 1)],
        flip: p.flip,
        rot: Math.round(p.rot45 / 2) % 4,
        rot45: p.rot45,
        outer: p.outer,
        center: centroid(p.outer),
      };
    });
  }

  Tangram.num = num;
  Tangram.nNum = nNum;
  Tangram.nEq = nEq;
  Tangram.shoelaceExact = shoelace;
  Tangram.exactPoint = pt;
  Tangram.solveGeom = solveGeom;
  Tangram.startGeom = startGeom;
  Tangram.stepGeom = stepGeom;
  Tangram.fitModulePolygon = fitModulePolygon;
  Tangram.presentGeom = presentGeom;
  Tangram.shiftMinExact = shiftMin;
  Tangram.pNum = pNum;
  Tangram.nNeg = nNeg;
  Tangram.geomOriCounts = {
    large: ORI.large.length,
    medium: ORI.medium.length,
    small: ORI.small.length,
    square: ORI.square.length,
    para: ORI.para.length,
  };
})();
