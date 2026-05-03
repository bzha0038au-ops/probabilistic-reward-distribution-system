const CELL_COLS = 12;
const CELL_ROWS = 12;
const CLEAR_THRESHOLD = 0.42;
const SCRATCH_LINE_WIDTH = 28;

interface MountScratchCardOptions {
  canvas: HTMLCanvasElement;
  onComplete: () => void;
}

interface ScratchSurfaceRegion {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  threshold?: number;
}

interface MountScratchSurfaceOptions {
  canvas: HTMLCanvasElement;
  regions: ScratchSurfaceRegion[];
  onReveal: (id: number) => void;
}

interface ScratchCardState {
  ctx: CanvasRenderingContext2D;
  cells: Set<number>;
  brushSize: number;
  completed: boolean;
  drawing: boolean;
  lastPoint: { x: number; y: number } | null;
  scratchDistance: number;
  minRevealDistance: number;
  resizeObserver?: ResizeObserver;
}

interface ScratchSurfaceRegionState {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  threshold: number;
  cols: number;
  rows: number;
  cells: Set<number>;
  revealed: boolean;
}

interface ScratchSurfaceState {
  ctx: CanvasRenderingContext2D;
  brushSize: number;
  completed: boolean;
  drawing: boolean;
  lastPoint: { x: number; y: number } | null;
  scratchDistance: number;
  minRevealDistance: number;
  regions: ScratchSurfaceRegionState[];
}

export function mountScratchCard({ canvas, onComplete }: MountScratchCardOptions): void {
  if (canvas.dataset.scratchMounted === "true") {
    return;
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }

  canvas.dataset.scratchMounted = "true";

  const state: ScratchCardState = {
    ctx,
    cells: new Set<number>(),
    brushSize: SCRATCH_LINE_WIDTH,
    completed: false,
    drawing: false,
    lastPoint: null,
    scratchDistance: 0,
    minRevealDistance: 28,
  };

  const resize = (): void => {
    if (state.completed) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    const dpr = window.devicePixelRatio || 1;

    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    state.ctx.setTransform(1, 0, 0, 1, 0, 0);
    state.ctx.scale(dpr, dpr);
    state.brushSize = Math.max(18, Math.min(34, Math.min(width, height) * 0.24));
    state.minRevealDistance = Math.max(28, Math.min(width, height) * 0.48);
    drawCover(state.ctx, width, height, "SCRATCH");
  };

  const finish = (): void => {
    if (state.completed) {
      return;
    }

    state.completed = true;
    canvas.classList.add("ticket-slot__scratch--done");
    state.resizeObserver?.disconnect();
    window.setTimeout(onComplete, 90);
  };

  const updateCoverage = (x: number, y: number): void => {
    const rect = canvas.getBoundingClientRect();
    const cellWidth = rect.width / CELL_COLS;
    const cellHeight = rect.height / CELL_ROWS;
    const radius = state.brushSize * 0.56;
    const startCol = clamp(Math.floor((x - radius) / Math.max(1, cellWidth)), 0, CELL_COLS - 1);
    const endCol = clamp(Math.floor((x + radius) / Math.max(1, cellWidth)), 0, CELL_COLS - 1);
    const startRow = clamp(Math.floor((y - radius) / Math.max(1, cellHeight)), 0, CELL_ROWS - 1);
    const endRow = clamp(Math.floor((y + radius) / Math.max(1, cellHeight)), 0, CELL_ROWS - 1);

    for (let row = startRow; row <= endRow; row += 1) {
      for (let col = startCol; col <= endCol; col += 1) {
        state.cells.add(row * CELL_COLS + col);
      }
    }

    if (
      state.scratchDistance >= state.minRevealDistance &&
      state.cells.size / (CELL_COLS * CELL_ROWS) >= CLEAR_THRESHOLD
    ) {
      finish();
    }
  };

  const scratchTo = (x: number, y: number): void => {
    if (state.completed) {
      return;
    }

    state.ctx.save();
    state.ctx.globalCompositeOperation = "destination-out";
    state.ctx.lineCap = "round";
    state.ctx.lineJoin = "round";
    state.ctx.lineWidth = state.brushSize;

    if (state.lastPoint) {
      state.ctx.beginPath();
      state.ctx.moveTo(state.lastPoint.x, state.lastPoint.y);
      state.ctx.lineTo(x, y);
      state.ctx.stroke();
    }

    state.ctx.beginPath();
    state.ctx.arc(x, y, state.brushSize * 0.56, 0, Math.PI * 2);
    state.ctx.fill();
    state.ctx.restore();

    updateCoverage(x, y);
    state.lastPoint = { x, y };
  };

  const getLocalPoint = (event: PointerEvent): { x: number; y: number } => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  };

  const handlePointerDown = (event: PointerEvent): void => {
    if (state.completed) {
      return;
    }

    state.drawing = true;
    const point = getLocalPoint(event);
    state.lastPoint = point;
    canvas.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent): void => {
    if (!state.drawing || state.completed) {
      return;
    }

    const point = getLocalPoint(event);
    if (!state.lastPoint) {
      state.lastPoint = point;
      return;
    }

    const segmentDistance = Math.hypot(point.x - state.lastPoint.x, point.y - state.lastPoint.y);
    if (segmentDistance < 1.5) {
      return;
    }

    state.scratchDistance += segmentDistance;
    scratchTo(point.x, point.y);
  };

  const stopDrawing = (): void => {
    state.drawing = false;
    state.lastPoint = null;
  };

  canvas.addEventListener("pointerdown", handlePointerDown);
  canvas.addEventListener("pointermove", handlePointerMove);
  canvas.addEventListener("pointerup", stopDrawing);
  canvas.addEventListener("pointercancel", stopDrawing);
  canvas.addEventListener("pointerleave", stopDrawing);

  if ("ResizeObserver" in window) {
    state.resizeObserver = new ResizeObserver(() => {
      resize();
    });
    state.resizeObserver.observe(canvas);
  }

  resize();
}

