(function () {
  "use strict";

  const board = document.getElementById("board");
  const ctx = board.getContext("2d");
  const wrap = document.getElementById("wrap");
  const meter = document.getElementById("meter");
  const hint = document.getElementById("hint");
  const statusEl = document.getElementById("status");
  const progressEl = document.getElementById("progress");
  const stepsEl = document.getElementById("steps");
  const actionsEl = document.getElementById("step-actions");
  const toolbar = document.getElementById("toolbar");
  const figureBar = document.getElementById("figure-bar");
  const legend = document.getElementById("legend");
  const fileInput = document.getElementById("file");

  const GRID = { minX: -0.55, minY: -0.55, maxX: 8.55, maxY: 6.55 };

  const state = {
    mode: "classic",
    points: [],
    closed: false,
    analysis: null,
    steps: null,
    step: 0,
    status: "",
    note: "",
    progress: "",
    token: 0,
    timer: null,
    figureId: "square",
    suggestion: null,
    backup: null,
  };

  let view = { scale: 40, ox: 0, oy: 0 };

  Tangram.prepareFigures();

  function worldToScreen(x, y) {
    return [view.ox + x * view.scale, view.oy - y * view.scale];
  }

  function screenToWorld(sx, sy) {
    return [(sx - view.ox) / view.scale, (view.oy - sy) / view.scale];
  }

  function boundsOf(points) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    points.forEach(function (p) {
      minX = Math.min(minX, p[0]);
      minY = Math.min(minY, p[1]);
      maxX = Math.max(maxX, p[0]);
      maxY = Math.max(maxY, p[1]);
    });
    if (!isFinite(minX)) return { minX: 0, minY: 0, maxX: 4, maxY: 4 };
    const pad = 0.7;
    return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
  }

  function activeBounds() {
    if (state.mode === "draw" && !state.suggestion && !state.steps) return GRID;
    const pts = state.points.slice();
    if (state.steps) {
      state.steps.forEach(function (s) {
        s.outer.forEach(function (p) {
          pts.push(p);
        });
      });
    }
    return boundsOf(pts);
  }

  function resize() {
    const rect = wrap.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const cssW = Math.max(320, rect.width);
    const cssH = Math.max(280, rect.height);
    board.width = Math.round(cssW * dpr);
    board.height = Math.round(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const b = activeBounds();
    const pad = 18;
    const bw = b.maxX - b.minX;
    const bh = b.maxY - b.minY;
    const scale = Math.min((cssW - pad * 2) / bw, (cssH - pad * 2) / bh);
    view = {
      scale: scale,
      ox: (cssW - bw * scale) / 2 - b.minX * scale,
      oy: (cssH + bh * scale) / 2 + b.minY * scale,
      w: cssW,
      h: cssH,
    };
    draw();
  }

  function drawGrid() {
    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(80, 58, 40, 0.12)";
    ctx.beginPath();
    for (let x = 0; x <= 8; x++) {
      const a = worldToScreen(x, 0);
      const b = worldToScreen(x, 6);
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
    }
    for (let y = 0; y <= 6; y++) {
      const a = worldToScreen(0, y);
      const b = worldToScreen(8, y);
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
    }
    ctx.stroke();
    for (let x = 0; x <= 8; x++) {
      for (let y = 0; y <= 6; y++) {
        const p = worldToScreen(x, y);
        ctx.beginPath();
        ctx.fillStyle = "#8a7564";
        ctx.arc(p[0], p[1], x % 2 === 0 && y % 2 === 0 ? 3.2 : 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function pathOf(outer) {
    ctx.beginPath();
    outer.forEach(function (p, i) {
      const s = worldToScreen(p[0], p[1]);
      if (i === 0) ctx.moveTo(s[0], s[1]);
      else ctx.lineTo(s[0], s[1]);
    });
    ctx.closePath();
  }

  function drawOutline(points, width) {
    if (points.length < 2) return;
    ctx.save();
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = "#241c16";
    ctx.lineWidth = width;
    ctx.beginPath();
    points.forEach(function (p, i) {
      const s = worldToScreen(p[0], p[1]);
      if (i === 0) ctx.moveTo(s[0], s[1]);
      else ctx.lineTo(s[0], s[1]);
    });
    if (state.closed || points.length > 2) ctx.closePath();
    ctx.stroke();
    points.forEach(function (p, i) {
      const s = worldToScreen(p[0], p[1]);
      ctx.beginPath();
      ctx.fillStyle = i === 0 ? "#b6402c" : "#241c16";
      ctx.arc(s[0], s[1], i === 0 ? 5 : 3.5, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }

  function drawPieces() {
    if (!state.steps) return;
    const shown = state.steps.slice(0, state.step);
    shown.forEach(function (piece, index) {
      pathOf(piece.outer);
      ctx.fillStyle = piece.color;
      ctx.fill();
      ctx.lineJoin = "round";
      ctx.lineWidth = index === shown.length - 1 ? 3.5 : 1.6;
      ctx.strokeStyle = "#241c16";
      ctx.stroke();
      const c = worldToScreen(piece.center[0], piece.center[1]);
      ctx.font = "700 15px 'PingFang SC', 'Microsoft YaHei', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 4;
      ctx.strokeStyle = "rgba(255,250,243,0.92)";
      ctx.strokeText(String(piece.step), c[0], c[1]);
      ctx.fillStyle = "#241c16";
      ctx.fillText(String(piece.step), c[0], c[1]);
    });
  }

  function draw() {
    const w = view.w;
    const h = view.h;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#fbf7f1";
    ctx.fillRect(0, 0, w, h);
    if (state.mode === "draw" && !state.suggestion) drawGrid();
    if (state.points.length) {
      drawOutline(state.points, 2.4);
      drawPieces();
      drawOutline(state.points, 2);
    } else if (state.mode !== "draw") {
      ctx.fillStyle = "#6f6256";
      ctx.font = "16px 'PingFang SC', 'Microsoft YaHei', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("选一个图形，或上传一块剪影", w / 2, h / 2);
    }
  }

  function poseText(step) {
    if (step.type === "square") return "四边一样，转 90° 看起来相同。";
    let turn = "按图例的初始方向";
    if (step.rot === 1) turn = "相对图例，逆时针转 90°";
    else if (step.rot === 2) turn = "相对图例，转 180°";
    else if (step.rot === 3) turn = "相对图例，顺时针转 90°";
    if (step.type === "para") turn += step.flip ? "，要翻面" : "，不用翻面";
    return turn + "。";
  }

  function renderMeter() {
    if (state.mode !== "draw" || state.suggestion) {
      meter.textContent = state.mode === "upload" ? "纯色剪影，一块，中间不要有洞。" : "";
      return;
    }
    const n = state.points.length;
    if (n < 3) {
      meter.textContent = "在格点上点。斜边走 45°。闭合后面积要正好是 8。";
      return;
    }
    const stats = Tangram.polygonStats(state.points);
    meter.textContent = "已点 " + n + " 个顶点 · 闭合后面积 " + stats.areaText + "（需要 8）";
  }

  function renderHint() {
    if (state.mode === "classic") {
      hint.textContent = "这些图形都能用标准七巧板拼成。点一个，看分割线和摆放顺序。";
    } else if (state.mode === "draw") {
      hint.textContent = "点格点围出图形。例如正方形可以点 (2,0)、(4,2)、(2,4)、(0,2)。面积不是 8，或边不沿网格，会直接说明原因。";
    } else {
      hint.textContent = "上传一块实心剪影。程序按这张图自己的像素尺寸，把边角收到 45° 网格上。照片和弯曲的轮廓仍会告诉你对不齐，不会硬切。";
    }
  }

  function renderPanel() {
    const prefix = state.note ? state.note + " " : "";
    statusEl.textContent = prefix + (state.status || "");
    progressEl.hidden = !state.progress;
    progressEl.textContent = state.progress || "";
    stepsEl.innerHTML = "";
    if (state.steps) {
      state.steps.forEach(function (step) {
        const li = document.createElement("li");
        if (step.step === state.step) li.className = "current";
        const btn = document.createElement("button");
        btn.type = "button";
        btn.innerHTML =
          "<i></i><b>第 " +
          step.step +
          " 步 · " +
          step.label +
          "</b><small></small>";
        btn.querySelector("i").style.background = step.color;
        btn.querySelector("small").textContent = poseText(step);
        btn.addEventListener("click", function () {
          stopPlay();
          state.step = step.step;
          renderPanel();
          draw();
        });
        li.appendChild(btn);
        stepsEl.appendChild(li);
      });
    }
    actionsEl.innerHTML = "";
    if (state.steps) {
      addAction("上一步", function () {
        stopPlay();
        state.step = Math.max(0, state.step - 1);
        renderPanel();
        draw();
      });
      addAction("下一步", function () {
        stopPlay();
        state.step = Math.min(state.steps.length, state.step + 1);
        renderPanel();
        draw();
      });
      addAction(state.timer ? "停止" : "播放", function () {
        if (state.timer) stopPlay();
        else play();
      });
      addAction("只看轮廓", function () {
        stopPlay();
        state.step = 0;
        renderPanel();
        draw();
      });
    }
    const canSuggest = state.analysis && state.analysis.quarters && state.analysis.quarters.length && !state.steps;
    if (canSuggest && !state.suggestion) {
      addAction("看最接近的可拼图形", showClosest);
    }
    if (state.suggestion) {
      addAction("返回我的图形", restoreBackup);
    }
  }

  function addAction(label, fn) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = label;
    btn.addEventListener("click", fn);
    actionsEl.appendChild(btn);
  }

  function renderToolbar() {
    toolbar.innerHTML = "";
    if (state.mode === "draw") {
      toolButton("闭合", closeShape);
      toolButton("撤销", undoPoint);
      toolButton("清除", clearBoard);
      toolButton("求解", function () {
        if (state.points.length >= 3) {
          state.closed = true;
          solveCurrent();
        }
      }, true);
      toolButton("填入细长条", function () {
        state.points = Tangram.SAMPLE_FAIL.points.map(function (p) {
          return p.slice();
        });
        state.closed = true;
        state.figureId = null;
        state.suggestion = null;
        state.backup = null;
        state.note = "";
        solveCurrent();
      });
    } else if (state.mode === "upload") {
      toolButton("选择图片", function () {
        fileInput.click();
      }, true);
    }
    figureBar.hidden = state.mode !== "classic";
  }

  function toolButton(label, fn, primary) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = label;
    if (primary) btn.className = "primary";
    btn.addEventListener("click", fn);
    toolbar.appendChild(btn);
  }

  function renderFigures() {
    figureBar.innerHTML = "";
    Tangram.FIGURES.forEach(function (fig) {
      if (!fig.ready) return;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = fig.name;
      btn.setAttribute("aria-pressed", fig.id === state.figureId ? "true" : "false");
      btn.addEventListener("click", function () {
        selectFigure(fig);
      });
      figureBar.appendChild(btn);
    });
  }

  function renderLegend() {
    legend.innerHTML = "";
    Tangram.basePieces.forEach(function (piece) {
      const fig = document.createElement("figure");
      const canvas = document.createElement("canvas");
      canvas.width = 120;
      canvas.height = 80;
      const c = canvas.getContext("2d");
      const pts = piece.outer;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      pts.forEach(function (p) {
        minX = Math.min(minX, p[0]);
        minY = Math.min(minY, p[1]);
        maxX = Math.max(maxX, p[0]);
        maxY = Math.max(maxY, p[1]);
      });
      const scale = Math.min(88 / (maxX - minX || 1), 52 / (maxY - minY || 1));
      const ox = 60 - ((minX + maxX) / 2) * scale;
      const oy = 40 + ((minY + maxY) / 2) * scale;
      c.beginPath();
      pts.forEach(function (p, i) {
        const x = ox + p[0] * scale;
        const y = oy - p[1] * scale;
        if (i === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      });
      c.closePath();
      c.fillStyle = Tangram.PIECE_STYLE[piece.type].colors[0];
      c.fill();
      c.lineWidth = 2;
      c.strokeStyle = "#241c16";
      c.stroke();
      const cap = document.createElement("figcaption");
      cap.textContent = piece.name;
      fig.appendChild(canvas);
      fig.appendChild(cap);
      legend.appendChild(fig);
    });
  }

  function stopPlay() {
    if (state.timer) {
      clearInterval(state.timer);
      state.timer = null;
      renderPanel();
    }
  }

  function play() {
    stopPlay();
    if (!state.steps) return;
    if (state.step >= state.steps.length) state.step = 0;
    state.timer = setInterval(function () {
      if (state.step >= state.steps.length) {
        stopPlay();
        return;
      }
      state.step += 1;
      draw();
      renderPanel();
    }, 900);
    renderPanel();
  }

  function setMode(mode) {
    stopPlay();
    state.mode = mode;
    state.suggestion = null;
    state.backup = null;
    state.note = "";
    document.getElementById("tab-classic").setAttribute("aria-selected", mode === "classic" ? "true" : "false");
    document.getElementById("tab-draw").setAttribute("aria-selected", mode === "draw" ? "true" : "false");
    document.getElementById("tab-upload").setAttribute("aria-selected", mode === "upload" ? "true" : "false");
    if (mode === "draw") {
      state.figureId = null;
      state.points = [];
      state.closed = false;
      state.steps = null;
      state.analysis = null;
      state.status = "在格点上围一块图形，再求解。";
      state.progress = "";
    }
    if (mode === "upload") {
      state.figureId = null;
      state.points = [];
      state.closed = false;
      state.steps = null;
      state.analysis = null;
      state.status = "选择一张只有一块实心剪影的图片。";
      state.progress = "";
    }
    if (mode === "classic") {
      const fig = Tangram.FIGURES.find(function (item) {
        return item.id === (state.figureId || "square");
      });
      renderToolbar();
      renderHint();
      renderFigures();
      if (fig) selectFigure(fig);
      return;
    }
    renderToolbar();
    renderHint();
    renderFigures();
    renderMeter();
    renderPanel();
    resize();
  }

  function selectFigure(fig) {
    stopPlay();
    state.mode = "classic";
    state.figureId = fig.id;
    state.suggestion = null;
    state.backup = null;
    state.note = "";
    state.points = fig.points.map(function (p) {
      return p.slice();
    });
    state.closed = true;
    document.getElementById("tab-classic").setAttribute("aria-selected", "true");
    document.getElementById("tab-draw").setAttribute("aria-selected", "false");
    document.getElementById("tab-upload").setAttribute("aria-selected", "false");
    renderFigures();
    renderToolbar();
    renderHint();
    solveCurrent();
  }

  function closeShape() {
    if (state.points.length < 3) {
      state.status = "至少三个顶点才能围成图形。";
      renderPanel();
      return;
    }
    state.closed = true;
    solveCurrent();
  }

  function undoPoint() {
    stopPlay();
    state.points.pop();
    state.closed = false;
    state.steps = null;
    state.analysis = null;
    state.suggestion = null;
    state.note = "";
    state.status = state.points.length ? "已撤销最后一个顶点。" : "在格点上围一块图形，再求解。";
    state.progress = "";
    renderMeter();
    renderPanel();
    resize();
  }

  function clearBoard() {
    stopPlay();
    state.token++;
    state.points = [];
    state.closed = false;
    state.steps = null;
    state.analysis = null;
    state.suggestion = null;
    state.backup = null;
    state.note = "";
    state.progress = "";
    state.status = "在格点上围一块图形，再求解。";
    renderMeter();
    renderPanel();
    resize();
  }

  async function solveCurrent() {
    stopPlay();
    const token = ++state.token;
    state.steps = null;
    state.step = 0;
    state.progress = "";
    const analysis = Tangram.analyze(state.points);
    state.analysis = analysis;
    renderMeter();
    resize();
    if (!analysis.ok) {
      state.status = analysis.message;
      renderPanel();
      return;
    }
    state.status = "正在搜索七块的摆法…";
    renderPanel();
    const search = Tangram.solveQuarters(analysis.quarters, 300000);
    while (search.status === "running") {
      if (token !== state.token) return;
      Tangram.stepSolve(search, 8000);
      if (search.status === "running") {
        state.progress = "已搜索 " + search.nodes + " 步";
        renderPanel();
        await new Promise(function (resolve) {
          setTimeout(resolve, 16);
        });
      }
    }
    if (token !== state.token) return;
    state.progress = "";
    if (search.status === "solved") {
      state.steps = Tangram.presentSolution(analysis.quarters, search.solution);
      state.step = state.steps.length;
      state.status = "可以拼成。分割线就是这七块相接的边。下面从较低的一块开始，按顺序放上。相同的块对调也行，所以拼法可能不止一种。";
    } else if (search.status === "limit") {
      state.status = "已经搜索了 " + search.nodes + " 步，还没有找到拼法。这个轮廓要么拼不出，要么不在标准网格上。";
    } else {
      state.status = "搜索已经走完，这个轮廓用标准七块拼不出来：七块没法同时铺满，又不互相重叠。";
    }
    renderPanel();
    resize();
  }

  function showClosest() {
    if (!state.analysis || !state.analysis.quarters.length) return;
    const near = Tangram.closestFigure(state.analysis.quarters);
    if (!near) {
      state.status = "图库里还没有可比较的图形。";
      renderPanel();
      return;
    }
    state.backup = {
      points: state.points.map(function (p) {
        return p.slice();
      }),
      mode: state.mode,
      figureId: state.figureId,
      note: state.note,
    };
    state.suggestion = near;
    const pct = Math.round(near.iou * 100);
    const lead = near.iou < 0.35 ? "图库里没有很像的。" : "这不是你提交的那块图形。";
    state.note = lead + "下面是形状最接近、而且确实能拼成的「" + near.name + "」，相似度 " + pct + "%。";
    state.points = near.points.map(function (p) {
      return p.slice();
    });
    state.closed = true;
    solveCurrent();
  }

  function restoreBackup() {
    if (!state.backup) return;
    stopPlay();
    state.points = state.backup.points;
    state.mode = state.backup.mode;
    state.figureId = state.backup.figureId;
    state.note = "";
    state.suggestion = null;
    state.backup = null;
    state.closed = true;
    document.getElementById("tab-classic").setAttribute("aria-selected", state.mode === "classic" ? "true" : "false");
    document.getElementById("tab-draw").setAttribute("aria-selected", state.mode === "draw" ? "true" : "false");
    document.getElementById("tab-upload").setAttribute("aria-selected", state.mode === "upload" ? "true" : "false");
    renderToolbar();
    renderHint();
    renderFigures();
    solveCurrent();
  }

  function nearestDot(x, y) {
    const gx = Math.round(x);
    const gy = Math.round(y);
    if (gx < 0 || gy < 0 || gx > 8 || gy > 6) return null;
    if (Math.hypot(gx - x, gy - y) > 0.48) return null;
    return [gx, gy];
  }

  function onPointer(ev) {
    if (state.mode !== "draw" || state.suggestion) return;
    const rect = board.getBoundingClientRect();
    const sx = ev.clientX - rect.left;
    const sy = ev.clientY - rect.top;
    const wpt = screenToWorld(sx, sy);
    const dot = nearestDot(wpt[0], wpt[1]);
    if (!dot) return;
    ev.preventDefault();
    if (state.closed) {
      state.points = [];
      state.closed = false;
      state.steps = null;
      state.analysis = null;
      state.note = "";
    }
    if (state.points.length >= 3) {
      const a = state.points[0];
      if (a[0] === dot[0] && a[1] === dot[1]) {
        closeShape();
        return;
      }
    }
    const last = state.points[state.points.length - 1];
    if (last && last[0] === dot[0] && last[1] === dot[1]) return;
    state.points.push(dot);
    state.status = "继续点顶点。点第一个红点，或按「闭合」。";
    renderMeter();
    renderPanel();
    draw();
  }

  function readFile(file) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = function () {
      URL.revokeObjectURL(url);
      const maxSide = 480;
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const c = canvas.getContext("2d");
      c.drawImage(img, 0, 0, w, h);
      const data = c.getImageData(0, 0, w, h);
      const extracted = Tangram.extractSilhouette(data.data, w, h);
      state.suggestion = null;
      state.backup = null;
      state.note = "";
      state.figureId = null;
      if (!extracted.ok) {
        state.points = [];
        state.closed = false;
        state.steps = null;
        state.analysis = null;
        state.progress = "";
        state.status = extracted.message;
        renderMeter();
        renderPanel();
        resize();
        return;
      }
      state.points = extracted.points;
      state.closed = true;
      state.note = extracted.message;
      solveCurrent();
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      state.status = "这张图片打不开。";
      renderPanel();
    };
    img.src = url;
  }

  document.getElementById("tab-classic").addEventListener("click", function () {
    setMode("classic");
  });
  document.getElementById("tab-draw").addEventListener("click", function () {
    setMode("draw");
  });
  document.getElementById("tab-upload").addEventListener("click", function () {
    setMode("upload");
  });
  board.addEventListener("pointerdown", onPointer);
  fileInput.addEventListener("change", function () {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = "";
    readFile(file);
  });
  wrap.addEventListener("dragover", function (ev) {
    ev.preventDefault();
    wrap.classList.add("drag");
  });
  wrap.addEventListener("dragleave", function () {
    wrap.classList.remove("drag");
  });
  wrap.addEventListener("drop", function (ev) {
    ev.preventDefault();
    wrap.classList.remove("drag");
    setMode("upload");
    const file = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0];
    readFile(file);
  });
  window.addEventListener("keydown", function (ev) {
    if (ev.key !== "ArrowLeft" && ev.key !== "ArrowRight") return;
    if (!state.steps) return;
    if (ev.target && (ev.target.tagName === "INPUT" || ev.target.tagName === "TEXTAREA")) return;
    ev.preventDefault();
    stopPlay();
    state.step += ev.key === "ArrowRight" ? 1 : -1;
    state.step = Math.max(0, Math.min(state.steps.length, state.step));
    renderPanel();
    draw();
  });
  if (window.ResizeObserver) {
    new ResizeObserver(resize).observe(wrap);
  } else {
    window.addEventListener("resize", resize);
  }

  renderLegend();
  const first = Tangram.FIGURES.find(function (fig) {
    return fig.id === "square" && fig.ready;
  });
  if (first) selectFigure(first);
  else {
    renderToolbar();
    renderHint();
    renderPanel();
    resize();
  }
})();
