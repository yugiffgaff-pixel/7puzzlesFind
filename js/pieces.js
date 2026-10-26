var Tangram = globalThis.Tangram || (globalThis.Tangram = {});

(function () {
  "use strict";

  const BASES = [
    { type: "large", outer: [[0, 0], [2, 0], [0, 2]] },
    { type: "medium", outer: [[0, 0], [2, 0], [1, 1]] },
    { type: "small", outer: [[0, 0], [1, 0], [0, 1]] },
    { type: "square", outer: [[0, 0], [1, 0], [1, 1], [0, 1]] },
    { type: "para", outer: [[0, 0], [1, 0], [2, 1], [1, 1]] },
  ];

  const STYLE = {
    large: { name: "大三角", colors: ["#d84a32", "#ef9f1a"] },
    medium: { name: "中三角", colors: ["#2c6eae"] },
    small: { name: "小三角", colors: ["#e2b43c", "#c73766"] },
    square: { name: "正方形", colors: ["#6d4ca8"] },
    para: { name: "平行四边形", colors: ["#1f8a6d"] },
  };

  const EXPECTED = { large: 8, medium: 4, small: 2, square: 4, para: 4 };

  function transformPoint(x, y, flip, rot) {
    if (flip) y = -y;
    for (let i = 0; i < rot; i++) {
      const nx = -y;
      const ny = x;
      x = nx;
      y = ny;
    }
    return [x, y];
  }

  function normalizeOrientation(type, outer, flip, rot) {
    const cleaned = Tangram.cleanPoints(outer);
    const raster = Tangram.rasterize(cleaned);
    if (raster.boundary !== 0) return null;
    if (raster.quarters.length !== EXPECTED[type]) return null;
    let minCx = Infinity;
    let minCy = Infinity;
    let maxCx = -Infinity;
    let maxCy = -Infinity;
    for (let i = 0; i < raster.quarters.length; i++) {
      const q = raster.quarters[i];
      if (q.cx < minCx) minCx = q.cx;
      if (q.cy < minCy) minCy = q.cy;
      if (q.cx > maxCx) maxCx = q.cx;
      if (q.cy > maxCy) maxCy = q.cy;
    }
    const quarters = raster.quarters.map(function (q) {
      return { cx: q.cx - minCx, cy: q.cy - minCy, q: q.q };
    });
    quarters.sort(function (a, b) {
      if (a.cx !== b.cx) return a.cx - b.cx;
      if (a.cy !== b.cy) return a.cy - b.cy;
      return a.q - b.q;
    });
    const normOuter = cleaned.map(function (p) {
      return [p[0] - minCx, p[1] - minCy];
    });
    const key = quarters
      .map(function (q) {
        return Tangram.quarterKey(q);
      })
      .join(";");
    return {
      type: type,
      flip: flip,
      rot: rot,
      quarters: quarters,
      outer: normOuter,
      key: key,
      maxCx: maxCx - minCx,
      maxCy: maxCy - minCy,
    };
  }

  const orientations = [];
  const byType = { large: [], medium: [], small: [], square: [], para: [] };
  const seen = new Set();

  BASES.forEach(function (base) {
    for (let flip = 0; flip <= 1; flip++) {
      for (let rot = 0; rot < 4; rot++) {
        const outer = base.outer.map(function (p) {
          return transformPoint(p[0], p[1], flip === 1, rot);
        });
        const ori = normalizeOrientation(base.type, outer, flip === 1, rot);
        if (!ori) continue;
        if (seen.has(base.type + "|" + ori.key)) continue;
        seen.add(base.type + "|" + ori.key);
        ori.id = base.type + "-" + byType[base.type].length;
        orientations.push(ori);
        byType[base.type].push(ori);
      }
    }
  });

  Tangram.PIECE_STYLE = STYLE;
  Tangram.PIECE_QUARTERS = EXPECTED;
  Tangram.orientations = byType;
  Tangram.basePieces = BASES.map(function (base) {
    return { type: base.type, name: STYLE[base.type].name, outer: base.outer.slice() };
  });
})();
