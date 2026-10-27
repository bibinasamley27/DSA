import { Canvas } from '@react-three/fiber';
import { Component, useEffect, useMemo, useState, type ReactNode } from 'react';
import { PoseTracker } from '../lib/interp';
import { SimClock } from '../lib/simClock';
import { crosswalkBusy, makeCrossers } from '../lib/pedestrians';
import { Pedestrians } from './Pedestrians';
import { lampFor } from '../lib/signal';
import type { SimState } from '../net/store';
import { DIRECTIONS } from '../net/protocol';
import { CameraRig, FOV } from './CameraRig';
import { Junction } from './Junction';
import { Lane } from './Lane';
import { Road } from './Road';
import { Signal } from './Signal';
import { Vehicle } from './Vehicle';
import styles from './Scene.module.css';

function usePageVisible() {
  const [visible, setVisible] = useState(() => document.visibilityState !== 'hidden');
  useEffect(() => {
    const on = () => setVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);
  return visible;
}

export function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') ?? c.getContext('webgl'));
  } catch { return false; }
}

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <Unavailable reason="The 3D renderer crashed." /> : this.props.children; }
}

const Unavailable = ({ reason }: { reason: string }) => (
  <div className={styles.fallback} role="alert">
    <strong>3D view unavailable.</strong> {reason} Controls, HUD and metrics still work.
  </div>
);

/** Renders only the accepted snapshot. Motion is interpolation between snapshots, never prediction. */
export function Scene({ sim, quality = 'high', viewKey = 0 }: { sim: SimState; quality?: 'high' | 'low'; viewKey?: number }) {
  const visible = usePageVisible();
  const tracker = useMemo(() => new PoseTracker(), []);
  const clock = useMemo(() => new SimClock(), []);
  const { snapshot, runEpoch, receivedAt, stale } = sim;
  // Both updates are idempotent per snapshot, so running them during render is safe (also under StrictMode).
  const crossers = useMemo(() => (runEpoch >= 0 ? makeCrossers() : []), [runEpoch]); // fresh positions for every run
  const ids = useMemo(() => {
    const now = performance.now();
    tracker.setCrosswalkBusy((arm) => crosswalkBusy(crossers, arm));
    clock.update(snapshot, runEpoch, receivedAt, stale);
    if (!stale) tracker.resume(now);
    if (snapshot) tracker.update(snapshot, runEpoch, receivedAt, clock.value(receivedAt));
    else tracker.clear();
    if (stale) tracker.hold(now); // stop moving the moment the connection is lost
    return tracker.ids();
  }, [tracker, clock, crossers, snapshot, runEpoch, receivedAt, stale]);
  const shadows = quality === 'high';

  const gl = useMemo(webglAvailable, []);
  if (!gl) return <Unavailable reason="WebGL is not available in this browser." />;

  return (
    <Boundary>
      <Canvas
        className={styles.canvas}
        frameloop={visible ? 'always' : 'never'}
        dpr={shadows ? [1, 2] : 1}
        shadows={shadows ? 'percentage' : false}
        camera={{ fov: FOV, near: 1, far: 800 }}
        gl={{ antialias: true, powerPreference: 'default' }}
        aria-label="3D four-way junction"
      >
        <color attach="background" args={['#b9dcf2']} />
        <fog attach="fog" args={['#b9dcf2', 170, 420]} />
        <hemisphereLight args={['#dff0ff', '#5d7a4c', 1.1]} />
        <directionalLight
          position={[45, 70, 30]} intensity={2.4} color="#fff1d8" castShadow={shadows}
          shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004} shadow-normalBias={0.04}
          shadow-camera-left={-60} shadow-camera-right={60} shadow-camera-top={60} shadow-camera-bottom={-60} shadow-camera-far={220}
        />
        <CameraRig resetKey={viewKey} />
        <Road shadows={shadows} />
        <Junction />
        {DIRECTIONS.map((d) => (
          <group key={d}>
            <Lane direction={d} lamp={lampFor(d, snapshot)} />
            <Signal direction={d} lamp={lampFor(d, snapshot)} shadows={shadows} />
          </group>
        ))}
        {ids.map((id) => <Vehicle key={id} id={id} kind={tracker.kindOf(id)} tracker={tracker} clock={clock} shadows={shadows} />)}
        <Pedestrians snapshot={stale ? null : snapshot} clock={clock} crossers={crossers} tracker={tracker} shadows={shadows} />
      </Canvas>
    </Boundary>
  );
}
