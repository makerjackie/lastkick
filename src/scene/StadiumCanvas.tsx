import {Canvas, useFrame, useThree} from '@react-three/fiber';
import {Suspense, useEffect, useMemo, useRef} from 'react';
import * as THREE from 'three';
import {frameRuntime} from '../experience/runtime';
import type {Variant} from '../experience/store';
import {CameraRig} from './CameraRig';
import {CrowdVariants} from './CrowdVariants';
import {ShotDirector} from './ShotDirector';
import {StadiumEnvironment} from './StadiumEnvironment';
import {useReducedMotionRef} from './useReducedMotion';

declare global {
  interface Window {
    __LAST_KICK_METRICS__?: {
      calls: number;
      triangles: number;
      points: number;
      frameP95: number;
      samples: number;
      viewport: string;
    };
  }
}

function PerformanceProbe() {
  const {gl, scene, size} = useThree();
  const frames = useRef<number[]>([]);
  const publishAge = useRef(0);

  useFrame((_, delta) => {
    const sample = Math.min(100, delta * 1000);
    frames.current.push(sample);
    if (frames.current.length > 240) frames.current.shift();
    publishAge.current += delta;

    if (publishAge.current > 0.5 && frames.current.length > 5) {
      const sorted = [...frames.current].sort((a, b) => a - b);
      const p95 = sorted[Math.floor((sorted.length - 1) * 0.95)] ?? sample;
      let calls = 0;
      let triangles = 0;
      let points = 0;
      scene.traverse((object) => {
        if (!object.visible) return;
        const drawable = object as THREE.Mesh | THREE.Points;
        const geometry = drawable.geometry as THREE.BufferGeometry | undefined;
        if (!geometry || (!('isMesh' in drawable) && !('isPoints' in drawable))) return;
        const materialCount = Array.isArray(drawable.material) ? drawable.material.length : 1;
        calls += materialCount;
        const available = geometry.index?.count ?? geometry.getAttribute('position')?.count ?? 0;
        const drawCount = Number.isFinite(geometry.drawRange.count)
          ? Math.min(available, geometry.drawRange.count)
          : available;
        const instances =
          (('isInstancedMesh' in drawable && drawable.isInstancedMesh
            ? drawable.count
            : geometry instanceof THREE.InstancedBufferGeometry
              ? geometry.instanceCount
              : 1) as number | undefined) ?? 1;
        if ('isPoints' in drawable && drawable.isPoints) points += drawCount * instances;
        else triangles += Math.floor(drawCount / 3) * instances;
      });
      window.__LAST_KICK_METRICS__ = {
        calls,
        triangles,
        points,
        frameP95: Number(p95.toFixed(2)),
        samples: sorted.length,
        viewport: `${size.width}x${size.height}@${gl.getPixelRatio().toFixed(2)}`
      };
      publishAge.current = 0;
    }
  });

  useEffect(
    () => () => {
      delete window.__LAST_KICK_METRICS__;
    },
    []
  );

  return null;
}

const FOCUS_VERTEX = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FOCUS_FRAGMENT = /* glsl */ `
  uniform float uFocus;
  uniform float uShutter;
  varying vec2 vUv;

  void main() {
    vec2 centered = (vUv - 0.5) * vec2(1.0, 0.84);
    float radius = length(centered);
    float edge = smoothstep(0.2, 0.64, radius);
    float softEdge = smoothstep(0.05, 0.7, radius);
    float alpha = edge * uFocus + uShutter * (0.16 + softEdge * 0.58);
    vec3 ink = mix(vec3(0.004, 0.014, 0.019), vec3(0.0), uShutter);
    gl_FragColor = vec4(ink, min(0.92, alpha));
  }
`;

