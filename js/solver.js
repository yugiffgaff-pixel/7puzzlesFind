var Tangram = globalThis.Tangram || (globalThis.Tangram = {});

(function () {
  "use strict";

  const TYPE_ORDER = ["large", "medium", "square", "para", "small"];

  function popcount(n) {
    let c = 0;
    let x = n;
    while (x) {
      x &= x - 1n;
      c++;
    }
    return c;
  }

  function buildPlacements(quarters) {
    const bitOf = new Map();
    quarters.forEach(function (q, i) {
      bitOf.set(Tangram.quarterKey(q), i);
    });
    let minCx = Infinity;
    let minCy = Infinity;
    let maxCx = -Infinity;
    let maxCy = -Infinity;
    for (let i = 0; i < quarters.length; i++) {
      const q = quarters[i];
      if (q.cx < minCx) minCx = q.cx;
      if (q.cy < minCy) minCy = q.cy;
      if (q.cx > maxCx) maxCx = q.cx;
      if (q.cy > maxCy) maxCy = q.cy;
    }
    const all = [];
    TYPE_ORDER.forEach(function (type) {
      const oris = Tangram.orientations[type];
      for (let o = 0; o < oris.length; o++) {
        const ori = oris[o];
        const dx0 = minCx - ori.maxCx;
        const dx1 = maxCx;
        const dy0 = minCy - ori.maxCy;
        const dy1 = maxCy;
        for (let dx = dx0; dx <= dx1; dx++) {
          for (let dy = dy0; dy <= dy1; dy++) {
            let mask = 0n;
            let ok = true;
            for (let k = 0; k < ori.quarters.length; k++) {
              const q = ori.quarters[k];
              const key = q.cx + dx + "," + (q.cy + dy) + "," + q.q;
              if (!bitOf.has(key)) {
                ok = false;
                break;
              }
              mask |= 1n << BigInt(bitOf.get(key));
            }
            if (!ok) continue;
            if (popcount(mask) !== ori.quarters.length) continue;
            all.push({
              type: type,
              flip: ori.flip,
              rot: ori.rot,
              mask: mask,
              dx: dx,
              dy: dy,
              outer: ori.outer.map(function (p) {
                return [p[0] + dx, p[1] + dy];
              }),
            });
          }
        }
      }
    });
    const bitLists = Array.from({ length: quarters.length }, function () {
      return [];
    });
    const seen = new Set();
    const unique = [];
    for (let i = 0; i < all.length; i++) {
      const p = all[i];
      const id = p.type + ":" + p.mask.toString();
      if (seen.has(id)) continue;
      seen.add(id);
      p.pid = unique.length;
      unique.push(p);
    }
    unique.sort(function (a, b) {
      if (a.type !== b.type) return TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type);
      if (a.mask < b.mask) return -1;
      if (a.mask > b.mask) return 1;
      return 0;
    });
    for (let i = 0; i < unique.length; i++) {
      let m = unique[i].mask;
      let bit = 0;
      while (m) {
        if (m & 1n) bitLists[bit].push(unique[i]);
        m >>= 1n;
        bit++;
      }
    }
    const byTypeCount = { large: 0, medium: 0, square: 0, para: 0, small: 0 };
    for (let i = 0; i < unique.length; i++) byTypeCount[unique[i].type]++;
    return { bitLists: bitLists, count: byTypeCount, placements: unique };
  }

  function countsAllZero(counts) {
    return (
      counts.large === 0 &&
      counts.medium === 0 &&
      counts.square === 0 &&
      counts.para === 0 &&
      counts.small === 0
    );
  }

  function optionsFor(mask, counts, bitLists) {
    let best = null;
    let bit = 0;
    let m = mask;
    while (m) {
      if (m & 1n) {
        const list = bitLists[bit];
        const cand = [];
        for (let i = 0; i < list.length; i++) {
          const p = list[i];
          if (counts[p.type] <= 0) continue;
          if ((mask & p.mask) === p.mask) cand.push(p);
        }
        if (cand.length === 0) return null;
        if (!best || cand.length < best.length) best = cand;
      }
      m >>= 1n;
      bit++;
    }
    return best || [];
  }

  function solveQuarters(quarters, limit) {
    if (quarters.length !== Tangram.TARGET_QUARTERS) {
      return { status: "none", nodes: 0, solution: null, reason: "count" };
    }
    const built = buildPlacements(quarters);
    const need = { large: 2, medium: 1, square: 1, para: 1, small: 2 };
    const types = Object.keys(need);
    for (let i = 0; i < types.length; i++) {
      if (built.count[types[i]] < 1) {
        return { status: "none", nodes: 0, solution: null, reason: "missing-" + types[i] };
      }
    }
    const full = (1n << BigInt(quarters.length)) - 1n;
    const first = optionsFor(full, need, built.bitLists);
    if (!first || first.length === 0) {
      return { status: "none", nodes: 1, solution: null, reason: "no-cover" };
    }
    const state = {
      limit: limit || 300000,
      nodes: 0,
      status: "running",
      bitLists: built.bitLists,
      stack: [{ mask: full, counts: need, options: first, index: 0, via: null }],
      solution: null,
    };
    return state;
  }

  function stepSolve(state, budget) {
    let steps = 0;
    const cap = budget || 5000;
    while (state.status === "running" && steps < cap) {
      steps++;
      state.nodes++;
      if (state.nodes > state.limit) {
        state.status = "limit";
        break;
      }
      const frame = state.stack[state.stack.length - 1];
      if (!frame || frame.index >= frame.options.length) {
        state.stack.pop();
        if (state.stack.length === 0) state.status = "none";
        continue;
      }
      const placement = frame.options[frame.index++];
      const nextCounts = {
        large: frame.counts.large,
        medium: frame.counts.medium,
        square: frame.counts.square,
        para: frame.counts.para,
        small: frame.counts.small,
      };
      nextCounts[placement.type]--;
      const nextMask = frame.mask ^ placement.mask;
      if (countsAllZero(nextCounts)) {
        if (nextMask === 0n) {
          const chosen = [];
          for (let i = 0; i < state.stack.length; i++) {
            if (state.stack[i].via) chosen.push(state.stack[i].via);
          }
          chosen.push(placement);
          state.solution = chosen;
          state.status = "solved";
        }
        continue;
      }
      const opts = optionsFor(nextMask, nextCounts, state.bitLists);
      if (!opts) continue;
      state.stack.push({
        mask: nextMask,
        counts: nextCounts,
        options: opts,
        index: 0,
        via: placement,
      });
    }
    return state;
  }

  function runSolve(quarters, limit) {
    const state = solveQuarters(quarters, limit);
    if (state.status !== "running") return state;
    while (state.status === "running") stepSolve(state, 20000);
    return state;
  }

  function pieceIndexByQuarter(quarters, solution) {
    const map = new Map();
    quarters.forEach(function (q, i) {
      map.set(i, -1);
    });
    for (let s = 0; s < solution.length; s++) {
      let m = solution[s].mask;
      let bit = 0;
      while (m) {
        if (m & 1n) map.set(bit, s);
        m >>= 1n;
        bit++;
      }
    }
    return map;
  }

  function sharedScore(quarters, solution) {
    const owner = new Map();
    quarters.forEach(function (q, i) {
      owner.set(Tangram.quarterKey(q), i);
    });
    const ownerBit = pieceIndexByQuarter(quarters, solution);
    const score = solution.map(function () {
      return solution.map(function () {
        return 0;
      });
    });
    for (let i = 0; i < quarters.length; i++) {
      const a = ownerBit.get(i);
      const nbs = Tangram.neighborsOf(quarters[i]);
      for (let k = 0; k < nbs.length; k++) {
        const jKey = Tangram.quarterKey(nbs[k]);
        if (!owner.has(jKey)) continue;
        const j = owner.get(jKey);
        if (j <= i) continue;
        const b = ownerBit.get(j);
        if (a !== b && a >= 0 && b >= 0) {
          score[a][b]++;
          score[b][a]++;
        }
      }
    }
    return score;
  }

  function centroid(outer) {
    let x = 0;
    let y = 0;
    for (let i = 0; i < outer.length; i++) {
      x += outer[i][0];
      y += outer[i][1];
    }
    return [x / outer.length, y / outer.length];
  }

  function presentSolution(quarters, solution) {
    const score = sharedScore(quarters, solution);
    const remaining = solution.map(function (_, i) {
      return i;
    });
    remaining.sort(function (a, b) {
      const ca = centroid(solution[a].outer);
      const cb = centroid(solution[b].outer);
      if (ca[1] !== cb[1]) return ca[1] - cb[1];
      return ca[0] - cb[0];
    });
    const ordered = [remaining[0]];
    const used = new Set(ordered);
    while (ordered.length < solution.length) {
      let best = -1;
      let bestScore = -1;
      for (let i = 0; i < solution.length; i++) {
        if (used.has(i)) continue;
        let s = 0;
        for (let k = 0; k < ordered.length; k++) s += score[i][ordered[k]];
        const ci = centroid(solution[i].outer);
        const cb = best < 0 ? null : centroid(solution[best].outer);
        const better =
          s > bestScore ||
          (s === bestScore &&
            best >= 0 &&
            (ci[1] < cb[1] || (ci[1] === cb[1] && ci[0] < cb[0])));
        if (best < 0 || better) {
          best = i;
          bestScore = s;
        }
      }
      ordered.push(best);
      used.add(best);
    }
    const typeSeen = { large: 0, medium: 0, square: 0, para: 0, small: 0 };
    return ordered.map(function (index, step) {
      const p = solution[index];
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
        rot: p.rot,
        outer: p.outer,
        center: centroid(p.outer),
      };
    });
  }

  Tangram.solveQuarters = solveQuarters;
  Tangram.stepSolve = stepSolve;
  Tangram.solveSync = runSolve;
  Tangram.presentSolution = presentSolution;
})();
