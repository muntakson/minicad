import { Point, Entity, SnapResult, SnapMode, LineEntity, CircleEntity, ArcEntity, PolylineEntity, RectEntity } from './types';
import { store } from './store';
import { dist, midpoint, closestPointOnLine, closestPointOnCircle, angle, polarPoint,
         lineLineIntersection, lineCircleIntersections, circleCircleIntersections,
         rectToLines, angleInArc } from './geometry';

const SNAP_RADIUS = 15; // pixels

export function findSnap(worldPt: Point, screenPt: Point): SnapResult {
  const override = store.snapOverride;
  const modes = override ? new Set([override]) : store.snapModes;
  const tol = SNAP_RADIUS / store.view.zoom;

  let best: SnapResult = { point: worldPt, mode: 'none' };
  let bestDist = tol;

  // Nearest is lowest-priority among entity snaps — it always returns
  // the closest point on the curve, which would steal from geometric
  // snaps (midpoint, perpendicular, quadrant, etc.) every time.
  let bestNearest: SnapResult = { point: worldPt, mode: 'none' };
  let bestNearestDist = tol;

  function trySnap(pt: Point, mode: SnapMode, entityId?: string) {
    if (!modes.has(mode)) return;
    const d = dist(worldPt, pt);
    if (mode === 'nearest') {
      if (d < bestNearestDist) {
        bestNearestDist = d;
        bestNearest = { point: pt, mode, entityId };
      }
      return;
    }
    if (d < bestDist) {
      bestDist = d;
      best = { point: pt, mode, entityId };
    }
  }

  for (const e of store.entities) {
    if (!e.visible) continue;
    switch (e.type) {
      case 'line': snapLine(e, worldPt, trySnap); break;
      case 'circle': snapCircle(e, worldPt, trySnap); break;
      case 'arc': snapArc(e, worldPt, trySnap); break;
      case 'polyline': snapPolyline(e, worldPt, trySnap); break;
      case 'rect': snapRect(e, worldPt, trySnap); break;
      case 'point': trySnap(e.position, 'endpoint', e.id); break;
      case 'hatch':
        for (const boundary of e.boundaries) {
          for (const pt of boundary) trySnap(pt, 'endpoint', e.id);
        }
        break;
      case 'blockref': trySnap(e.insertPoint, 'endpoint', e.id); break;
      case 'region':
        for (const pt of e.outerBoundary) trySnap(pt, 'endpoint', e.id);
        for (const hole of e.holes) {
          for (const pt of hole) trySnap(pt, 'endpoint', e.id);
        }
        break;
    }
  }

  // Intersection snaps between entity pairs
  if (modes.has('intersection')) {
    const ents = store.entities.filter(e => e.visible);
    for (let i = 0; i < ents.length; i++) {
      for (let j = i + 1; j < ents.length; j++) {
        for (const pt of entityIntersections(ents[i], ents[j])) {
          trySnap(pt, 'intersection');
        }
      }
    }
  }

  // Fall back to nearest only if no geometric snap was found
  if (best.mode === 'none' && bestNearest.mode !== 'none') {
    best = bestNearest;
    bestDist = bestNearestDist;
  }

  // Grid snap: F9 toggle forces snap to grid; also fires if 'grid' snap mode is active
  if ((store.snapToGrid || modes.has('grid')) && store.gridOn && best.mode === 'none') {
    const gs = store.gridSpacing;
    const gp = { x: Math.round(worldPt.x / gs) * gs, y: Math.round(worldPt.y / gs) * gs };
    if (store.snapToGrid || dist(worldPt, gp) < tol) {
      best = { point: gp, mode: 'grid' };
    }
  }

  return best;
}

type TryFn = (pt: Point, mode: SnapMode, entityId?: string) => void;

function snapLine(e: LineEntity, p: Point, trySnap: TryFn) {
  trySnap(e.start, 'endpoint', e.id);
  trySnap(e.end, 'endpoint', e.id);
  trySnap(midpoint(e.start, e.end), 'midpoint', e.id);
  const perp = closestPointOnLine(store.lastPoint, e.start, e.end);
  trySnap(perp, 'perpendicular', e.id);
  trySnap(closestPointOnLine(p, e.start, e.end), 'nearest', e.id);
}

