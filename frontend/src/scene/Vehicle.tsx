import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { Group } from 'three';
import { isSupercar, type PoseTracker } from '../lib/interp';
import type { SimClock } from '../lib/simClock';
import { carMaterial, geo, mat, superMaterial } from './materials';

/** One server-reported vehicle. Transform comes from the PoseTracker each frame; no React state. */
export function Vehicle({ id, tracker, clock, shadows }: { id: number; tracker: PoseTracker; clock: SimClock; shadows: boolean }) {
  const ref = useRef<Group>(null);
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    const now = performance.now();
    const pose = tracker.sample(id, now, clock.value(now));
    g.visible = pose !== null;
    if (pose) {
      g.position.set(pose.x, 0.02, pose.z);
      g.rotation.y = pose.heading;
      g.scale.setScalar(pose.scale);
    }
  });
  return (
    <group ref={ref} visible={false}>
      {isSupercar(id) ? (
        <>
          <mesh geometry={geo.superBody} material={superMaterial(id)} castShadow={shadows} />
          <mesh geometry={geo.superDetails} material={mat.carDetails} />
        </>
      ) : (
        <>
          <mesh geometry={geo.carBody} material={carMaterial(id)} castShadow={shadows} />
          <mesh geometry={geo.carDetails} material={mat.carDetails} />
        </>
      )}
    </group>
  );
}