export function mountScratchSurface({ canvas, regions, onReveal }: MountScratchSurfaceOptions): void {
  if (canvas.dataset.scratchMounted === "true") {
    return;
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }

  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  const dpr = window.devicePixelRatio || 1;

  canvas.dataset.scratchMounted = "true";
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);

  const state: ScratchSurfaceState = {
    ctx,
    brushSize: Math.max(18, Math.min(30, Math.min(width / 4, height * 0.52))),
    completed: false,
    drawing: false,
    lastPoint: null,
    scratchDistance: 0,
    minRevealDistance: Math.max(42, width * 0.18),
    regions: regions.map((region) => ({
      id: region.id,
      x: region.x,
      y: region.y,
      width: region.width,
      height: region.height,
      threshold: region.threshold ?? 0.28,
      cols: Math.max(6, Math.round(region.width / 12)),
      rows: Math.max(6, Math.round(region.height / 12)),
      cells: new Set<number>(),
      revealed: false,
    })),
  };

  drawCover(ctx, width, height);

  const updateRegions = (x: number, y: number): void => {
    const radius = state.brushSize * 0.56;

    state.regions.forEach((region) => {
      if (region.revealed) {
        return;
      }

      const left = region.x;
      const right = region.x + region.width;
      const top = region.y;
      const bottom = region.y + region.height;

      if (x + radius < left || x - radius > right || y + radius < top || y - radius > bottom) {
        return;
      }

      const cellWidth = region.width / region.cols;
      const cellHeight = region.height / region.rows;
      const startCol = clamp(Math.floor((x - radius - left) / cellWidth), 0, region.cols - 1);
      const endCol = clamp(Math.floor((x + radius - left) / cellWidth), 0, region.cols - 1);
      const startRow = clamp(Math.floor((y - radius - top) / cellHeight), 0, region.rows - 1);
      const endRow = clamp(Math.floor((y + radius - top) / cellHeight), 0, region.rows - 1);

      for (let row = startRow; row <= endRow; row += 1) {
        for (let col = startCol; col <= endCol; col += 1) {
          region.cells.add(row * region.cols + col);
        }
      }

      if (
        state.scratchDistance >= state.minRevealDistance &&
        region.cells.size / (region.cols * region.rows) >= region.threshold
      ) {
        region.revealed = true;
        onReveal(region.id);
      }
    });

    if (!state.completed && state.regions.every((region) => region.revealed)) {
      state.completed = true;
      canvas.classList.add("ticket-grid__scratch-board--done");
    }
  };

  const scratchTo = (x: number, y: number): void => {
    state.ctx.save();
    state.ctx.globalCompositeOperation = "destination-out";
    state.ctx.lineCap = "round";
    state.ctx.lineJoin = "round";
    state.ctx.lineWidth = state.brushSize;

    if (state.lastPoint) {
      state.ctx.beginPath();
      state.ctx.moveTo(state.lastPoint.x, state.lastPoint.y);
      state.ctx.lineTo(x, y);
      state.ctx.stroke();
    }

    state.ctx.beginPath();
    state.ctx.arc(x, y, state.brushSize * 0.56, 0, Math.PI * 2);
    state.ctx.fill();
    state.ctx.restore();

    updateRegions(x, y);
    state.lastPoint = { x, y };
  };

  const getLocalPoint = (event: PointerEvent): { x: number; y: number } => {
    const liveRect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - liveRect.left,
      y: event.clientY - liveRect.top,
    };
  };

  const handlePointerDown = (event: PointerEvent): void => {
    if (state.completed) {
      return;
    }

    state.drawing = true;
    const point = getLocalPoint(event);
    state.lastPoint = point;
    canvas.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent): void => {
    if (!state.drawing || state.completed) {
      return;
    }

    const point = getLocalPoint(event);
    if (!state.lastPoint) {
      state.lastPoint = point;
      return;
    }

    const segmentDistance = Math.hypot(point.x - state.lastPoint.x, point.y - state.lastPoint.y);
    if (segmentDistance < 1.5) {
      return;
    }

    state.scratchDistance += segmentDistance;
    scratchTo(point.x, point.y);
  };

  const stopDrawing = (): void => {
    state.drawing = false;
    state.lastPoint = null;
  };

  canvas.addEventListener("pointerdown", handlePointerDown);
  canvas.addEventListener("pointermove", handlePointerMove);
  canvas.addEventListener("pointerup", stopDrawing);
  canvas.addEventListener("pointercancel", stopDrawing);
  canvas.addEventListener("pointerleave", stopDrawing);
}

