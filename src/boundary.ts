import { Point, Entity } from './types';
import { store } from './store';
import { dist, angle, polarPoint, rectToLines, lineLineIntersection, lineCircleIntersections, angleInArc, normalizeAngle } from './geometry';

const EPS = 1e-6;

interface Segment {
  p1: Point;
  p2: Point;
  entityId: string;
}

function ptKey(p: Point): string {
  return `${Math.round(p.x / EPS) * EPS},${Math.round(p.y / EPS) * EPS}`;
}

function ptsClose(a: Point, b: Point): boolean {
  return Math.abs(a.x - b.x) < EPS * 10 && Math.abs(a.y - b.y) < EPS * 10;
}

function entityToSegments(e: Entity): Segment[] {
  const id = e.id;
  switch (e.type) {
    case 'line':
      return [{ p1: e.start, p2: e.end, entityId: id }];
    case 'polyline': {
      const segs: Segment[] = [];
      const n = e.closed ? e.points.length : e.points.length - 1;
      for (let i = 0; i < n; i++)
        segs.push({ p1: e.points[i], p2: e.points[(i + 1) % e.points.length], entityId: id });
      return segs;
    }
    case 'rect':
      return rectToLines(e).map(([a, b]) => ({ p1: a, p2: b, entityId: id }));
    case 'circle': {
      const segs: Segment[] = [];
      const N = 72;
      for (let i = 0; i < N; i++) {
        const a1 = (2 * Math.PI * i) / N;
        const a2 = (2 * Math.PI * (i + 1)) / N;
        segs.push({ p1: polarPoint(e.center, e.radius, a1), p2: polarPoint(e.center, e.radius, a2), entityId: id });
      }
      return segs;
    }
    case 'arc': {
      const segs: Segment[] = [];
      let sweep = e.endAngle - e.startAngle;
      if (sweep < 0) sweep += Math.PI * 2;
      const N = Math.max(8, Math.ceil(sweep / (Math.PI / 18)));
      for (let i = 0; i < N; i++) {
        const a1 = e.startAngle + (sweep * i) / N;
        const a2 = e.startAngle + (sweep * (i + 1)) / N;
        segs.push({ p1: polarPoint(e.center, e.radius, a1), p2: polarPoint(e.center, e.radius, a2), entityId: id });
      }
      return segs;
    }
    default:
      return [];
  }
}

function segSegIntersection(a1: Point, a2: Point, b1: Point, b2: Point): Point | null {
  const d1x = a2.x - a1.x, d1y = a2.y - a1.y;
  const d2x = b2.x - b1.x, d2y = b2.y - b1.y;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-12) return null;
  const t = ((b1.x - a1.x) * d2y - (b1.y - a1.y) * d2x) / denom;
  const u = ((b1.x - a1.x) * d1y - (b1.y - a1.y) * d1x) / denom;
  if (t < 1e-8 || t > 1 - 1e-8 || u < 1e-8 || u > 1 - 1e-8) return null;
  return { x: a1.x + t * d1x, y: a1.y + t * d1y };
}

function splitSegmentsAtIntersections(segs: Segment[]): Segment[] {
  const result: Segment[] = [];
  const splits: Map<number, Point[]> = new Map();

  for (let i = 0; i < segs.length; i++) splits.set(i, []);

  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const pt = segSegIntersection(segs[i].p1, segs[i].p2, segs[j].p1, segs[j].p2);
      if (pt) {
        splits.get(i)!.push(pt);
        splits.get(j)!.push(pt);
      }
    }
  }

  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    const pts = splits.get(i)!;
    if (pts.length === 0) {
      result.push(seg);
      continue;
    }
    const dx = seg.p2.x - seg.p1.x, dy = seg.p2.y - seg.p1.y;
    const sorted = pts.sort((a, b) => {
      const ta = (a.x - seg.p1.x) * dx + (a.y - seg.p1.y) * dy;
      const tb = (b.x - seg.p1.x) * dx + (b.y - seg.p1.y) * dy;
      return ta - tb;
    });
    let prev = seg.p1;
    for (const pt of sorted) {
      if (dist(prev, pt) > EPS) {
        result.push({ p1: prev, p2: pt, entityId: seg.entityId });
      }
      prev = pt;
    }
    if (dist(prev, seg.p2) > EPS) {
      result.push({ p1: prev, p2: seg.p2, entityId: seg.entityId });
    }
  }

  return result;
}

interface DirEdge {
  from: Point;
  to: Point;
  segIdx: number;
}

function buildGraph(segs: Segment[]): Map<string, DirEdge[]> {
  const graph = new Map<string, DirEdge[]>();

  const addEdge = (from: Point, to: Point, idx: number) => {
    const key = ptKey(from);
    if (!graph.has(key)) graph.set(key, []);
    graph.get(key)!.push({ from, to, segIdx: idx });
  };

  for (let i = 0; i < segs.length; i++) {
    addEdge(segs[i].p1, segs[i].p2, i);
    addEdge(segs[i].p2, segs[i].p1, i);
  }

  return graph;
}

