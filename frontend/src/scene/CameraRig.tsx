import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo } from 'react';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const FOV = 40;
// Default: diagonal view from the south-east corner, ~42° elevation.
const DIR = { x: 0.52, y: 0.67, z: 0.53 };
const BASE = 72;       // distance on a wide viewport
const NEED_H = 105;    // distance*aspect keeping the junction and near arms in frame on narrow viewports
const TARGET = [0, 0, 4] as const;

/**
 * Restrained camera: drag to orbit, wheel/pinch to zoom, within limits that keep the junction in view
 * (no panning, never below the ground). `resetKey` changes snap back to the default view.
 */
export function CameraRig({ resetKey }: { resetKey: number }) {
  const camera = useThree((s) => s.camera);
  const dom = useThree((s) => s.gl.domElement);
  const { width, height } = useThree((s) => s.size);
  const controls = useMemo(() => {
    const c = new OrbitControls(camera, dom);
    Object.assign(c, { enablePan: false, enableDamping: true, dampingFactor: 0.08, minDistance: 30, maxDistance: 210, minPolarAngle: 0.25, maxPolarAngle: 1.2 });
    c.target.set(...TARGET);
    return c;
  }, [camera, dom]);
  useEffect(() => () => controls.dispose(), [controls]);

  useLayoutEffect(() => {
    const d = Math.max(BASE, NEED_H / (width / height));
    camera.position.set(d * DIR.x, d * DIR.y, d * DIR.z);
    camera.lookAt(...TARGET);
    camera.updateProjectionMatrix();
    controls.update();
  }, [camera, controls, width, height, resetKey]);

  useFrame(() => controls.update());
  return null;
}
export { FOV };
