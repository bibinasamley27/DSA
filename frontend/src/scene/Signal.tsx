import { signalPlacement } from '../lib/geometry';
import type { LampColor } from '../lib/signal';
import type { Direction } from '../types/simulation';
import { geo, mat } from './materials';

const ORDER: LampColor[] = ['red', 'yellow', 'green'];
const lampY = (c: LampColor) => 0.36 - ORDER.indexOf(c) * 0.36;
const POLE_H = 4.4;
const HEAD_Y = 3.6;   // head centre; bottom clears car roofs (~1.1)
const ARM_Y = 4.25;

/** Far-side mast-arm traffic light for one approach. `lamp` is the authoritative colour (null = no data: all dark). */
export function Signal({ direction, lamp, shadows }: { direction: Direction; lamp: LampColor | null; shadows: boolean }) {
  const { head, pole, yaw } = signalPlacement(direction);
  const armLen = Math.hypot(head.x - pole.x, head.z - pole.z) + 0.4;
  const armAngle = Math.atan2(head.x - pole.x, head.z - pole.z);
  return (
    <group userData={{ lamp }}>
      <mesh geometry={geo.unit} material={mat.pole} position={[pole.x, 0.25 + POLE_H / 2, pole.z]} scale={[0.16, POLE_H, 0.16]} castShadow={shadows} />
      <mesh geometry={geo.unit} material={mat.pole} position={[pole.x, 0.3, pole.z]} scale={[0.4, 0.12, 0.4]} />
      {/* mast arm from the pole out over the lane */}
      <group position={[pole.x, ARM_Y, pole.z]} rotation-y={armAngle}>
        <mesh geometry={geo.unit} material={mat.pole} position-z={armLen / 2} scale={[0.1, 0.1, armLen]} castShadow={shadows} />
      </group>
      <group position={[head.x, HEAD_Y, head.z]} rotation-y={yaw}>
        <mesh geometry={geo.unit} material={mat.pole} position-y={(ARM_Y - HEAD_Y) / 2 + 0.3} scale={[0.06, ARM_Y - HEAD_Y - 0.5, 0.06]} />
        <mesh geometry={geo.unit} material={mat.housing} scale={[0.42, 1.14, 0.32]} castShadow={shadows} />
        <mesh geometry={geo.unit} material={mat.backplate} position-z={-0.17} scale={[0.66, 1.36, 0.03]} />
        {/* lamps only on the front face, which faces the approaching traffic; the halo keeps the state visible from behind */}
        {ORDER.map((c) => (
          <mesh key={c} geometry={geo.lamp} material={lamp === c ? mat.lamp[c].on : mat.lamp[c].off} position={[0, lampY(c), 0.15]} />
        ))}
        {lamp && <sprite material={mat.halo[lamp]} position={[0, lampY(lamp), 0.3]} scale={1.3} />}
      </group>
    </group>
  );
}
