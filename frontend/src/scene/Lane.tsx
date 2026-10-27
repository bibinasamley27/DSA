import { useMemo } from 'react';
import { CanvasTexture, SpriteMaterial } from 'three';
import { HEADING, LANE_W, OUTWARD, ROAD_HALF, STOP } from '../lib/geometry';
import type { LampColor } from '../lib/signal';
import type { Direction } from '../types/simulation';
import { geo, mat } from './materials';

const NAME: Record<Direction, string> = { N: 'NORTH', E: 'EAST', S: 'SOUTH', W: 'WEST' };

function labelMaterial(d: Direction) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 96;
  const g = c.getContext('2d');
  if (g) {
    g.fillStyle = 'rgba(20,24,31,0.85)';
    g.beginPath(); g.roundRect(4, 4, 248, 88, 40); g.fill();
    g.fillStyle = '#fff'; g.font = 'bold 54px system-ui, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(NAME[d], 128, 52);
  }
  return new SpriteMaterial({ map: new CanvasTexture(c), depthTest: false });
}

/** One approach: stop line, signal-coloured crosswalk, road glow, arrow and compass label. */
export function Lane({ direction, lamp }: { direction: Direction; lamp: LampColor | null }) {
  const o = OUTWARD[direction];
  const lateral = { x: o.z * LANE_W / 2, z: -o.x * LANE_W / 2 };
  const label = useMemo(() => labelMaterial(direction), [direction]);
  const alongX = o.x !== 0;
  const at = (dist: number, y = 0.035, lat = 1) => [o.x * dist + lateral.x * lat, y, o.z * dist + lateral.z * lat] as const;
  const crossAt = (STOP + ROAD_HALF) / 2;
  const stripes = [-3, -2, -1, 0, 1, 2, 3];
  const stripeMat = mat.stripe[lamp ?? 'none'];
  return (
    <group>
      <mesh geometry={geo.unit} material={mat.paint} position={at(STOP)} scale={alongX ? [0.3, 0.02, LANE_W * 0.95] : [LANE_W * 0.95, 0.02, 0.3]} />
      {stripes.map((k) => (
        <mesh key={k} geometry={geo.unit} material={stripeMat}
          position={[o.x * crossAt + (alongX ? 0 : k * 0.62), 0.04, o.z * crossAt + (alongX ? k * 0.62 : 0)]}
          scale={alongX ? [(STOP - ROAD_HALF) * 0.7, 0.02, 0.34] : [0.34, 0.02, (STOP - ROAD_HALF) * 0.7]} />
      ))}
      {lamp && (
        <mesh material={mat.glow[lamp]} position={[o.x * (STOP + 1.5), 0.06, o.z * (STOP + 1.5)]} rotation-x={-Math.PI / 2} scale={9}>
          <planeGeometry args={[1, 1]} />
        </mesh>
      )}
      <group position={at(STOP + 8)} rotation-y={HEADING[direction]}>
        <mesh geometry={geo.unit} material={mat.paint} scale={[0.18, 0.02, 1.4]} position-z={0.2} />
        <mesh material={mat.paint} position-z={-0.7} rotation-x={-Math.PI / 2}><coneGeometry args={[0.45, 0.8, 3]} /></mesh>
      </group>
      <sprite material={label} position={[o.x * 15 - lateral.x * 4.5, 3.2, o.z * 15 - lateral.z * 4.5]} scale={[7, 2.6, 1]} />
    </group>
  );
}
