import {useFrame, useThree} from '@react-three/fiber';
import {useMemo} from 'react';
import * as THREE from 'three';
import {frameRuntime, sampleShot} from '../experience/runtime';
import {useExperienceStore, type Variant} from '../experience/store';
import {useReducedMotionRef} from './useReducedMotion';

export function CameraRig({variant}: {variant: Variant}) {
  const {camera, size} = useThree();
  const desired = useMemo(() => new THREE.Vector3(), []);
  const look = useMemo(() => new THREE.Vector3(), []);
  const nextBall = useMemo(() => new THREE.Vector3(), []);
  const forward = useMemo(() => new THREE.Vector3(), []);
  const side = useMemo(() => new THREE.Vector3(), []);
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const reducedMotion = useReducedMotionRef();

  useFrame((state, delta) => {
    const store = useExperienceStore.getState();
    const phase = store.phase;
    const portrait = size.height > size.width;
    let fov = portrait ? 52 : 45;
    let stiffness = 1 - Math.pow(0.00045, delta);

    if (phase === 'ready') {
      desired.set(variant === 'C' ? -0.55 : 0, portrait ? 1.35 : 1.18, portrait ? 12.2 : 11.5);
      look.set(0, portrait ? 1.9 : 1.45, -4.2);
    } else if (phase === 'charging') {
      const q = store.charge;
      const focus = THREE.MathUtils.smoothstep(q, 0.2, 1);
      const motionScale = reducedMotion.current ? 0 : 1;
      const time = state.clock.elapsedTime;
      const pulseRate = THREE.MathUtils.lerp(1.18, 1.82, q);
      const heartbeat = Math.pow(Math.max(0, Math.sin(time * Math.PI * 2 * pulseRate)), 9);
      const tremor = Math.pow(THREE.MathUtils.smoothstep(q, 0.64, 1), 2) * motionScale;
      const breath = Math.sin(time * 1.52) * (0.008 + q * 0.012) * motionScale;

      desired.set(
        -store.aim.x * 0.18,
        1.18 + breath + Math.sin(time * 18.7) * tremor * 0.006,
        (portrait ? 11.9 : 11.2) - q * (reducedMotion.current ? 0.34 : 1.18)
      );
      desired.x += Math.sin(time * 23.3) * tremor * 0.009;
      desired.z -= heartbeat * focus * 0.036 * motionScale;
      look.set(store.aim.x * 0.4, 1.25 + store.aim.y * 0.42, -5.5);
      look.x += Math.sin(time * 20.1) * tremor * 0.018;
      look.y += Math.sin(time * 16.9) * tremor * 0.009;
      fov =
        (portrait ? 50 : 43) -
        q * (reducedMotion.current ? 1.8 : 5.8) -
        heartbeat * focus * 0.16 * motionScale;
    } else if (phase === 'contact') {
      desired.set(
        -store.aim.x * 0.18,
        1.22,
        reducedMotion.current ? (portrait ? 11.85 : 11.2) : portrait ? 12.05 : 11.35
      );
      look.copy(frameRuntime.target);
      fov = reducedMotion.current ? (portrait ? 52 : 45) : portrait ? 58 : 53;
      stiffness = reducedMotion.current ? 1 - Math.pow(0.00045, delta) : 1;
    } else if (phase === 'flight') {
      const p = frameRuntime.shotProgress;
      sampleShot(
        Math.min(1, p + 0.012),
        frameRuntime.charge,
        frameRuntime.aim,
        frameRuntime.target,
        nextBall
      );
      forward.copy(nextBall).sub(frameRuntime.ball).normalize();
      side.crossVectors(forward, up).normalize();

      if (p < 0.17) {
        desired.set(-store.aim.x * 0.18, 1.28, portrait ? 11.85 : 11.2);
        look.copy(frameRuntime.ball).addScaledVector(forward, 4.5);
        fov = portrait ? 56 : 52;
      } else if (p < 0.79) {
        desired
          .copy(frameRuntime.ball)
          .addScaledVector(forward, -2.45)
          .addScaledVector(side, variant === 'B' ? -0.48 : 0.42)
          .addScaledVector(up, 0.32);
        look.copy(frameRuntime.ball).addScaledVector(forward, 3.8);
        fov = portrait ? 41 : 34;
      } else {
        const sideSign = frameRuntime.target.x < 0 ? -1 : 1;
        desired.set(
          THREE.MathUtils.clamp(frameRuntime.target.x - sideSign * 2.15, -3.1, 3.1),
          THREE.MathUtils.clamp(frameRuntime.target.y + 1.05, 2.0, 3.3),
          -5.9
        );
        look.copy(frameRuntime.target);
        fov = portrait ? 45 : 38;
        stiffness = 1 - Math.pow(0.00002, delta);
      }
    } else {
      const age = frameRuntime.impactAge;
      const reveal = THREE.MathUtils.smoothstep(age, 0.05, 1.45);
      desired.set(
        variant === 'B' ? 3.4 * reveal : -2.2 * reveal,
        2.6 + reveal * (portrait ? 3.9 : 4.7),
        -2.9 + reveal * (portrait ? 10.8 : 12.8)
      );
      look.set(0, 2.2 + reveal * 1.4, -4.8);
      fov = (portrait ? 49 : 42) + reveal * 8;
      stiffness = 1 - Math.pow(0.00008, delta);

      const trauma =
        frameRuntime.impactEnergy * frameRuntime.impactEnergy * (reducedMotion.current ? 0 : 1);
      const time = state.clock.elapsedTime * 24;
      desired.x += Math.sin(time * 1.37) * trauma * 0.08;
      desired.y += Math.sin(time * 1.91) * trauma * 0.045;
      look.x += Math.sin(time * 1.13) * trauma * 0.08;
    }

    camera.position.lerp(desired, stiffness);
    camera.lookAt(look);
    const perspective = camera as THREE.PerspectiveCamera;
    perspective.fov = THREE.MathUtils.lerp(perspective.fov, fov, 1 - Math.pow(0.0002, delta));
    perspective.updateProjectionMatrix();
  });

  return null;
}
