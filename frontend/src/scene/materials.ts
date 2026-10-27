// Shared geometries/materials/textures: created once, never per-vehicle or per-frame.
import {
  AdditiveBlending, BoxGeometry, BufferGeometry, CanvasTexture, Color, ConeGeometry, CylinderGeometry, DodecahedronGeometry,
  Float32BufferAttribute, MeshBasicMaterial, MeshStandardMaterial, RepeatWrapping, SphereGeometry, SpriteMaterial, SRGBColorSpace,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CAR_LEN } from '../lib/geometry';

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat = 1) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  if (g) draw(g);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(repeat, repeat);
  return t;
}

// Deterministic speckle so textures are identical on every load.
function speckle(g: CanvasRenderingContext2D, size: number, base: string, dots: string[], n: number) {
  g.fillStyle = base; g.fillRect(0, 0, size, size);
  let s = 12345;
  const r = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  for (let i = 0; i < n; i++) { g.fillStyle = dots[i % dots.length]!; g.fillRect(r() * size, r() * size, 1 + r() * 2, 1 + r() * 2); }
}

const radial = canvasTexture(128, 128, (g) => {
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.35, 'rgba(255,255,255,0.45)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
});
radial.wrapS = radial.wrapT = 1001; // ClampToEdge

/** 4×4 windows per tile; City.tsx scales wall UVs so one tile spans 8 × 12 world units (2 × 3 per window). */
export const windows = canvasTexture(256, 256, (g) => {
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 256);
  for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) {
    const lit = (row * 7 + col * 5) % 6 === 0;
    g.fillStyle = '#d9dde3'; g.fillRect(col * 64 + 10, row * 64 + 12, 44, 42); // frame
    g.fillStyle = lit ? '#f7e3a1' : '#4f6b86'; g.fillRect(col * 64 + 13, row * 64 + 15, 38, 36);
    g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(col * 64 + 13, row * 64 + 15, 38, 6);
  }
});

const asphaltTex = canvasTexture(256, 256, (g) => speckle(g, 256, '#4b4e56', ['#565a62', '#43464d', '#5e6169'], 2600), 12);
const grassTex = canvasTexture(256, 256, (g) => speckle(g, 256, '#7db166', ['#88bd70', '#71a35b', '#93c47a'], 3000), 90);

const glow = (color: string) => new MeshBasicMaterial({ color, map: radial, transparent: true, opacity: 0.85, depthWrite: false, blending: AdditiveBlending });
const halo = (color: string) => new SpriteMaterial({ color, map: radial, transparent: true, depthWrite: false, blending: AdditiveBlending });
const stripe = (color: string) => new MeshBasicMaterial({ color });

export const mat = {
  grass: new MeshStandardMaterial({ map: grassTex, roughness: 1 }),
  asphalt: new MeshStandardMaterial({ map: asphaltTex, roughness: 0.95 }),
  junction: new MeshStandardMaterial({ map: asphaltTex, color: '#e6e6e6', roughness: 0.95 }),
  sidewalk: new MeshStandardMaterial({ color: '#c3c9d3', roughness: 0.9 }),
  curb: new MeshStandardMaterial({ color: '#e4e7ec', roughness: 0.8 }),
  paint: new MeshBasicMaterial({ color: '#f2f2ee' }),
  centre: new MeshBasicMaterial({ color: '#f1c40f' }),
  pole: new MeshStandardMaterial({ color: '#2b2e33', roughness: 0.6, metalness: 0.3 }),
  housing: new MeshStandardMaterial({ color: '#1c1f24', roughness: 0.5 }),
  backplate: new MeshStandardMaterial({ color: '#111316', roughness: 0.7 }),
  deco: new MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true }),
  trunk: new MeshStandardMaterial({ color: '#7a5230' }),
  leaf: new MeshStandardMaterial({ color: '#3f9142', roughness: 1, flatShading: true }),
  leafLight: new MeshStandardMaterial({ color: '#5fae4a', roughness: 1, flatShading: true }),
  roof: new MeshStandardMaterial({ color: '#7d828c', roughness: 0.9 }),
  roofUnit: new MeshStandardMaterial({ color: '#a9aeb7', roughness: 0.7 }),
  carDetails: new MeshStandardMaterial({ vertexColors: true, roughness: 0.4 }),
  // crosswalk stripes / road glow / lamp halo follow the authoritative lamp of that approach
  stripe: { none: stripe('#ffffff'), red: stripe('#ff8a8a'), yellow: stripe('#ffe680'), green: stripe('#7dffa8') },
  glow: { red: glow('#ff3030'), yellow: glow('#ffc400'), green: glow('#20ff6a') },
  halo: { red: halo('#ff3b3b'), yellow: halo('#ffd21f'), green: halo('#3dff7a') },
  lamp: {
    red: { on: new MeshBasicMaterial({ color: '#ff3b3b' }), off: new MeshStandardMaterial({ color: '#3d1414' }) },
    yellow: { on: new MeshBasicMaterial({ color: '#ffd21f' }), off: new MeshStandardMaterial({ color: '#3d3410' }) },
    green: { on: new MeshBasicMaterial({ color: '#3dff7a' }), off: new MeshStandardMaterial({ color: '#103d1c' }) },
  },
};

