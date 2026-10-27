import { useEffect, useMemo } from 'react';
import { BoxGeometry, type BufferGeometry } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ROAD_HALF, SIDE_HALF, SIDE_STREET, SIDEWALK_W, WORLD } from '../lib/geometry';
import { mat } from './materials';
import { City } from './City';

const seg = (from: number, to: number) => ({ mid: (from + to) / 2, len: to - from });
// Main-road sidewalks break where the scenery side streets cross.
const WALK_SEGS = [seg(ROAD_HALF, SIDE_STREET - SIDE_HALF), seg(SIDE_STREET + SIDE_HALF, WORLD)];

/** Boxes laid along the X axis (`alongX`) or Z axis, mirrored to both ends of a road. */
function strip(out: BufferGeometry[], alongX: boolean, mid: number, len: number, across: number, y: number, h: number, w: number) {
  for (const end of [-1, 1]) {
    const g = alongX ? new BoxGeometry(len, h, w).translate(end * mid, y, across) : new BoxGeometry(w, h, len).translate(across, y, end * mid);
    out.push(g.toNonIndexed());
  }
}

function build() {
  const asphalt: BufferGeometry[] = [];
  const sidewalk: BufferGeometry[] = [];
  const curb: BufferGeometry[] = [];
  const paint: BufferGeometry[] = [];
  const centre: BufferGeometry[] = [];
  const width = 2 * ROAD_HALF;
  const arm = seg(ROAD_HALF, WORLD);
  for (const alongX of [true, false]) {
    strip(asphalt, alongX, arm.mid, arm.len, 0, 0, 0.04, width);
    for (const side of [-1, 1]) {
      for (const s of WALK_SEGS) {
        strip(sidewalk, alongX, s.mid, s.len, side * (ROAD_HALF + SIDEWALK_W / 2), 0.1, 0.25, SIDEWALK_W);
        strip(curb, alongX, s.mid, s.len, side * (ROAD_HALF + 0.12), 0.14, 0.3, 0.24);
      }
      strip(paint, alongX, arm.mid, arm.len, side * (ROAD_HALF - 0.3), 0.03, 0.02, 0.1);
      strip(centre, alongX, arm.mid, arm.len, side * 0.12, 0.03, 0.02, 0.08);
    }
    // scenery side streets (no traffic): full-length strips at ±SIDE_STREET with a dashed centre line
    for (const at of [-SIDE_STREET, SIDE_STREET]) {
      const g = alongX ? new BoxGeometry(2 * WORLD, 0.04, 2 * SIDE_HALF).translate(0, -0.003, at)
        : new BoxGeometry(2 * SIDE_HALF, 0.04, 2 * WORLD).translate(at, -0.006, 0);
      asphalt.push(g.toNonIndexed());
      for (let t = -WORLD + 2; t < WORLD; t += 4) {
        if (Math.abs(t) < ROAD_HALF + 1 || Math.abs(Math.abs(t) - SIDE_STREET) < SIDE_HALF + 1) continue;
        paint.push((alongX ? new BoxGeometry(1.6, 0.02, 0.12).translate(t, 0.03, at) : new BoxGeometry(0.12, 0.02, 1.6).translate(at, 0.03, t)).toNonIndexed());
      }
    }
  }
  return { asphalt, sidewalk, curb, paint, centre };
}

/** Cross-shaped asphalt out to the world edge, sidewalks with kerbs, lane lines, side streets and the city. */
export function Road({ shadows }: { shadows: boolean }) {
  const geos = useMemo(() => {
    const b = build();
    return {
      asphalt: mergeGeometries(b.asphalt)!, sidewalk: mergeGeometries(b.sidewalk)!, curb: mergeGeometries(b.curb)!,
      paint: mergeGeometries(b.paint)!, centre: mergeGeometries(b.centre)!,
    };
  }, []);
  useEffect(() => () => Object.values(geos).forEach((g) => g.dispose()), [geos]);
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position-y={-0.02} material={mat.grass} receiveShadow={shadows}>
        <planeGeometry args={[8 * WORLD, 8 * WORLD]} />
      </mesh>
      <City shadows={shadows} />
      <mesh geometry={geos.asphalt} material={mat.asphalt} receiveShadow={shadows} />
      <mesh geometry={geos.sidewalk} material={mat.sidewalk} receiveShadow={shadows} />
      <mesh geometry={geos.curb} material={mat.curb} receiveShadow={shadows} />
      <mesh geometry={geos.paint} material={mat.paint} />
      <mesh geometry={geos.centre} material={mat.centre} />
    </group>
  );
}