function snapCircle(e: CircleEntity, p: Point, trySnap: TryFn) {
  trySnap(e.center, 'center', e.id);
  for (const a of [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2]) {
    trySnap(polarPoint(e.center, e.radius, a), 'quadrant', e.id);
  }
  const perpAngle = angle(e.center, store.lastPoint);
  trySnap(polarPoint(e.center, e.radius, perpAngle), 'perpendicular', e.id);
  trySnap(polarPoint(e.center, e.radius, perpAngle + Math.PI), 'perpendicular', e.id);
  trySnap(closestPointOnCircle(p, e.center, e.radius), 'nearest', e.id);
}

function snapArc(e: ArcEntity, p: Point, trySnap: TryFn) {
  trySnap(polarPoint(e.center, e.radius, e.startAngle), 'endpoint', e.id);
  trySnap(polarPoint(e.center, e.radius, e.endAngle), 'endpoint', e.id);
  trySnap(e.center, 'center', e.id);
  const midA = (e.startAngle + e.endAngle) / 2;
  trySnap(polarPoint(e.center, e.radius, midA), 'midpoint', e.id);
  for (const a of [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2]) {
    if (angleInArc(a, e.startAngle, e.endAngle)) {
      trySnap(polarPoint(e.center, e.radius, a), 'quadrant', e.id);
    }
  }
  const cp = closestPointOnCircle(p, e.center, e.radius);
  if (angleInArc(angle(e.center, cp), e.startAngle, e.endAngle)) {
    trySnap(cp, 'nearest', e.id);
  }
}

function snapPolyline(e: PolylineEntity, p: Point, trySnap: TryFn) {
  for (let i = 0; i < e.points.length; i++) {
    trySnap(e.points[i], 'endpoint', e.id);
  }
  const count = e.closed ? e.points.length : e.points.length - 1;
  for (let i = 0; i < count; i++) {
    const a = e.points[i], b = e.points[(i + 1) % e.points.length];
    trySnap(midpoint(a, b), 'midpoint', e.id);
    trySnap(closestPointOnLine(p, a, b), 'nearest', e.id);
  }
}

function snapRect(e: RectEntity, p: Point, trySnap: TryFn) {
  for (const [a, b] of rectToLines(e)) {
    trySnap(a, 'endpoint', e.id);
    trySnap(midpoint(a, b), 'midpoint', e.id);
    trySnap(closestPointOnLine(p, a, b), 'nearest', e.id);
  }
}

function entityIntersections(a: Entity, b: Entity): Point[] {
  const segsA = entityToSegments(a);
  const segsB = entityToSegments(b);
  const circsA = entityToCircles(a);
  const circsB = entityToCircles(b);
  const pts: Point[] = [];

  for (const sa of segsA) {
    for (const sb of segsB) {
      const p = lineLineIntersection(sa[0], sa[1], sb[0], sb[1]);
      if (p) pts.push(p);
    }
    for (const cb of circsB) {
      pts.push(...lineCircleIntersections(sa[0], sa[1], cb.center, cb.radius));
    }
  }
  for (const ca of circsA) {
    for (const sb of segsB) {
      pts.push(...lineCircleIntersections(sb[0], sb[1], ca.center, ca.radius));
    }
    for (const cb of circsB) {
      pts.push(...circleCircleIntersections(ca.center, ca.radius, cb.center, cb.radius));
    }
  }
  return pts;
}

function entityToSegments(e: Entity): [Point, Point][] {
  switch (e.type) {
    case 'line': return [[e.start, e.end]];
    case 'polyline': {
      const segs: [Point, Point][] = [];
      const n = e.closed ? e.points.length : e.points.length - 1;
      for (let i = 0; i < n; i++) segs.push([e.points[i], e.points[(i + 1) % e.points.length]]);
      return segs;
    }
    case 'rect': return rectToLines(e);
    default: return [];
  }
}

function entityToCircles(e: Entity): { center: Point; radius: number }[] {
  switch (e.type) {
    case 'circle': return [{ center: e.center, radius: e.radius }];
    case 'arc': return [{ center: e.center, radius: e.radius }];
    default: return [];
  }
}
