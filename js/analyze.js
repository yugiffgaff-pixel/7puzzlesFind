var Tangram = globalThis.Tangram || (globalThis.Tangram = {});

(function () {
  "use strict";

  function fail(code, message, extra) {
    const out = { ok: false, code: code, message: message, quarters: [], area: 0, areaText: "0" };
    if (extra) {
      Object.keys(extra).forEach(function (k) {
        out[k] = extra[k];
      });
    }
    return out;
  }

  function analyze(points) {
    if (!points || points.length < 3) {
      return fail("few", "至少要点出三个顶点，才能围成一块图形。");
    }
    const stats = Tangram.polygonStats(points);
    if (stats.points.length < 3 || stats.shoelace === 0) {
      return fail("empty", "这几个点没有围出面积。", { points: stats.points, area: 0, areaText: "0" });
    }
    if (Tangram.selfIntersects(stats.points)) {
      return fail("intersect", "这些边交叉了。请改成一个不交叉的轮廓。", {
        points: stats.points,
        area: stats.area,
        areaText: stats.areaText,
      });
    }
    const span = stats.doubled.reduce(
      function (acc, p) {
        return [Math.max(acc[0], Math.abs(p[0])), Math.max(acc[1], Math.abs(p[1]))];
      },
      [0, 0]
    );
    if (span[0] > 80 || span[1] > 80) {
      return fail("big", "图形太大了，超出了这张网格能算的范围。", {
        points: stats.points,
        area: stats.area,
        areaText: stats.areaText,
      });
    }
    if (!Tangram.edgesGridAligned(stats.points)) {
      return fail(
        "direction",
        "有的边不是水平、垂直或 45°，或者顶点不在格点上。标准七巧板只沿这三个方向相接。",
        { points: stats.points, area: stats.area, areaText: stats.areaText }
      );
    }
    const raster = Tangram.rasterize(stats.points);
    const absS = Math.abs(raster.shoelace);
    const area = absS / 8;
    const expected = absS / 2;
    if (raster.boundary !== 0 || expected !== raster.quarters.length || absS % 2 !== 0) {
      return fail("grid", "轮廓没有落在七巧板的小三角网格上，没法按标准七块来切。", {
        points: raster.points,
        quarters: raster.quarters,
        area: area,
        areaText: Tangram.formatArea(absS),
      });
    }
    const link = Tangram.connectivity(raster.quarters);
    if (link.overlap) {
      return fail("grid", "轮廓盖住小三角的方式重叠了，没法按标准七块来切。", {
        points: raster.points,
        quarters: raster.quarters,
        area: area,
        areaText: Tangram.formatArea(absS),
      });
    }
    if (link.components !== 1) {
      return fail("disconnect", "图形断开了，有的部分只在一个点上碰到。请连成一整块。", {
        points: raster.points,
        quarters: raster.quarters,
        area: area,
        areaText: Tangram.formatArea(absS),
      });
    }
    const loops = Tangram.traceOutline(raster.quarters);
    if (loops.length !== 1) {
      return fail("hole", "图形中间有空洞，或者外轮廓不止一圈。标准七巧板拼出来的是一整块、中间不留孔。", {
        points: raster.points,
        quarters: raster.quarters,
        area: area,
        areaText: Tangram.formatArea(absS),
      });
    }
    const basic = raster.quarters.length / 2;
    if (raster.quarters.length !== Tangram.TARGET_QUARTERS) {
      return fail(
        "area",
        "现在的面积是 " +
          Tangram.formatArea(absS) +
          "，相当于 " +
          basic +
          " 个最小直角三角形。标准七巧板正好是 16 个（面积 8）。",
        {
          points: raster.points,
          quarters: raster.quarters,
          area: area,
          areaText: Tangram.formatArea(absS),
          basic: basic,
        }
      );
    }
    return {
      ok: true,
      code: "ok",
      message: "",
      points: raster.points,
      quarters: raster.quarters,
      area: area,
      areaText: "8",
      basic: 16,
      outline: loops[0],
    };
  }

  Tangram.analyze = analyze;
})();