/** A one-draw-call, camera-facing focus mask: no post-processing dependency. */
function CinematicFocus() {
  const mesh = useRef<THREE.Mesh>(null);
  const {camera, size} = useThree();
  const reducedMotion = useReducedMotionRef();
  const forward = useMemo(() => new THREE.Vector3(), []);
  const rendered = useMemo(() => {
    const uniforms = {
      uFocus: new THREE.Uniform(0.04),
      uShutter: new THREE.Uniform(0)
    };
    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: FOCUS_VERTEX,
      fragmentShader: FOCUS_FRAGMENT,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false
    });
    return {uniforms, material};
  }, []);

  useFrame((_, delta) => {
    if (!mesh.current) return;

    const charging = frameRuntime.phase === 'charging';
    const contact = frameRuntime.phase === 'contact';
    const focus = charging
      ? THREE.MathUtils.smoothstep(frameRuntime.charge, 0.18, 1)
      : contact
        ? 1
        : 0;
    const focusTarget = reducedMotion.current
      ? 0.035 + focus * 0.24
      : 0.04 + focus * 0.55;
    const shutterTarget =
      frameRuntime.blackout * (reducedMotion.current ? 0.25 : 0.58);
    rendered.uniforms.uFocus.value = THREE.MathUtils.damp(
      rendered.uniforms.uFocus.value,
      focusTarget,
      charging ? 7.5 : 15,
      delta
    );
    rendered.uniforms.uShutter.value = THREE.MathUtils.damp(
      rendered.uniforms.uShutter.value,
      shutterTarget,
      contact ? 28 : 18,
      delta
    );

    const perspective = camera as THREE.PerspectiveCamera;
    const distance = Math.max(0.07, perspective.near + 0.025);
    camera.getWorldDirection(forward);
    mesh.current.position.copy(camera.position).addScaledVector(forward, distance);
    mesh.current.quaternion.copy(camera.quaternion);
    const height = 2 * Math.tan(THREE.MathUtils.degToRad(perspective.fov * 0.5)) * distance;
    mesh.current.scale.set(height * (size.width / Math.max(1, size.height)), height, 1);
  });

  return (
    <mesh ref={mesh} renderOrder={999} frustumCulled={false} material={rendered.material}>
      <planeGeometry args={[1, 1]} />
    </mesh>
  );
}

function CinematicLighting() {
  const ambient = useRef<THREE.AmbientLight>(null);
  const key = useRef<THREE.DirectionalLight>(null);
  const rim = useRef<THREE.DirectionalLight>(null);
  const focusKey = useRef<THREE.DirectionalLight>(null);
  const {gl, scene} = useThree();
  const reducedMotion = useReducedMotionRef();

  useFrame((_, delta) => {
    const charging = frameRuntime.phase === 'charging';
    const contact = frameRuntime.phase === 'contact';
    const focus = charging
      ? THREE.MathUtils.smoothstep(frameRuntime.charge, 0.18, 1)
      : contact
        ? 1
        : 0;
    const damp = (current: number, target: number, speed = 7.5) =>
      THREE.MathUtils.damp(current, target, speed, delta);

    if (ambient.current) ambient.current.intensity = damp(ambient.current.intensity, 0.42 - focus * 0.24);
    if (key.current) key.current.intensity = damp(key.current.intensity, 2.4 + focus * 0.6);
    if (rim.current) rim.current.intensity = damp(rim.current.intensity, 1.1 + focus * 0.72);
    if (focusKey.current) {
      focusKey.current.intensity = damp(focusKey.current.intensity, focus * 0.68, 9);
    }

    const exposureTarget = 0.92 - focus * 0.17 - frameRuntime.blackout * 0.08;
    gl.toneMappingExposure = damp(gl.toneMappingExposure, exposureTarget, contact ? 20 : 6.5);
    if (scene.fog instanceof THREE.FogExp2) {
      const fogFocus = reducedMotion.current ? focus * 0.45 : focus;
      scene.fog.density = damp(scene.fog.density, 0.027 + fogFocus * 0.007, 5.5);
    }
  });

  return (
    <>
      <ambientLight ref={ambient} color="#89a6aa" intensity={0.42} />
      <directionalLight ref={key} color="#f7f0d5" intensity={2.4} position={[2, 9, 7]} />
      <directionalLight ref={rim} color="#46d7c7" intensity={1.1} position={[-9, 4, -8]} />
      <directionalLight
        ref={focusKey}
        color="#ff513d"
        intensity={0}
        position={[0, 5, 8]}
      />
    </>
  );
}

export function StadiumCanvas({variant}: {variant: Variant}) {
  const captureMode =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('capture') === '1';

  return (
    <Canvas
      className="stadium-canvas"
      camera={{position: [0, 1.18, 11.5], fov: 45, near: 0.06, far: 95}}
      dpr={captureMode ? [2, 3] : [0.75, 1.4]}
      flat={false}
      gl={{
        antialias: true,
        alpha: false,
        depth: true,
        preserveDrawingBuffer: true,
        powerPreference: 'high-performance',
        stencil: false,
        toneMapping: THREE.ACESFilmicToneMapping
      }}
      onCreated={({gl, scene}) => {
        gl.outputColorSpace = THREE.SRGBColorSpace;
        gl.toneMappingExposure = 0.92;
        gl.setClearColor('#03090d', 1);
        scene.fog = new THREE.FogExp2('#071219', 0.027);
      }}
    >
      <Suspense fallback={null}>
        <CinematicLighting />
        <ShotDirector />
        <CameraRig variant={variant} />
        <StadiumEnvironment variant={variant} />
        <CrowdVariants variant={variant} />
        <CinematicFocus />
        <PerformanceProbe />
      </Suspense>
    </Canvas>
  );
}
