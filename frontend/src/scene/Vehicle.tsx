import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { Group, Mesh } from 'three';
import { isSupercar, type PoseTracker } from '../lib/interp';
import type { SimClock } from '../lib/simClock';
import type { VehicleState } from '../types/simulation';
import { ambulanceMat, carMaterial, geo, mat, siren, superMaterial } from './materials';

/** One server-reported vehicle. Transform comes from the PoseTracker each frame; no React state. */
export function Vehicle({ id, kind, tracker, clock, shadows }: { id: number; kind: VehicleState['kind']; tracker: PoseTracker; clock: SimClock; shadows: boolean }) {
  const ref = useRef<Group>(null);
  const left = useRef<Mesh>(null);
  const right = useRef<Mesh>(null);
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
    if (left.current && right.current) {
      const phase = Math.floor(now / 220) % 2 === 0; // alternating light bar (cosmetic, wall clock)
      left.current.material = phase ? siren.red.on : siren.red.off;
      right.current.material = phase ? siren.blue.off : siren.blue.on;
    }
  });
  return (
    <group ref={ref} visible={false}>
      {kind === 'ambulance' ? (
        <>
          <mesh geometry={geo.ambBody} material={ambulanceMat} castShadow={shadows} />
          <mesh geometry={geo.ambDetails} material={mat.carDetails} />
          <group position={[0, 1.22, -0.15]}>
            <mesh ref={left} geometry={geo.sirenLeft} material={siren.red.on} />
            <mesh ref={right} geometry={geo.sirenRight} material={siren.blue.off} />
          </group>
        </>
      ) : isSupercar(id) ? (
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