function rayIntersectSeg(origin: Point, seg: Segment): number | null {
  const dx = 1, dy = 0;
  const sx = seg.p2.x - seg.p1.x, sy = seg.p2.y - seg.p1.y;
  const denom = dx * sy - dy * sx;
  if (Math.abs(denom) < 1e-12) return null;
  const t = ((seg.p1.x - origin.x) * sy - (seg.p1.y - origin.y) * sx) / denom;
  const u = ((seg.p1.x - origin.x) * dy - (seg.p1.y - origin.y) * dx) / denom;
  if (t < EPS || u < EPS || u > 1 - EPS) return null;
  return t;
}

export function detectBoundary(pickPoint: Point, entities: Entity[]): Point[] | null {
  const allSegs: Segment[] = [];
  for (const e of entities) {
    if (!e.visible) continue;
    if (e.type === 'text' || e.type === 'dimension' || e.type === 'point' || e.type === 'hatch' || e.type === 'blockref') continue;
    allSegs.push(...entityToSegments(e));
  }

  if (allSegs.length === 0) return null;

  const splitSegs = splitSegmentsAtIntersections(allSegs);
  const graph = buildGraph(splitSegs);

  let nearestT = Infinity;
  let nearestSegIdx = -1;
  for (let i = 0; i < splitSegs.length; i++) {
    const t = rayIntersectSeg(pickPoint, splitSegs[i]);
    if (t !== null && t < nearestT) {
      nearestT = t;
      nearestSegIdx = i;
    }
  }

  if (nearestSegIdx < 0) return null;

  const hitSeg = splitSegs[nearestSegIdx];
  const hitPoint: Point = { x: pickPoint.x + nearestT, y: pickPoint.y };

  const toP1 = angle(hitPoint, hitSeg.p1);
  const toP2 = angle(hitPoint, hitSeg.p2);
  const fromPickAngle = angle(hitPoint, pickPoint);

  let startDir: DirEdge;
  const ccwP1 = normalizeAngle(toP1 - fromPickAngle);
  const ccwP2 = normalizeAngle(toP2 - fromPickAngle);

  if (ccwP1 < ccwP2) {
    startDir = { from: hitPoint, to: hitSeg.p1, segIdx: nearestSegIdx };
  } else {
    startDir = { from: hitPoint, to: hitSeg.p2, segIdx: nearestSegIdx };
  }

  const boundary: Point[] = [hitPoint];
  let current = startDir;
  const maxSteps = splitSegs.length * 2;

  for (let step = 0; step < maxSteps; step++) {
    boundary.push(current.to);

    if (boundary.length > 3 && ptsClose(current.to, hitPoint)) {
      boundary.pop();
      return boundary;
    }

    const nodeKey = ptKey(current.to);
    const edges = graph.get(nodeKey);
    if (!edges || edges.length === 0) return null;

    const incomingAngle = angle(current.to, current.from);

    let bestEdge: DirEdge | null = null;
    let bestTurn = Infinity;

    for (const edge of edges) {
      if (ptsClose(edge.to, current.from) && edge.segIdx === current.segIdx) continue;

      const outAngle = angle(current.to, edge.to);
      let turn = normalizeAngle(outAngle - incomingAngle);
      if (turn < EPS) turn = Math.PI * 2;

      if (turn < bestTurn) {
        bestTurn = turn;
        bestEdge = edge;
      }
    }

    if (!bestEdge) return null;
    current = bestEdge;
  }

  return null;
}

// --- Polygon utilities ---

export function pointInPolygon(pt: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    if ((yi > pt.y) !== (yj > pt.y) &&
        pt.x < (xj - xi) * (pt.y - yi) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

export function polygonArea(pts: Point[]): number {
  let area = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    area += (pts[j].x + pts[i].x) * (pts[j].y - pts[i].y);
  }
  return area / 2;
}

function ensureCCW(pts: Point[]): Point[] {
  return polygonArea(pts) < 0 ? pts : [...pts].reverse();
}

function ensureCW(pts: Point[]): Point[] {
  return polygonArea(pts) > 0 ? pts : [...pts].reverse();
}

// --- Polygon Boolean Operations (Greiner-Hormann-inspired) ---

interface Vertex {
  x: number;
  y: number;
  next: Vertex | null;
  prev: Vertex | null;
  intersect: boolean;
  entering: boolean;
  neighbor: Vertex | null;
  alpha: number;
  visited: boolean;
}

function makeVertexList(pts: Point[]): { head: Vertex; count: number } {
  const vertices: Vertex[] = pts.map(p => ({
    x: p.x, y: p.y,
    next: null, prev: null,
    intersect: false, entering: false,
    neighbor: null, alpha: 0, visited: false,
  }));
  for (let i = 0; i < vertices.length; i++) {
    vertices[i].next = vertices[(i + 1) % vertices.length];
    vertices[i].prev = vertices[(i + vertices.length - 1) % vertices.length];
  }
  return { head: vertices[0], count: vertices.length };
}

function insertIntersection(v1: Vertex, v2: Vertex, pt: Point, alpha: number): Vertex {
  const iv: Vertex = {
    x: pt.x, y: pt.y,
    next: null, prev: null,
    intersect: true, entering: false,
    neighbor: null, alpha, visited: false,
  };
  let curr = v1;
  while (curr !== v2) {
    if (!curr.next!.intersect || curr.next!.alpha > alpha) break;
    curr = curr.next!;
  }
  iv.next = curr.next;
  iv.prev = curr;
  curr.next!.prev = iv;
  curr.next = iv;
  return iv;
}

function lineIntersectParam(a1: Point, a2: Point, b1: Point, b2: Point): { t: number; u: number } | null {
  const d1x = a2.x - a1.x, d1y = a2.y - a1.y;
  const d2x = b2.x - b1.x, d2y = b2.y - b1.y;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-10) return null;
  const t = ((b1.x - a1.x) * d2y - (b1.y - a1.y) * d2x) / denom;
  const u = ((b1.x - a1.x) * d1y - (b1.y - a1.y) * d1x) / denom;
  if (t <= 0 || t >= 1 || u <= 0 || u >= 1) return null;
  return { t, u };
}

