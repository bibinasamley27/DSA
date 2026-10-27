import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { BoxGeometry, type Group } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { crosserPose, makeWalkers, stepCrossers, walkerPose, type Crosser, type PedPose } from '../lib/pedestrians';
import type { PoseTracker } from '../lib/interp';
import type { SimClock } from '../lib/simClock';
import type { StateSnapshot } from '../types/simulation';
import { mat, tinted } from './materials';

const SHIRTS = ['#e63946', '#2a9d8f', '#f4a261', '#457b9d', '#9b5de5', '#f1faee', '#ffb703'];
const PANTS = ['#264653', '#3d405b', '#5c4033', '#1d3557'];
const SKIN = ['#f1c27d', '#c68642', '#8d5524', '#ffdbac'];

// One merged, vertex-coloured mesh per person variant (faces -Z).
const variants = SHIRTS.map((shirt, i) => mergeGeometries([
  tinted(new BoxGeometry(0.24, 0.4, 0.16).translate(0, 0.42, 0), PANTS[i % PANTS.length]!),
  tinted(new BoxGeometry(0.34, 0.38, 0.2).translate(0, 0.81, 0), shirt),
  tinted(new BoxGeometry(0.2, 0.2, 0.2).translate(0, 1.11, 0), SKIN[i % SKIN.length]!),
  tinted(new BoxGeometry(0.22, 0.07, 0.22).translate(0, 1.23, 0), '#2b2118'),
])!);

const KERB_Y = 0.225; // sidewalk top
const ROAD_Y = 0.02;

/** Decorative people: walkers on the sidewalks and crossers that use the crosswalks only when the server's state makes it safe. */
export function Pedestrians({ snapshot, clock, crossers, tracker, shadows }: { snapshot: StateSnapshot | null; clock: SimClock; crossers: Crosser[]; tracker: PoseTracker; shadows: boolean }) {
  const walkers = useMemo(makeWalkers, []);
  const snap = useRef(snapshot);
  useEffect(() => { snap.current = snapshot; }, [snapshot]);
  const refs = useRef<(Group | null)[]>([]);

  useFrame(() => {
    const now = performance.now();
    const t = clock.value(now);
    stepCrossers(crossers, snap.current, t, (arm) => tracker.turningInto(arm, now, t));
    const place = (g: Group | null | undefined, p: PedPose, onRoad: boolean, seed: number) => {
      if (!g) return;
      const bob = p.walking ? Math.abs(Math.sin((t * 3 + seed) * Math.PI)) * 0.06 : 0;
      g.position.set(p.x, (onRoad ? ROAD_Y : KERB_Y) + bob, p.z);
      g.rotation.y = p.heading;
    };
    walkers.forEach((w, i) => place(refs.current[i], walkerPose(w, t), false, i * 0.3));
    crossers.forEach((c, i) => {
      const p = crosserPose(c, t);
      place(refs.current[walkers.length + i], p, p.onRoad, i * 0.5);
    });
  });

  const count = walkers.length + crossers.length;
  return (
    <group>
      {Array.from({ length: count }, (_, i) => (
        <group key={i} ref={(g) => { refs.current[i] = g; }}>
          <mesh geometry={variants[i % variants.length]} material={mat.deco} castShadow={shadows} />
        </group>
      ))}
    </group>
  );
}