/** Paint every vertex of `g` one colour so several parts can share one vertex-coloured draw call. */
export function tinted(g: BufferGeometry, color: string) {
  const c = new Color(color);
  const n = g.getAttribute('position').count;
  g.setAttribute('color', new Float32BufferAttribute(Array.from({ length: n * 3 }, (_, i) => [c.r, c.g, c.b][i % 3]!), 3));
  return g.index ? g.toNonIndexed() : g;
}
const placed = (g: BufferGeometry, x: number, y: number, z: number) => g.translate(x, y, z);

// Car faces -Z. Body (paint colour) and details (glass, wheels, lights) are two merged meshes → 2 draw calls per car.
const half = CAR_LEN / 2;
const carBody = mergeGeometries([
  placed(new BoxGeometry(1.15, 0.45, CAR_LEN), 0, 0.42, 0).toNonIndexed(),
  placed(new BoxGeometry(1.0, 0.42, CAR_LEN * 0.52), 0, 0.86, 0.12).toNonIndexed(),
])!;
const wheel = () => new CylinderGeometry(0.24, 0.24, 0.2, 10).rotateZ(Math.PI / 2);
const carDetails = mergeGeometries([
  tinted(placed(new BoxGeometry(1.04, 0.26, CAR_LEN * 0.55), 0, 0.84, 0.12), '#1f3446'),
  ...[[-0.56, -half * 0.62], [0.56, -half * 0.62], [-0.56, half * 0.62], [0.56, half * 0.62]].map(([x, z]) =>
    tinted(placed(wheel(), x!, 0.24, z!), '#16181c')),
  ...[-0.36, 0.36].map((x) => tinted(placed(new BoxGeometry(0.26, 0.12, 0.06), x, 0.48, -half - 0.01), '#fff4c2')),
  ...[-0.38, 0.38].map((x) => tinted(placed(new BoxGeometry(0.24, 0.1, 0.06), x, 0.5, half + 0.01), '#d4202a')),
])!;

export const geo = {
  carBody, carDetails,
  lamp: new SphereGeometry(0.14, 12, 8),
  unit: new BoxGeometry(1, 1, 1),
  trunk: new CylinderGeometry(0.16, 0.22, 1.4, 6),
  crown: new ConeGeometry(1.2, 3, 7),
  bush: new DodecahedronGeometry(1, 0),
};

const PALETTE = ['#e4572e', '#17bebb', '#ffc914', '#f4f4f4', '#2f6fdb', '#f15bb5', '#00a6a6', '#fb8500', '#3a3d44'];
const carMats = PALETTE.map((color) => new MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.25 }));
/** Cosmetic only: colour is a pure function of the stable vehicle id. */
export const carMaterial = (id: number) => carMats[Math.abs(id) % carMats.length]!;

const BUILDING = ['#e8e3d8', '#d9a99c', '#9fc0d6', '#ebd29a', '#b5c4a8', '#c4b3d6', '#d6d9de'];
export const buildingMats = BUILDING.map((color) => new MeshStandardMaterial({ color, map: windows, roughness: 0.85 }));
export const glassMat = new MeshStandardMaterial({ color: '#9cc3e0', map: windows, roughness: 0.2, metalness: 0.55 });