function greinerHormann(subjectPts: Point[], clipPts: Point[], operation: 'union' | 'intersect' | 'subtract'): Point[][] {
  const subjCCW = ensureCCW(subjectPts);
  let clipForOp = clipPts;
  if (operation === 'intersect') {
    clipForOp = ensureCCW(clipPts);
  } else if (operation === 'union' || operation === 'subtract') {
    clipForOp = ensureCW(clipPts);
  }

  const subj = makeVertexList(subjCCW);
  const clip = makeVertexList(clipForOp);

  let sV = subj.head;
  let intersectionCount = 0;
  do {
    let cV = clip.head;
    do {
      const result = lineIntersectParam(
        { x: sV.x, y: sV.y }, { x: sV.next!.x, y: sV.next!.y },
        { x: cV.x, y: cV.y }, { x: cV.next!.x, y: cV.next!.y }
      );
      if (result) {
        const pt = {
          x: sV.x + result.t * (sV.next!.x - sV.x),
          y: sV.y + result.t * (sV.next!.y - sV.y),
        };
        const sInter = insertIntersection(sV, sV.next!, pt, result.t);
        const cInter = insertIntersection(cV, cV.next!, pt, result.u);
        sInter.neighbor = cInter;
        cInter.neighbor = sInter;
        intersectionCount++;
      }
      cV = cV.next!;
      while (cV.intersect) cV = cV.next!;
    } while (cV !== clip.head);
    sV = sV.next!;
    while (sV.intersect) sV = sV.next!;
  } while (sV !== subj.head);

  if (intersectionCount === 0) {
    const sInClip = pointInPolygon({ x: subj.head.x, y: subj.head.y }, clipPts);
    const cInSubj = pointInPolygon({ x: clip.head.x, y: clip.head.y }, subjectPts);

    if (operation === 'intersect') {
      if (sInClip) return [subjCCW];
      if (cInSubj) return [clipPts];
      return [];
    }
    if (operation === 'union') {
      if (sInClip) return [clipPts];
      if (cInSubj) return [subjCCW];
      return [subjCCW, clipPts];
    }
    if (operation === 'subtract') {
      if (sInClip) return [];
      if (cInSubj) return [subjCCW, clipPts];
      return [subjCCW];
    }
    return [];
  }

  // Mark entering/exiting
  sV = subj.head;
  let entering = !pointInPolygon({ x: sV.x, y: sV.y }, clipPts);
  do {
    if (sV.intersect) {
      sV.entering = entering;
      entering = !entering;
    }
    sV = sV.next!;
  } while (sV !== subj.head);

  // Collect result polygons
  const results: Point[][] = [];
  sV = subj.head;
  do {
    if (sV.intersect && !sV.visited) {
      const poly: Point[] = [];
      let current: Vertex = sV;
      let onSubject = true;
      const maxIter = (subj.count + clip.count + intersectionCount * 2) * 2;
      let iter = 0;

      do {
        if (iter++ > maxIter) break;
        current.visited = true;
        if (current.neighbor) current.neighbor.visited = true;

        if (current.entering) {
          do {
            current = current.next!;
            poly.push({ x: current.x, y: current.y });
            if (iter++ > maxIter) break;
          } while (!current.intersect);
        } else {
          do {
            current = current.prev!;
            poly.push({ x: current.x, y: current.y });
            if (iter++ > maxIter) break;
          } while (!current.intersect);
        }

        if (current.neighbor) {
          current = current.neighbor;
        } else {
          break;
        }
      } while (!ptsClose(current, sV) && iter < maxIter);

      if (poly.length >= 3) {
        results.push(poly);
      }
    }
    sV = sV.next!;
  } while (sV !== subj.head);

  return results.length > 0 ? results : [];
}

export function polygonIntersect(a: Point[], b: Point[]): Point[][] {
  return greinerHormann(a, b, 'intersect');
}

export function polygonUnion(a: Point[], b: Point[]): Point[][] {
  return greinerHormann(a, b, 'union');
}

export function polygonSubtract(a: Point[], b: Point[]): Point[][] {
  return greinerHormann(a, b, 'subtract');
}
