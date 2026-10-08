import { Entity, Point, SnapResult, SnapMode, BlockRefEntity, DimStyle } from './types';
import { store } from './store';
import { polarPoint, angleInArc, normalizeAngle, getGripPoints, isHorizontalDim, dist, angle } from './geometry';

const COLORS: Record<string, string> = {
  '1': '#ff0000', '2': '#ffff00', '3': '#00ff00', '4': '#00ffff',
  '5': '#0000ff', '6': '#ff00ff', '7': '#ffffff',
};

// AutoCAD R14: all snap markers are yellow
const SNAP_COLOR = '#ffff00';

const LINETYPE_PATTERNS: Record<string, number[]> = {
  continuous: [],
  dashed: [8, 4],
  hidden: [4, 4],
  center: [12, 4, 4, 4],
  dashdot: [8, 4, 2, 4],
  phantom: [16, 4, 4, 4, 4, 4],
  dot: [2, 4],
  border: [8, 4, 8, 4, 2, 4],
  divide: [8, 4, 2, 4, 2, 4],
};

const SNAP_LABELS: Partial<Record<SnapMode, string>> = {
  endpoint: 'Endpoint', midpoint: 'Midpoint', center: 'Center',
  intersection: 'Intersection', perpendicular: 'Perpendicular',
  tangent: 'Tangent', quadrant: 'Quadrant', nearest: 'Nearest',
  grid: 'Grid',
};

