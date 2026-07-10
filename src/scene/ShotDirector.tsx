import {useFrame} from '@react-three/fiber';
import {useRef} from 'react';
import * as THREE from 'three';
import {
  BALL_START,
  frameRuntime,
  resetFrameRuntime,
  sampleShot,
  targetFromAim
} from '../experience/runtime';
import {useExperienceStore, type Phase} from '../experience/store';

const CONTACT_SECONDS = 0.096;
const HITSTOP_SECONDS = 0.064;

const smoothstep = (edge0: number, edge1: number, value: number) => {
  const x = THREE.MathUtils.clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return x * x * (3 - 2 * x);
};

export function ShotDirector() {
  const previousPhase = useRef<Phase>('ready');
  const lastAttempt = useRef(-1);
  const sampledBall = useRef(new THREE.Vector3());
  const rebound = useRef(new THREE.Vector3());

  useFrame(() => {
    const state = useExperienceStore.getState();
    const now = performance.now();
    const age = (now - state.phaseStartedAt) / 1000;
    const phaseChanged = previousPhase.current !== state.phase;

    if (lastAttempt.current !== state.attempt) {
      resetFrameRuntime();
      lastAttempt.current = state.attempt;
    }

    frameRuntime.phase = state.phase;
    frameRuntime.charge = state.charge;
    frameRuntime.aim = state.aim;
    frameRuntime.impactKind = state.impactKind;
    frameRuntime.shotStyle = state.shotStyle;
    frameRuntime.previousAim = state.previousAim;
    frameRuntime.previousShotStyle = state.previousShotStyle;

    if (phaseChanged && state.phase === 'contact') {
      targetFromAim(state.aim, state.attempt === 0, frameRuntime.target);
      frameRuntime.ball.copy(BALL_START);
      frameRuntime.ballSpin = 0;
      frameRuntime.shotProgress = 0;
    }

    if (state.phase === 'ready') {
      frameRuntime.ball.copy(BALL_START);
      frameRuntime.blackout = 0;
      frameRuntime.impactEnergy = 0;
      frameRuntime.shockRadius = -2;
      frameRuntime.burst = 0;
    }

    if (state.phase === 'charging') {
      frameRuntime.ball.copy(BALL_START);
      frameRuntime.ball.y -= state.charge * 0.035;
      frameRuntime.blackout = state.charge * 0.26;
      frameRuntime.burst = 0;
      frameRuntime.impactEnergy = 0;
      targetFromAim(state.aim, state.attempt === 0, frameRuntime.target);
    }

    if (state.phase === 'contact') {
      const squeeze = Math.sin(Math.min(1, age / CONTACT_SECONDS) * Math.PI);
      frameRuntime.ball.copy(BALL_START);
      frameRuntime.ball.y -= squeeze * 0.065;
      frameRuntime.blackout = smoothstep(0, CONTACT_SECONDS * 0.72, age);
      if (age >= CONTACT_SECONDS) state.enterPhase('flight');
    }

    if (state.phase === 'flight') {
      const flightDuration =
        state.shotStyle === 'power'
          ? 1.58 - state.charge * 0.22
          : state.shotStyle === 'curve'
            ? 1.92 - state.charge * 0.18
            : 2.32 - state.charge * 0.12;
      const progress = THREE.MathUtils.clamp(age / flightDuration, 0, 1);
      frameRuntime.shotProgress = progress;
      sampleShot(
        progress,
        state.charge,
        state.aim,
        frameRuntime.target,
        sampledBall.current
      );
      frameRuntime.ball.copy(sampledBall.current);
      frameRuntime.ballSpin += 0.24 + state.charge * 0.34;
      frameRuntime.blackout = Math.max(0, 0.72 - progress * 3.2);
      if (progress >= 1) state.enterPhase('impact');
    }

    if (state.phase === 'impact') {
      frameRuntime.ball.copy(frameRuntime.target);
      frameRuntime.impactEnergy = 1;
      frameRuntime.blackout = Math.max(0, 0.3 - age * 4.6);
      frameRuntime.shockRadius = 0;
      if (age >= HITSTOP_SECONDS) state.enterPhase('aftermath');
    }

    if (state.phase === 'aftermath') {
      frameRuntime.impactAge = age;
      frameRuntime.impactEnergy = Math.exp(-age * 1.35);
      frameRuntime.shockRadius = age * 10.5 - 0.2;
      frameRuntime.burst = smoothstep(0.28, 1.65, age);
      frameRuntime.blackout = 0;

      rebound.current.copy(frameRuntime.target);
      if (state.impactKind === 'post') {
        rebound.current.x -= age * (3.7 + state.charge * 1.4);
        rebound.current.z += age * 2.65;
        rebound.current.y += age * 1.7 - age * age * 2.7;
      } else if (state.impactKind === 'bar') {
        rebound.current.z += age * 2.4;
        rebound.current.y -= age * 2.2 + age * age * 1.5;
        rebound.current.x += state.aim.x * age * 1.8;
      } else if (state.impactKind === 'goal') {
        rebound.current.z -= age * 2.2;
        rebound.current.y -= age * age * 1.2;
        rebound.current.x += state.aim.x * age * 0.4;
      } else {
        rebound.current.z += age * 3.4;
        rebound.current.x -= state.aim.x * age * 1.15;
        rebound.current.y += age * 0.42 - age * age * 1.85;
      }
      frameRuntime.ball.copy(rebound.current);
      frameRuntime.ballSpin += 0.16;
    }

    previousPhase.current = state.phase;
  });

  return null;
}
