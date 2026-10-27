// Static scenery. Deterministic (fixed LCG, no Math.random) and carries no simulation data.
// Everything is merged per material, so the whole city is ~10 draw calls regardless of size.
import { memo, useEffect, useMemo } from 'react';
import { BoxGeometry, type BufferGeometry, ConeGeometry, CylinderGeometry, DodecahedronGeometry } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ARM, ROAD_HALF, SIDE_HALF, SIDE_STREET, SIDEWALK_W, WORLD } from '../lib/geometry';
import { STREET_FURNITURE } from '../lib/pedestrians';
import { buildingMats, glassMat, mat, tinted } from './materials';

function lcg(seed: number) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

const TILE_W = 8;   // window texture tile width in world units (4 windows)
const TILE_H = 12;  // tile height (4 floors)

/** Box wall with UVs scaled to world size so windows keep a constant size on every building. */
function wall(w: number, h: number, d: number, x: number, y: number, z: number): BufferGeometry {
  const g = new BoxGeometry(w, h, d);
  const uv = g.getAttribute('uv');
  // BoxGeometry face order: +x, -x, +y, -y, +z, -z; 4 vertices each.
  for (let f = 0; f < 6; f++) {
    const across = f < 2 ? d : w;
    const up = f === 2 || f === 3 ? d : h;
    for (let i = f * 4; i < f * 4 + 4; i++) uv.setXY(i, uv.getX(i) * across / TILE_W, uv.getY(i) * up / TILE_H);
  }
  return g.translate(x, y, z).toNonIndexed();
}
const box = (w: number, h: number, d: number, x: number, y: number, z: number, color: string) =>
  tinted(new BoxGeometry(w, h, d).translate(x, y, z), color);

interface Out { walls: BufferGeometry[][]; glass: BufferGeometry[]; deco: BufferGeometry[] }

const ROOF = ['#b5523b', '#8c4a3a', '#5b6370', '#7a5c4a'];
const AWNING = ['#e63946', '#2a9d8f', '#f4a261', '#457b9d', '#e9c46a'];
const LEAF = ['#3f9142', '#5fae4a', '#2f7a3a'];

function tree(o: Out, x: number, z: number, s: number, kind: number) {
  o.deco.push(tinted(new CylinderGeometry(0.16 * s, 0.22 * s, 1.4 * s, 6).translate(x, 0.7 * s, z), '#7a5230'));
  const leaf = LEAF[kind % LEAF.length]!;
  o.deco.push(kind % 3 === 0
    ? tinted(new DodecahedronGeometry(1.3 * s, 0).translate(x, 2.2 * s, z), leaf)
    : tinted(new ConeGeometry(1.2 * s, 3 * s, 7).translate(x, 2.7 * s, z), leaf));
}

/** Which way the building's front faces: toward the nearer main road. */
function front(x: number, z: number) {
  return Math.abs(x) < Math.abs(z) ? { ax: 'x' as const, sign: -Math.sign(x) } : { ax: 'z' as const, sign: -Math.sign(z) };
}

function house(o: Out, r: () => number, x: number, z: number) {
  const w = 5 + r() * 2, d = 5 + r() * 2, h = 2.6 + r() * 0.8;
  o.walls[Math.floor(r() * buildingMats.length)]!.push(wall(w, h, d, x, h / 2, z));
  // hip roof: 4-sided cone rotated so its base is a square, scaled to the footprint
  o.deco.push(tinted(new ConeGeometry(Math.SQRT1_2, 1, 4).rotateY(Math.PI / 4).scale(w + 0.6, 2 + r(), d + 0.6).translate(x, h + 1, z), ROOF[Math.floor(r() * ROOF.length)]!));
  const f = front(x, z);
  o.deco.push(f.ax === 'x'
    ? box(0.1, 1.6, 0.9, x + f.sign * (w / 2 + 0.05), 0.8, z, '#5a3d2b')
    : box(0.9, 1.6, 0.1, x, 0.8, z + f.sign * (d / 2 + 0.05), '#5a3d2b'));
  if (r() < 0.5) tree(o, x + (r() - 0.5) * w, z + (r() - 0.5) * d * 1.6, 0.6, Math.floor(r() * 3));
}