export class Renderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  cursorWorld: Point = { x: 0, y: 0 };
  snapResult: SnapResult | null = null;
  rubberBand: { start: Point; end: Point } | null = null;
  rubberCircle: { center: Point; radius: number } | null = null;
  rubberArc: { center: Point; radius: number; startAngle: number; endAngle: number } | null = null;
  rubberRect: { corner1: Point; corner2: Point } | null = null;
  rubberPolyline: Point[] | null = null;
  rubberEllipse: { center: Point; majorX: number; majorY: number; ratio: number } | null = null;
  selectionBox: { p1: Point; p2: Point } | null = null;
  hotGrip: { entityId: string; gripIndex: number } | null = null;
  gripRubberBand: { start: Point; end: Point } | null = null;
  preview: ((ctx: CanvasRenderingContext2D) => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  render() {
    const ctx = this.ctx;
    const w = this.canvas.getBoundingClientRect().width;
    const h = this.canvas.getBoundingClientRect().height;

    // R14 black background
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, h);

    // Grid
    if (store.gridOn) this.drawGrid(w, h);

    // Entities
    for (const e of store.entities) {
      if (!e.visible) continue;
      const eLayer = store.layers.find(l => l.name === e.layer);
      if (eLayer && eLayer.frozen) continue;
      this.drawEntity(e);
    }

    // Grips on selected entities
    for (const e of store.entities) {
      if (!e.visible || !e.selected) continue;
      const grips = getGripPoints(e);
      for (let gi = 0; gi < grips.length; gi++) {
        const sp = store.worldToScreen(grips[gi]);
        const isHot = this.hotGrip && this.hotGrip.entityId === e.id && this.hotGrip.gripIndex === gi;
        ctx.fillStyle = isHot ? '#ff0000' : '#0055ff';
        ctx.fillRect(sp.x - 4, sp.y - 4, 8, 8);
        if (isHot) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1;
          ctx.strokeRect(sp.x - 4, sp.y - 4, 8, 8);
        }
      }
    }

    // Grip rubber band
    if (this.gripRubberBand) {
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = '#ff0000';
      ctx.lineWidth = 1;
      this.strokeLine(this.gripRubberBand.start, this.gripRubberBand.end);
      ctx.setLineDash([]);
    }

    // Rubber band previews
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    if (this.rubberBand) {
      this.strokeLine(this.rubberBand.start, this.rubberBand.end);
    }
    if (this.rubberCircle) {
      this.strokeCircle(this.rubberCircle.center, this.rubberCircle.radius);
    }
    if (this.rubberArc) {
      this.strokeArc(this.rubberArc.center, this.rubberArc.radius, this.rubberArc.startAngle, this.rubberArc.endAngle);
    }
    if (this.rubberRect) {
      const { corner1: c1, corner2: c2 } = this.rubberRect;
      this.strokeRectWorld(c1, c2);
    }
    if (this.rubberPolyline && this.rubberPolyline.length > 0) {
      for (let i = 0; i < this.rubberPolyline.length - 1; i++) {
        this.strokeLine(this.rubberPolyline[i], this.rubberPolyline[i + 1]);
      }
      this.strokeLine(this.rubberPolyline[this.rubberPolyline.length - 1], this.cursorWorld);
    }
    if (this.rubberEllipse) {
      const e = this.rubberEllipse;
      const sc = store.worldToScreen(e.center);
      const majorLen = Math.hypot(e.majorX, e.majorY) * store.view.zoom;
      const rot = Math.atan2(e.majorY, e.majorX);
      ctx.save();
      ctx.translate(sc.x, sc.y);
      ctx.rotate(-rot);
      ctx.scale(1, e.ratio);
      ctx.beginPath();
      ctx.arc(0, 0, majorLen, 0, Math.PI * 2);
      ctx.restore();
      ctx.stroke();
    }
    ctx.setLineDash([]);

    if (this.preview) {
      this.preview(ctx);
    }

    // Selection box
    if (this.selectionBox) {
      const s1 = store.worldToScreen(this.selectionBox.p1);
      const s2 = store.worldToScreen(this.selectionBox.p2);
      const leftToRight = s2.x > s1.x;
      ctx.strokeStyle = leftToRight ? '#00ff00' : '#0000ff';
      ctx.fillStyle = leftToRight ? 'rgba(0,255,0,0.05)' : 'rgba(0,0,255,0.05)';
      ctx.setLineDash(leftToRight ? [] : [6, 3]);
      ctx.strokeRect(s1.x, s1.y, s2.x - s1.x, s2.y - s1.y);
      ctx.fillRect(s1.x, s1.y, s2.x - s1.x, s2.y - s1.y);
      ctx.setLineDash([]);
    }

    // Snap marker
    if (this.snapResult && this.snapResult.mode !== 'none') {
      this.drawSnapMarker(this.snapResult);
    }

    // Crosshair cursor (full screen, R14 style)
    this.drawCrosshair(w, h);

    // UCS icon (bottom-left)
    this.drawUCSIcon();
  }

  private drawGrid(w: number, h: number) {
    const ctx = this.ctx;
    const gs = store.gridSpacing;
    const v = store.view;

    const worldLeft = v.panX;
    const worldRight = v.panX + w / v.zoom;
    const worldBottom = v.panY - h / v.zoom;
    const worldTop = v.panY;

    const startX = Math.floor(worldLeft / gs) * gs;
    const startY = Math.floor(worldBottom / gs) * gs;

    ctx.fillStyle = '#333333';
    const dotSize = Math.max(1, v.zoom * 0.8);

    for (let x = startX; x <= worldRight; x += gs) {
      for (let y = startY; y <= worldTop; y += gs) {
        const sp = store.worldToScreen({ x, y });
        ctx.fillRect(sp.x - dotSize / 2, sp.y - dotSize / 2, dotSize, dotSize);
      }
    }
  }

  private drawCrosshair(w: number, h: number) {
    const ctx = this.ctx;
    const sp = store.worldToScreen(this.cursorWorld);
    const gap = 5;

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    // Horizontal
    ctx.moveTo(0, sp.y); ctx.lineTo(sp.x - gap, sp.y);
    ctx.moveTo(sp.x + gap, sp.y); ctx.lineTo(w, sp.y);
    // Vertical
    ctx.moveTo(sp.x, 0); ctx.lineTo(sp.x, sp.y - gap);
    ctx.moveTo(sp.x, sp.y + gap); ctx.lineTo(sp.x, h);
    ctx.stroke();
  }

  private drawUCSIcon() {
    const ctx = this.ctx;
    const ox = 30, oy = this.canvas.getBoundingClientRect().height - 30;
    const len = 20;

    ctx.strokeStyle = '#888888';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#888888';
    ctx.font = '10px monospace';

    // X axis
    ctx.beginPath();
    ctx.moveTo(ox, oy); ctx.lineTo(ox + len, oy); ctx.stroke();
    ctx.fillText('X', ox + len + 2, oy + 4);

    // Y axis
    ctx.beginPath();
    ctx.moveTo(ox, oy); ctx.lineTo(ox, oy - len); ctx.stroke();
    ctx.fillText('Y', ox - 4, oy - len - 4);
  }

  private drawSnapMarker(snap: SnapResult) {
    const ctx = this.ctx;
    const sp = store.worldToScreen(snap.point);
    const s = 6;

    ctx.strokeStyle = SNAP_COLOR;
    ctx.lineWidth = 1.5;

    switch (snap.mode) {
      case 'endpoint':
        ctx.strokeRect(sp.x - s, sp.y - s, s * 2, s * 2);
        break;
      case 'midpoint':
        ctx.beginPath();
        ctx.moveTo(sp.x - s, sp.y + s);
        ctx.lineTo(sp.x + s, sp.y + s);
        ctx.lineTo(sp.x, sp.y - s);
        ctx.closePath(); ctx.stroke();
        break;
      case 'center':
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, s, 0, Math.PI * 2); ctx.stroke();
        // Cross inside the circle (R14 style)
        ctx.beginPath();
        ctx.moveTo(sp.x - s * 0.5, sp.y); ctx.lineTo(sp.x + s * 0.5, sp.y);
        ctx.moveTo(sp.x, sp.y - s * 0.5); ctx.lineTo(sp.x, sp.y + s * 0.5);
        ctx.stroke();
        break;
      case 'intersection':
        ctx.beginPath();
        ctx.moveTo(sp.x - s, sp.y - s); ctx.lineTo(sp.x + s, sp.y + s);
        ctx.moveTo(sp.x + s, sp.y - s); ctx.lineTo(sp.x - s, sp.y + s);
        ctx.stroke();
        break;
      case 'perpendicular':
        ctx.beginPath();
        ctx.moveTo(sp.x - s, sp.y + s); ctx.lineTo(sp.x - s, sp.y - s);
        ctx.lineTo(sp.x + s, sp.y - s); ctx.stroke();
        break;
      case 'quadrant':
        ctx.save();
        ctx.translate(sp.x, sp.y); ctx.rotate(Math.PI / 4);
        ctx.strokeRect(-s, -s, s * 2, s * 2);
        ctx.restore();
        break;
      case 'nearest':
        ctx.beginPath();
        ctx.moveTo(sp.x - s, sp.y); ctx.lineTo(sp.x, sp.y - s);
        ctx.lineTo(sp.x + s, sp.y); ctx.lineTo(sp.x, sp.y + s);
        ctx.closePath(); ctx.stroke();
        break;
      case 'tangent':
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, s * 0.6, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(sp.x - s, sp.y - s * 0.6); ctx.lineTo(sp.x + s, sp.y - s * 0.6); ctx.stroke();
        break;
    }

    // Tooltip label (R14 shows snap mode name next to marker)
    const label = SNAP_LABELS[snap.mode];
    if (label) {
      ctx.font = '10px "MS Sans Serif", Tahoma, sans-serif';
      ctx.fillStyle = SNAP_COLOR;
      ctx.fillText(label, sp.x + s + 4, sp.y - s);
    }
  }

  private parentBlockColor: string | null = null;

  private resolveColor(e: Entity): string {
    if (e.color === 'bylayer') {
      const layer = store.layers.find(l => l.name === e.layer);
      return layer?.color || '#ffffff';
    }
    if (e.color === 'byblock') {
      return this.parentBlockColor || '#ffffff';
    }
    return COLORS[e.color] || e.color || '#ffffff';
  }

  private resolveLineweight(e: Entity): number {
    if (e.lineweight <= 0) {
      const layer = store.layers.find(l => l.name === e.layer);
      return (layer as any)?.lineweight || 1;
    }
    return e.lineweight;
  }

  drawEntity(e: Entity) {
    const ctx = this.ctx;
    ctx.strokeStyle = this.resolveColor(e);
    const lw = this.resolveLineweight(e);
    const screenLw = Math.max(1, lw * store.view.zoom * 0.3);
    if (e.selected) {
      ctx.lineWidth = screenLw;
      ctx.setLineDash([6, 3]);
    } else {
      ctx.lineWidth = screenLw;
      ctx.setLineDash(LINETYPE_PATTERNS[e.linetype] || []);
    }

    switch (e.type) {
      case 'line': this.strokeLine(e.start, e.end); break;
      case 'circle': this.strokeCircle(e.center, e.radius); break;
      case 'arc': this.strokeArc(e.center, e.radius, e.startAngle, e.endAngle); break;
      case 'polyline': this.drawPolyline(e); break;
      case 'rect': this.strokeRectWorld(e.corner1, e.corner2); break;
      case 'text': this.drawText(e); break;
      case 'ellipse': this.drawEllipse(e); break;
      case 'dimension': this.drawDimension(e); break;
      case 'point': this.drawPoint(e); break;
      case 'hatch': this.drawHatch(e); break;
      case 'blockref': this.drawBlockRef(e); break;
      case 'region': this.drawRegion(e); break;
    }
    ctx.setLineDash([]);
  }

  private strokeLine(a: Point, b: Point) {
    const sa = store.worldToScreen(a), sb = store.worldToScreen(b);
    this.ctx.beginPath();
    this.ctx.moveTo(sa.x, sa.y); this.ctx.lineTo(sb.x, sb.y);
    this.ctx.stroke();
  }

  private strokeCircle(c: Point, r: number) {
    const sc = store.worldToScreen(c);
    this.ctx.beginPath();
    this.ctx.arc(sc.x, sc.y, r * store.view.zoom, 0, Math.PI * 2);
    this.ctx.stroke();
  }

  private strokeArc(c: Point, r: number, start: number, end: number) {
    const sc = store.worldToScreen(c);
    this.ctx.beginPath();
    this.ctx.arc(sc.x, sc.y, r * store.view.zoom, -end, -start);
    this.ctx.stroke();
  }

  private strokeRectWorld(c1: Point, c2: Point) {
    const s1 = store.worldToScreen(c1), s2 = store.worldToScreen(c2);
    this.ctx.strokeRect(s1.x, s1.y, s2.x - s1.x, s2.y - s1.y);
  }

  private drawPolyline(e: { points: Point[]; closed: boolean }) {
    if (e.points.length < 2) return;
    const ctx = this.ctx;
    ctx.beginPath();
    const s0 = store.worldToScreen(e.points[0]);
    ctx.moveTo(s0.x, s0.y);
    for (let i = 1; i < e.points.length; i++) {
      const sp = store.worldToScreen(e.points[i]);
      ctx.lineTo(sp.x, sp.y);
    }
    if (e.closed) ctx.closePath();
    ctx.stroke();
  }

  private drawText(e: { position: Point; text: string; height: number; rotation: number; color?: string; textStyle?: string }) {
    const ctx = this.ctx;
    const sp = store.worldToScreen(e.position);
    const fontSize = Math.max(8, e.height * store.view.zoom);
    const style = e.textStyle ? store.textStyles.find(s => s.name === e.textStyle) : null;
    const fontFamily = style?.fontFamily || 'monospace';
    const widthFactor = style?.widthFactor || 1;
    const oblique = style?.oblique || 0;
    ctx.save();
    ctx.translate(sp.x, sp.y);
    ctx.rotate(-e.rotation * Math.PI / 180);

    if (store.qtextOn) {
      const approxWidth = e.text.length * fontSize * 0.6 * widthFactor;
      const lines = e.text.split('\n');
      const totalHeight = lines.length * fontSize * 1.2;
      ctx.strokeRect(0, -fontSize * 0.2, approxWidth, totalHeight);
      ctx.restore();
      return;
    }

    if (oblique !== 0) {
      ctx.transform(1, 0, Math.tan(oblique * Math.PI / 180), 1, 0, 0);
    }
    if (widthFactor !== 1) {
      ctx.scale(widthFactor, 1);
    }
    ctx.font = `${fontSize}px "${fontFamily}", ${fontFamily === 'monospace' ? 'monospace' : 'sans-serif'}`;
    ctx.fillStyle = ctx.strokeStyle;
    const lines = e.text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], 0, i * fontSize * 1.2);
    }
    ctx.restore();
  }

  private drawEllipse(e: { center: Point; majorX: number; majorY: number; ratio: number; startParam: number; endParam: number }) {
    const ctx = this.ctx;
    const sc = store.worldToScreen(e.center);
    const majorLen = Math.hypot(e.majorX, e.majorY) * store.view.zoom;
    const rot = Math.atan2(e.majorY, e.majorX);
    ctx.save();
    ctx.translate(sc.x, sc.y);
    ctx.rotate(-rot);
    ctx.scale(1, e.ratio);
    ctx.beginPath();
    ctx.arc(0, 0, majorLen, -e.endParam, -e.startParam);
    ctx.restore();
    ctx.stroke();
  }

  private drawPoint(e: { position: Point; pdmode: number; pdsize: number }) {
    const ctx = this.ctx;
    const sp = store.worldToScreen(e.position);
    const sz = Math.max(3, e.pdsize * store.view.zoom * 0.5);
    const base = e.pdmode % 4;
    const deco = e.pdmode - base;

    if (deco === 32 || deco === 96) {
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, sz, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (deco === 64 || deco === 96) {
      ctx.beginPath();
      ctx.moveTo(sp.x - sz, sp.y - sz); ctx.lineTo(sp.x + sz, sp.y - sz);
      ctx.lineTo(sp.x + sz, sp.y + sz); ctx.lineTo(sp.x - sz, sp.y + sz);
      ctx.closePath();
      ctx.stroke();
    }

    ctx.beginPath();
    if (base === 0 || base === 1) {
      ctx.arc(sp.x, sp.y, 2, 0, Math.PI * 2);
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fill();
    } else if (base === 2) {
      ctx.moveTo(sp.x - sz, sp.y); ctx.lineTo(sp.x + sz, sp.y);
      ctx.moveTo(sp.x, sp.y - sz); ctx.lineTo(sp.x, sp.y + sz);
      ctx.stroke();
    } else if (base === 3) {
      ctx.moveTo(sp.x - sz, sp.y - sz); ctx.lineTo(sp.x + sz, sp.y + sz);
      ctx.moveTo(sp.x - sz, sp.y + sz); ctx.lineTo(sp.x + sz, sp.y - sz);
      ctx.stroke();
    }
  }

  private static HATCH_PATTERNS: Record<string, { angles: number[]; spacing: number }> = {
    ANSI31: { angles: [45], spacing: 3 },
    ANSI32: { angles: [45], spacing: 6 },
    ANSI33: { angles: [45], spacing: 2 },
    ANSI34: { angles: [45, -45], spacing: 3 },
    ANSI35: { angles: [45, 0], spacing: 3 },
    ANSI36: { angles: [45, 135], spacing: 4 },
    ANSI37: { angles: [45, -45, 0], spacing: 3 },
    ANSI38: { angles: [45, -45, 0, 90], spacing: 3 },
    CROSS: { angles: [0, 90], spacing: 4 },
    SQUARE: { angles: [0, 90], spacing: 6 },
    HONEY: { angles: [0, 60, 120], spacing: 4 },
    EARTH: { angles: [0, 90, 45, -45], spacing: 5 },
    GRASS: { angles: [90, 45, 135], spacing: 6 },
    DOTS: { angles: [], spacing: 4 },
  };

  private drawHatch(e: { boundaries: Point[][]; patternName: string; patternScale: number; patternAngle: number }) {
    const ctx = this.ctx;
    for (const boundary of e.boundaries) {
      if (boundary.length < 3) continue;
      ctx.beginPath();
      const s0 = store.worldToScreen(boundary[0]);
      ctx.moveTo(s0.x, s0.y);
      for (let i = 1; i < boundary.length; i++) {
        const sp = store.worldToScreen(boundary[i]);
        ctx.lineTo(sp.x, sp.y);
      }
      ctx.closePath();
      if (e.patternName === 'SOLID') {
        if (store.fillOn) {
          ctx.fillStyle = ctx.strokeStyle;
          ctx.globalAlpha = 0.3;
          ctx.fill();
          ctx.globalAlpha = 1;
        }
        ctx.stroke();
      } else {
        ctx.stroke();
        ctx.save();
        ctx.clip();
        const bounds = this.polyBounds(boundary);
        const s1 = store.worldToScreen(bounds.min);
        const s2 = store.worldToScreen(bounds.max);
        const cx = (s1.x + s2.x) / 2, cy = (s1.y + s2.y) / 2;
        const diag = Math.hypot(s2.x - s1.x, s2.y - s1.y);
        const pattern = Renderer.HATCH_PATTERNS[e.patternName];
        const baseSpacing = Math.max(4, (pattern?.spacing || 3) * e.patternScale * store.view.zoom);

        if (e.patternName === 'DOTS') {
          const dotSpacing = baseSpacing;
          ctx.fillStyle = ctx.strokeStyle;
          for (let dx = -diag; dx <= diag; dx += dotSpacing) {
            for (let dy = -diag; dy <= diag; dy += dotSpacing) {
              ctx.beginPath();
              ctx.arc(cx + dx, cy + dy, 1, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        } else {
          const angles = pattern ? pattern.angles : [45];
          for (const lineAngle of angles) {
            const ang = (lineAngle + e.patternAngle) * Math.PI / 180;
            const cos = Math.cos(ang), sin = Math.sin(ang);
            for (let d = -diag; d <= diag; d += baseSpacing) {
              const ox = cx + d * cos, oy = cy + d * sin;
              ctx.beginPath();
              ctx.moveTo(ox - diag * sin, oy + diag * cos);
              ctx.lineTo(ox + diag * sin, oy - diag * cos);
              ctx.stroke();
            }
          }
        }
        ctx.restore();
      }
    }
  }

  private polyBounds(pts: Point[]): { min: Point; max: Point } {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of pts) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    return { min: { x: minX, y: minY }, max: { x: maxX, y: maxY } };
  }

  private drawRegion(e: { outerBoundary: Point[]; holes: Point[][] }) {
    const ctx = this.ctx;
    if (e.outerBoundary.length < 3) return;

    ctx.beginPath();
    const s0 = store.worldToScreen(e.outerBoundary[0]);
    ctx.moveTo(s0.x, s0.y);
    for (let i = 1; i < e.outerBoundary.length; i++) {
      const sp = store.worldToScreen(e.outerBoundary[i]);
      ctx.lineTo(sp.x, sp.y);
    }
    ctx.closePath();
    ctx.stroke();

    if (store.fillOn) {
      ctx.fillStyle = ctx.strokeStyle;
      ctx.globalAlpha = 0.15;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    for (const hole of e.holes) {
      if (hole.length < 3) continue;
      ctx.beginPath();
      const h0 = store.worldToScreen(hole[0]);
      ctx.moveTo(h0.x, h0.y);
      for (let i = 1; i < hole.length; i++) {
        const hp = store.worldToScreen(hole[i]);
        ctx.lineTo(hp.x, hp.y);
      }
      ctx.closePath();
      ctx.stroke();
    }
  }

  private drawBlockRef(e: Entity & { blockName: string; insertPoint: Point; scaleX: number; scaleY: number; rotation: number }) {
    const blockEnts = store.blockDefs.get(e.blockName);
    if (!blockEnts) {
      const sp = store.worldToScreen(e.insertPoint);
      this.ctx.fillStyle = '#ff00ff';
      this.ctx.font = '10px monospace';
      this.ctx.fillText(`[${e.blockName}]`, sp.x, sp.y);
      return;
    }
    const ctx = this.ctx;
    ctx.save();
    const prevBlockColor = this.parentBlockColor;
    this.parentBlockColor = this.resolveColor(e);
    const sp = store.worldToScreen(e.insertPoint);
    ctx.translate(sp.x, sp.y);
    ctx.rotate(-e.rotation * Math.PI / 180);
    ctx.scale(e.scaleX, e.scaleY);
    ctx.translate(-sp.x, -sp.y);
    for (const sub of blockEnts) {
      this.drawEntity({ ...sub, selected: false } as any);
    }
    this.parentBlockColor = prevBlockColor;
    ctx.restore();

    const br = e as any as BlockRefEntity;
    if (br.attributes && br.attributes.length > 0 && store.attDispMode !== 'off') {
      const defs = store.blockAttribs.get(br.blockName);
      const h = store.currentDimStyle.textHeight;
      let yOff = 0;
      for (const attr of br.attributes) {
        const def = defs?.find(d => d.tag === attr.tag);
        const invisible = def?.invisible ?? false;
        if (store.attDispMode === 'normal' && invisible) continue;
        this.drawText({
          position: { x: br.insertPoint.x, y: br.insertPoint.y - h * 1.5 - yOff },
          text: attr.value,
          height: h,
          rotation: br.rotation,
        });
        yOff += h * 1.5;
      }
    }
  }

  private drawDimension(e: { dimType: string; p1: Point; p2: Point; textPos: Point; textOverride?: string; dimOverrides?: Partial<Omit<DimStyle, 'name'>> }) {
    const ctx = this.ctx;
    const base = store.currentDimStyle;
    const ds = e.dimOverrides ? { ...base, ...e.dimOverrides } : base;
    ctx.strokeStyle = ds.color;
    ctx.fillStyle = ds.color;
    const arrowLen = ds.arrowSize * store.view.zoom;
    const extGap = ds.extensionOffset;

    if (e.dimType === 'linear') {
      const horizontal = isHorizontalDim(e.p1, e.p2, e.textPos);
      let dimP1: Point, dimP2: Point;
      if (horizontal) {
        dimP1 = { x: e.p1.x, y: e.textPos.y };
        dimP2 = { x: e.p2.x, y: e.textPos.y };
      } else {
        dimP1 = { x: e.textPos.x, y: e.p1.y };
        dimP2 = { x: e.textPos.x, y: e.p2.y };
      }
      this.drawExtLine(e.p1, dimP1, extGap);
      this.drawExtLine(e.p2, dimP2, extGap);
      this.strokeLine(dimP1, dimP2);
      const s1 = store.worldToScreen(dimP1), s2 = store.worldToScreen(dimP2);
      const sa = Math.atan2(s2.y - s1.y, s2.x - s1.x);
      this.drawArrowhead(s1, sa, arrowLen);
      this.drawArrowhead(s2, sa + Math.PI, arrowLen);
      this.drawDimText(e.textOverride || '', { x: (dimP1.x + dimP2.x) / 2, y: (dimP1.y + dimP2.y) / 2 });
    } else if (e.dimType === 'aligned') {
      const dx = e.p2.x - e.p1.x, dy = e.p2.y - e.p1.y;
      const len = Math.hypot(dx, dy);
      if (len === 0) return;
      const nx = -dy / len, ny = dx / len;
      const mid = { x: (e.p1.x + e.p2.x) / 2, y: (e.p1.y + e.p2.y) / 2 };
      const off = (e.textPos.x - mid.x) * nx + (e.textPos.y - mid.y) * ny;
      const dimP1 = { x: e.p1.x + nx * off, y: e.p1.y + ny * off };
      const dimP2 = { x: e.p2.x + nx * off, y: e.p2.y + ny * off };
      this.drawExtLine(e.p1, dimP1, extGap);
      this.drawExtLine(e.p2, dimP2, extGap);
      this.strokeLine(dimP1, dimP2);
      const s1 = store.worldToScreen(dimP1), s2 = store.worldToScreen(dimP2);
      const sa = Math.atan2(s2.y - s1.y, s2.x - s1.x);
      this.drawArrowhead(s1, sa, arrowLen);
      this.drawArrowhead(s2, sa + Math.PI, arrowLen);
      this.drawDimText(e.textOverride || len.toFixed(ds.precision), { x: (dimP1.x + dimP2.x) / 2, y: (dimP1.y + dimP2.y) / 2 });
    } else if (e.dimType === 'angular') {
      const center = e.textPos;
      const radius = dist(center, e.p1);
      const a1 = angle(center, e.p1);
      const a2 = angle(center, e.p2);
      const sc = store.worldToScreen(center);
      const sr = radius * store.view.zoom;
      ctx.beginPath();
      ctx.arc(sc.x, sc.y, sr, -a2, -a1);
      ctx.stroke();
      const sP1 = store.worldToScreen(e.p1), sP2 = store.worldToScreen(e.p2);
      const sa1 = Math.atan2(sP1.y - sc.y, sP1.x - sc.x);
      const sa2 = Math.atan2(sP2.y - sc.y, sP2.x - sc.x);
      this.drawArrowhead(sP1, sa1 + Math.PI / 2, arrowLen);
      this.drawArrowhead(sP2, sa2 - Math.PI / 2, arrowLen);
      this.drawExtLine(center, e.p1, extGap);
      this.drawExtLine(center, e.p2, extGap);
      const midAng = (a1 + a2) / 2;
      const textWorld = polarPoint(center, radius, midAng);
      this.drawDimText(e.textOverride || '', textWorld);
    } else {
      this.strokeLine(e.p1, e.p2);
      const s1 = store.worldToScreen(e.p1), s2 = store.worldToScreen(e.p2);
      const sa = Math.atan2(s2.y - s1.y, s2.x - s1.x);
      if (e.dimType === 'radius') {
        this.drawArrowhead(s2, sa, arrowLen);
      } else {
        this.drawArrowhead(s1, sa + Math.PI, arrowLen);
        this.drawArrowhead(s2, sa, arrowLen);
      }
      this.drawDimText(e.textOverride || '', e.textPos);
    }
  }

  private drawExtLine(origin: Point, dimPt: Point, gap: number) {
    const dx = dimPt.x - origin.x, dy = dimPt.y - origin.y;
    const d = Math.hypot(dx, dy);
    if (d < gap) return;
    const ux = dx / d, uy = dy / d;
    this.strokeLine(
      { x: origin.x + ux * gap, y: origin.y + uy * gap },
      { x: dimPt.x + ux * gap * 0.5, y: dimPt.y + uy * gap * 0.5 }
    );
  }

  private drawDimText(text: string, worldPos: Point) {
    const ds = store.currentDimStyle;
    const sp = store.worldToScreen(worldPos);
    const fontSize = Math.max(8, ds.textHeight * store.view.zoom);
    this.ctx.font = `${fontSize}px monospace`;
    this.ctx.fillText(text, sp.x - this.ctx.measureText(text).width / 2, sp.y - 4);
  }

  private drawArrowhead(tip: Point, ang: number, len: number) {
    const ctx = this.ctx;
    const hw = len * 0.3;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    ctx.beginPath();
    ctx.moveTo(tip.x, tip.y);
    ctx.lineTo(tip.x - len * ca - hw * sa, tip.y - len * sa + hw * ca);
    ctx.lineTo(tip.x - len * ca + hw * sa, tip.y - len * sa - hw * ca);
    ctx.closePath();
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fill();
  }
}
