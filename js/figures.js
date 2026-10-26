var Tangram = globalThis.Tangram || (globalThis.Tangram = {});

(function () {
  "use strict";

  // Outlines sit on the integer grid. Each one is a lattice tangram:
  // area 8, edges horizontal, vertical, or 45 degrees.
  Tangram.FIGURES = [
    {
      id: "square",
      name: "正方形",
      points: [
        [2, 0],
        [4, 2],
        [2, 4],
        [0, 2],
      ],
    },
    {
      id: "triangle",
      name: "直角三角形",
      points: [
        [0, 0],
        [4, 0],
        [0, 4],
      ],
    },
    {
      id: "rect",
      name: "矩形",
      points: [
        [0, 0],
        [4, 0],
        [4, 2],
        [0, 2],
      ],
    },
    {
      id: "arrow",
      name: "箭头",
      points: [
        [0, 2],
        [1, 2],
        [1, 0],
        [3, 0],
        [3, 2],
        [4, 2],
        [2, 4],
      ],
    },
    {
      id: "house",
      name: "小屋",
      points: [
        [0, 0],
        [4, 0],
        [4, 1],
        [2, 3],
        [0, 1],
      ],
    },
    {
      id: "bird",
      name: "飞鸟",
      points: [
        [3, 3],
        [2, 3],
        [0, 1],
        [0, 0],
        [1, 1],
        [3, 1],
        [3, 2],
        [4, 1],
        [4, 4],
        [3, 5],
        [2, 5],
        [3, 4],
      ],
    },
    {
      id: "swan",
      name: "天鹅",
      points: [
        [1, 5],
        [0, 4],
        [1, 3],
        [0, 3],
        [2, 1],
        [2, 0],
        [3, 1],
        [2, 2],
        [2, 3],
        [3, 3],
        [3, 5],
      ],
    },
    {
      id: "fish",
      name: "鱼",
      points: [
        [1, 4],
        [1, 3],
        [0, 3],
        [1, 2],
        [0, 2],
        [0, 1],
        [1, 1],
        [1, 0],
        [2, 1],
        [3, 0],
        [3, 1],
        [4, 2],
        [3, 2],
        [2, 3],
        [3, 4],
      ],
    },
    {
      id: "dog",
      name: "小狗",
      points: [
        [1, 0],
        [3, 0],
        [3, 1],
        [4, 1],
        [4, 2],
        [5, 2],
        [5, 3],
        [4, 3],
        [3, 2],
        [1, 2],
        [2, 3],
        [1, 3],
        [0, 2],
        [1, 1],
      ],
    },
    {
      id: "fox",
      name: "狐狸",
      points: [
        [1, 3],
        [1, 4],
        [0, 3],
        [1, 2],
        [0, 2],
        [1, 1],
        [0, 0],
        [1, 0],
        [2, 1],
        [3, 1],
        [3, 2],
        [4, 2],
        [4, 4],
        [3, 3],
      ],
    },
    {
      id: "run",
      name: "奔跑",
      points: [
        [3, 2],
        [2, 2],
        [0, 0],
        [1, 0],
        [2, 1],
        [2, 0],
        [3, 1],
        [3, 0],
        [5, 0],
        [4, 1],
        [4, 3],
        [5, 3],
        [4, 4],
        [3, 3],
        [2, 3],
      ],
    },
    {
      id: "person",
      name: "小人",
      points: [
        [0, 3],
        [1, 3],
        [1, 2],
        [2, 1],
        [3, 1],
        [3, 0],
        [4, 1],
        [3, 2],
        [3, 3],
        [4, 3],
        [3, 4],
        [2, 4],
        [2, 5],
      ],
    },
  ];

  Tangram.SAMPLE_FAIL = {
    id: "thin",
    name: "细长条",
    points: [
      [0, 0],
      [8, 0],
      [8, 1],
      [0, 1],
    ],
  };

  function transformPoints(points, flip, rot) {
    return points.map(function (p) {
      let x = p[0];
      let y = p[1];
      if (flip) y = -y;
      for (let i = 0; i < rot; i++) {
        const nx = -y;
        const ny = x;
        x = nx;
        y = ny;
      }
      return [x, y];
    });
  }

  function quarterSet(quarters, dx, dy) {
    const set = new Set();
    for (let i = 0; i < quarters.length; i++) {
      const q = quarters[i];
      set.add(q.cx + dx + "," + (q.cy + dy) + "," + q.q);
    }
    return set;
  }

  function iou(a, b) {
    let inter = 0;
    a.forEach(function (k) {
      if (b.has(k)) inter++;
    });
    const union = a.size + b.size - inter;
    return union === 0 ? 0 : inter / union;
  }

  function bestShift(userSet, quarters) {
    let minUx = Infinity;
    let minUy = Infinity;
    let maxUx = -Infinity;
    let maxUy = -Infinity;
    userSet.forEach(function (k) {
      const p = k.split(",").map(Number);
      if (p[0] < minUx) minUx = p[0];
      if (p[1] < minUy) minUy = p[1];
      if (p[0] > maxUx) maxUx = p[0];
      if (p[1] > maxUy) maxUy = p[1];
    });
    let minFx = Infinity;
    let minFy = Infinity;
    let maxFx = -Infinity;
    let maxFy = -Infinity;
    for (let i = 0; i < quarters.length; i++) {
      const q = quarters[i];
      if (q.cx < minFx) minFx = q.cx;
      if (q.cy < minFy) minFy = q.cy;
      if (q.cx > maxFx) maxFx = q.cx;
      if (q.cy > maxFy) maxFy = q.cy;
    }
    let best = 0;
    for (let dx = minUx - maxFx; dx <= maxUx - minFx; dx++) {
      for (let dy = minUy - maxFy; dy <= maxUy - minFy; dy++) {
        const score = iou(userSet, quarterSet(quarters, dx, dy));
        if (score > best) best = score;
      }
    }
    return best;
  }

  const variants = [];

  Tangram.prepareFigures = function () {
    variants.length = 0;
    Tangram.FIGURES.forEach(function (fig) {
      fig.ready = null;
      const analysis = Tangram.analyze(fig.points);
      if (!analysis.ok) return;
      const solved = Tangram.solveSync(analysis.quarters, 200000);
      if (!solved || solved.status !== "solved") return;
      fig.ready = {
        analysis: analysis,
        solution: solved.solution,
        steps: Tangram.presentSolution(analysis.quarters, solved.solution),
      };
      for (let flip = 0; flip <= 1; flip++) {
        for (let rot = 0; rot < 4; rot++) {
          const pts = Tangram.cleanPoints(transformPoints(fig.points, flip === 1, rot));
          const raster = Tangram.rasterize(pts);
          if (!raster.quarters.length) continue;
          variants.push({ figure: fig, points: pts, quarters: raster.quarters });
        }
      }
    });
  };

  Tangram.closestFigure = function (quarters) {
    if (!quarters || !quarters.length || !variants.length) return null;
    const user = new Set(
      quarters.map(function (q) {
        return q.cx + "," + q.cy + "," + q.q;
      })
    );
    let best = null;
    for (let i = 0; i < variants.length; i++) {
      const v = variants[i];
      const score = bestShift(user, v.quarters);
      if (!best || score > best.iou) {
        best = { id: v.figure.id, name: v.figure.name, points: v.points, iou: score };
      }
    }
    return best;
  };
})();