function shop(o: Out, r: () => number, x: number, z: number) {
  const w = 8 + r(), d = 7 + r(), h = 3.4 + r() * 1.2;
  o.walls[Math.floor(r() * buildingMats.length)]!.push(wall(w, h, d, x, h / 2, z));
  o.deco.push(box(w + 0.3, 0.3, d + 0.3, x, h + 0.15, z, '#7d828c'));
  const f = front(x, z);
  const c = AWNING[Math.floor(r() * AWNING.length)]!;
  o.deco.push(f.ax === 'x'
    ? box(1.3, 0.12, d * 0.9, x + f.sign * (w / 2 + 0.6), 2.4, z, c)
    : box(w * 0.9, 0.12, 1.3, x, 2.4, z + f.sign * (d / 2 + 0.6), c));
  o.deco.push(f.ax === 'x'
    ? box(0.15, 0.8, d * 0.6, x + f.sign * (w / 2 + 0.1), h + 0.7, z, '#fafafa')
    : box(w * 0.6, 0.8, 0.15, x, h + 0.7, z + f.sign * (d / 2 + 0.1), '#fafafa'));
}

function office(o: Out, r: () => number, x: number, z: number, maxH: number) {
  const w = 7 + r() * 2, d = 7 + r() * 2, h = Math.min(maxH, 5 + r() * 7);
  o.deco.push(box(w + 0.2, 1.2, d + 0.2, x, 0.6, z, '#5b616b')); // ground-floor band
  o.walls[Math.floor(r() * buildingMats.length)]!.push(wall(w, h - 1.2, d, x, 1.2 + (h - 1.2) / 2, z));
  o.deco.push(box(w + 0.3, 0.35, d + 0.3, x, h + 0.17, z, '#7d828c'));
  if (r() < 0.7) o.deco.push(box(1.8, 0.8, 1.3, x + w * 0.15, h + 0.75, z - d * 0.15, '#a9aeb7'));
}

function tower(o: Out, r: () => number, x: number, z: number) {
  const w = 8 + r(), d = 8 + r(), h1 = 10 + r() * 10, h2 = 6 + r() * 12;
  const glassy = r() < 0.45;
  const target = glassy ? o.glass : o.walls[Math.floor(r() * buildingMats.length)]!;
  o.deco.push(box(w + 0.2, 1.4, d + 0.2, x, 0.7, z, '#4b5058'));
  target.push(wall(w, h1 - 1.4, d, x, 1.4 + (h1 - 1.4) / 2, z));
  o.deco.push(box(w + 0.3, 0.3, d + 0.3, x, h1 + 0.15, z, '#7d828c'));
  target.push(wall(w * 0.68, h2, d * 0.68, x, h1 + 0.3 + h2 / 2, z));
  o.deco.push(box(w * 0.68 + 0.3, 0.3, d * 0.68 + 0.3, x, h1 + h2 + 0.45, z, '#7d828c'));
  if (r() < 0.5) o.deco.push(tinted(new CylinderGeometry(0.06, 0.06, 4, 4).translate(x, h1 + h2 + 2.6, z), '#cfd3d9'));
}

function park(o: Out, r: () => number, x: number, z: number) {
  o.deco.push(box(9, 0.06, 9, x, 0.03, z, '#6fa85a'));
  o.deco.push(box(9, 0.07, 1.2, x, 0.04, z, '#d8c9a3'), box(1.2, 0.07, 9, x, 0.04, z, '#d8c9a3')); // paths
  for (let i = 0; i < 5; i++) tree(o, x + (r() - 0.5) * 8, z + (r() - 0.5) * 8, 0.7 + r() * 0.5, i);
}

