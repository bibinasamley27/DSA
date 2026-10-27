import { ROAD_HALF } from '../lib/geometry';
import { mat } from './materials';

/** Central conflict box where the four straight-through paths cross. */
export function Junction() {
  return (
    <mesh position-y={0.045} material={mat.junction} receiveShadow>
      <boxGeometry args={[2 * ROAD_HALF, 0.02, 2 * ROAD_HALF]} />
    </mesh>
  );
}