function drawCover(ctx: CanvasRenderingContext2D, width: number, height: number, label?: string): void {
  ctx.clearRect(0, 0, width, height);

  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "rgba(224, 228, 236, 0.98)");
  gradient.addColorStop(0.48, "rgba(175, 182, 195, 0.98)");
  gradient.addColorStop(1, "rgba(132, 141, 157, 0.99)");

  ctx.fillStyle = gradient;
  roundRect(ctx, 0, 0, width, height, 18);
  ctx.fill();

  ctx.save();
  ctx.globalAlpha = 0.16;
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 1;
  for (let offset = -height; offset < width; offset += 16) {
    ctx.beginPath();
    ctx.moveTo(offset, 0);
    ctx.lineTo(offset + height, height);
    ctx.stroke();
  }
  ctx.restore();

  const sheen = ctx.createLinearGradient(0, 0, width, 0);
  sheen.addColorStop(0, "rgba(255,255,255,0)");
  sheen.addColorStop(0.3, "rgba(255,255,255,0.24)");
  sheen.addColorStop(0.5, "rgba(255,255,255,0.06)");
  sheen.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = sheen;
  roundRect(ctx, width * 0.1, 0, width * 0.55, height, 18);
  ctx.fill();

  if (label) {
    ctx.fillStyle = "rgba(68, 78, 93, 0.56)";
    ctx.font = '900 16px "Avenir Next", "Segoe UI", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, width / 2, height / 2);
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