function streetLamp(o: Out, x: number, z: number) {
  o.deco.push(
    tinted(new CylinderGeometry(0.07, 0.09, 3.4, 5).translate(x, 1.7, z), '#3a3e45'),
    box(0.5, 0.18, 0.5, x, 3.45, z, '#3a3e45'),
    box(0.36, 0.08, 0.36, x, 3.33, z, '#fff3c4'),
  );
}

function layout() {
  const r = lcg(11);
  const o: Out = { walls: buildingMats.map(() => []), glass: [], deco: [] };
  const inner = Array.from({ length: 4 }, (_, i) => ROAD_HALF + SIDEWALK_W + 1.5 + 5.5 + i * 11);
  const outer = Array.from({ length: 5 }, (_, i) => SIDE_STREET + SIDE_HALF + 1.5 + 5.5 + i * 11);
  const cells = [...inner.map((v) => ({ v, ring: 0 })), ...outer.map((v) => ({ v, ring: 1 }))];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const cameraSide = sx === 1 && sz === 1; // default camera looks from here: keep it low so the junction stays visible
    for (const cx of cells) for (const cz of cells) {
      const x = sx * cx.v, z = sz * cz.v;
      const ring = cx.ring + cz.ring; // 0 = inner block, 2 = outer corner block
      const t = r();
      if (cameraSide && ring === 0) { if (t < 0.3) park(o, r, x, z); else house(o, r, x, z); continue; }
      if (cameraSide) { if (t < 0.25) park(o, r, x, z); else if (t < 0.6) house(o, r, x, z); else office(o, r, x, z, 7); continue; }
      if (ring === 0) { if (t < 0.15) park(o, r, x, z); else if (t < 0.5) shop(o, r, x, z); else if (t < 0.75) house(o, r, x, z); else office(o, r, x, z, 10); continue; }
      if (ring === 1) { if (t < 0.15) park(o, r, x, z); else if (t < 0.45) shop(o, r, x, z); else office(o, r, x, z, 14); continue; }
      if (t < 0.12) park(o, r, x, z); else if (t < 0.4) office(o, r, x, z, 16); else tower(o, r, x, z);
    }
  }
  // street trees and lamps along the main-road sidewalks (skip side-street crossings)
  const off = STREET_FURNITURE;
  for (const d of [-1, 1]) for (let t = 10; t < WORLD; t += 7) {
    if (Math.abs(t - SIDE_STREET) < SIDE_HALF + 2) continue;
    for (const side of [-1, 1]) {
      const lamp = Math.round(t / 7) % 2 === 0;
      for (const [x, z] of [[side * off, d * t], [d * t, side * off]] as const) {
        if (lamp) streetLamp(o, x, z); else if (t > ARM * 0.3) tree(o, x, z, 0.55, Math.round(t));
      }
    }
  }
  return o;
}

function CityImpl({ shadows }: { shadows: boolean }) {
  const merged = useMemo(() => {
    const o = layout();
    return {
      walls: o.walls.map((g, i) => (g.length ? { geo: mergeGeometries(g)!, mat: buildingMats[i]! } : null)).filter((x) => x !== null),
      glass: o.glass.length ? mergeGeometries(o.glass)! : null,
      deco: mergeGeometries(o.deco)!,
    };
  }, []);
  useEffect(() => () => {
    merged.walls.forEach((w) => w.geo.dispose());
    merged.glass?.dispose();
    merged.deco.dispose();
  }, [merged]);
  return (
    <group>
      {merged.walls.map((w, i) => <mesh key={i} geometry={w.geo} material={w.mat} castShadow={shadows} receiveShadow={shadows} />)}
      {merged.glass && <mesh geometry={merged.glass} material={glassMat} castShadow={shadows} />}
      <mesh geometry={merged.deco} material={mat.deco} castShadow={shadows} receiveShadow={shadows} />
    </group>
  );
}
export const City = memo(CityImpl);
