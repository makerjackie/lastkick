import * as THREE from 'three';
import type {Aim, ImpactKind, Phase, ShotStyle} from './store';

export const BALL_START = new THREE.Vector3(0, 0.23, 7.8);
export const GOAL_Z = -8.55;
export const GOAL_HALF_WIDTH = 3.55;
export const AIM_TARGET_X_SCALE = 4.16;

export type FrameRuntime = {
  phase: Phase;
  charge: number;
  aim: Aim;
  ball: THREE.Vector3;
  target: THREE.Vector3;
  ballSpin: number;
  shotProgress: number;
  impactAge: number;
  impactEnergy: number;
  shockRadius: number;
  burst: number;
  blackout: number;
  impactKind: ImpactKind;
  shotStyle: ShotStyle;
  previousAim: Aim | null;
  previousShotStyle: ShotStyle | null;
};

export const frameRuntime: FrameRuntime = {
  phase: 'ready',
  charge: 0,
  aim: {x: 0, y: 0.34},
  ball: BALL_START.clone(),
  target: new THREE.Vector3(0, 0.72 + 0.34 * 2.38, GOAL_Z),
  ballSpin: 0,
  shotProgress: 0,
  impactAge: 0,
  impactEnergy: 0,
  shockRadius: -2,
  burst: 0,
  blackout: 0,
  impactKind: 'post',
  shotStyle: 'power',
  previousAim: null,
  previousShotStyle: null
};

export function targetFromAim(
  aim: Aim,
  _firstAttempt: boolean,
  out = new THREE.Vector3()
) {
  // The playable edge (|aim.x| ~= 0.82) now resolves just inside a 3.55 m
  // post, while a wider gesture visibly hits the frame or travels outside it.
  return out.set(aim.x * AIM_TARGET_X_SCALE, 0.72 + aim.y * 2.38, GOAL_Z);
}

export function resetFrameRuntime() {
  frameRuntime.phase = 'ready';
  frameRuntime.charge = 0;
  frameRuntime.aim = {x: 0, y: 0.34};
  frameRuntime.ball.copy(BALL_START);
  frameRuntime.target.set(0, 0.72 + 0.34 * 2.38, GOAL_Z);
  frameRuntime.ballSpin = 0;
  frameRuntime.shotProgress = 0;
  frameRuntime.impactAge = 0;
  frameRuntime.impactEnergy = 0;
  frameRuntime.shockRadius = -2;
  frameRuntime.burst = 0;
  frameRuntime.blackout = 0;
  frameRuntime.impactKind = 'post';
  frameRuntime.shotStyle = 'power';
  frameRuntime.previousAim = null;
  frameRuntime.previousShotStyle = null;
}

export function physicalProgress(realProgress: number) {
  const t = THREE.MathUtils.clamp(realProgress, 0, 1);
  if (t < 0.18) return (t / 0.18) * 0.42;
  if (t < 0.78) return 0.42 + ((t - 0.18) / 0.6) * 0.38;
  return 0.8 + ((t - 0.78) / 0.22) * 0.2;
}

export function sampleShot(
  progress: number,
  charge: number,
  aim: Aim,
  target: THREE.Vector3,
  out = new THREE.Vector3()
) {
  const p = physicalProgress(progress);
  const ball = out.copy(BALL_START).lerp(target, p);
  const lobe = Math.sin(Math.PI * p);

  if (frameRuntime.shotStyle === 'power') {
    // Direct and low: only a hint of lateral movement keeps it from feeling
    // mechanically linear while preserving the visual impression of force.
    ball.y += lobe * (0.54 + charge * 0.52);
    ball.x -= aim.x * lobe * 0.08;
  } else if (frameRuntime.shotStyle === 'curve') {
    // Start outside the chosen corner, then hook hard back toward it. The
    // increasing late weight creates a readable banana/S path instead of a
    // generic sideways offset, while still landing exactly on `target`.
    const curveDirection = Math.abs(aim.x) > 0.06 ? Math.sign(aim.x) : 1;
    const bendStrength = 1.06 + Math.abs(aim.x) * 0.78 + charge * 0.36;
    const lateHookWeight = 0.62 + p * 0.58;
    ball.x -= curveDirection * Math.pow(lobe, 0.92) * bendStrength * lateHookWeight;
    ball.y += lobe * (1.18 + charge * 0.58);
  } else {
    // A broad hang-time lobe makes the chip visibly climb and then fall almost
    // vertically into the central channel.
    ball.y += Math.pow(lobe, 0.72) * (3.18 + charge * 0.82);
    ball.x -= aim.x * lobe * 0.045;
  }

  return ball;
}
