import {useFrame} from '@react-three/fiber';
import {useMemo} from 'react';
import * as THREE from 'three';
import {frameRuntime} from '../experience/runtime';
import type {Variant} from '../experience/store';

type CrowdUniforms = {
  uTime: THREE.Uniform<number>;
  uCharge: THREE.Uniform<number>;
  uImpactAge: THREE.Uniform<number>;
  uImpactEnergy: THREE.Uniform<number>;
  uShockRadius: THREE.Uniform<number>;
  uBurst: THREE.Uniform<number>;
  uImpactPosition: THREE.Uniform<THREE.Vector3>;
  uInk: THREE.Uniform<THREE.Color>;
  uIvory: THREE.Uniform<THREE.Color>;
  uCoral: THREE.Uniform<THREE.Color>;
  uCyan: THREE.Uniform<THREE.Color>;
  uGold: THREE.Uniform<THREE.Color>;
};

const FOG_FRAGMENT = /* glsl */ `
  float fogAmount = smoothstep(15.0, 39.0, vDepth);
  color = mix(color, uInk, fogAmount * 0.84);
  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
`;

const FOLDED_CARD_VERTEX = /* glsl */ `
  attribute vec3 aSeat;
  attribute vec2 aFacing;
  attribute vec4 aMeta;
  attribute float aFacet;

  uniform float uTime;
  uniform float uCharge;
  uniform float uImpactAge;
  uniform float uImpactEnergy;
  uniform float uShockRadius;
  uniform float uBurst;
  uniform vec3 uImpactPosition;
  uniform vec3 uIvory;
  uniform vec3 uCoral;
  uniform vec3 uCyan;
  uniform vec3 uGold;

  varying vec3 vColor;
  varying float vFacet;
  varying float vPulse;
  varying float vDepth;

  const float PI = 3.141592653589793;

  void main() {
    vec3 p = position;
    float top = smoothstep(0.03, 0.72, p.y);
    float distanceToHit = distance(aSeat.xz, uImpactPosition.xz);
    float ring = exp(-pow((distanceToHit - uShockRadius) / 1.18, 2.0));
    float passed = smoothstep(distanceToHit - 0.5, distanceToHit + 1.0, uShockRadius);
    float rankBeat = sin(aMeta.z * 25.0 - uTime * 2.25 + aMeta.x * 6.2831);

    // Charging turns the whole amphitheatre into one inward-folding mechanism.
    p.z += top * uCharge * (0.12 + 0.055 * rankBeat);
    p.y *= 1.0 - uCharge * 0.085;

    float flipAngle = passed * PI + ring * 0.34;
    float cs = cos(flipAngle);
    float sn = sin(flipAngle);
    p.xz = mat2(cs, -sn, sn, cs) * p.xz;
    p.y += ring * (0.62 + aMeta.y * 0.38);
    p.z += top * ring * 0.24;

    // A tiny residual chatter after impact keeps the cards feeling mechanical.
    float chatter = uBurst * exp(-uImpactAge * 1.05) * sin(uTime * 18.0 + aMeta.x * 21.0);
    p.x += chatter * 0.018 * top;

    vec2 tangent = vec2(-aFacing.y, aFacing.x);
    vec3 localWorld = vec3(
      aSeat.x + tangent.x * p.x + aFacing.x * p.z,
      aSeat.y + p.y,
      aSeat.z + tangent.y * p.x + aFacing.y * p.z
    );

    float team = step(0.52, aMeta.y);
    vec3 teamColor = mix(uCyan, uCoral, team);
    float ivoryCard = step(0.78, aMeta.x);
    vec3 restingColor = mix(teamColor, uIvory, ivoryCard * 0.72);
    vec3 flippedColor = mix(uCoral, uGold, step(0.8, aMeta.y));
    vColor = mix(restingColor, flippedColor, passed * (0.76 + 0.24 * aMeta.x));
    vFacet = aFacet;
    vPulse = max(ring, uImpactEnergy * 0.72);

    vec4 mvPosition = modelViewMatrix * vec4(localWorld, 1.0);
    vDepth = -mvPosition.z;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const FOLDED_CARD_FRAGMENT = /* glsl */ `
  uniform vec3 uInk;
  varying vec3 vColor;
  varying float vFacet;
  varying float vPulse;
  varying float vDepth;

  void main() {
    float foldLight = mix(0.56, 1.17, vFacet);
    vec3 color = vColor * foldLight;
    color += vec3(0.34, 0.19, 0.08) * vPulse;
    ${FOG_FRAGMENT}
  }
`;

const SIGNAL_COLUMN_VERTEX = /* glsl */ `
  attribute vec3 aSeat;
  attribute vec2 aFacing;
  attribute vec4 aMeta;

  uniform float uTime;
  uniform float uCharge;
  uniform float uImpactAge;
  uniform float uImpactEnergy;
  uniform float uShockRadius;
  uniform float uBurst;
  uniform vec3 uImpactPosition;
  uniform vec3 uIvory;
  uniform vec3 uCoral;
  uniform vec3 uCyan;
  uniform vec3 uGold;

  varying vec3 vColor;
  varying float vSignal;
  varying float vShade;
  varying float vDepth;

  void main() {
    float distanceToHit = distance(aSeat.xz, uImpactPosition.xz);
    float ring = exp(-pow((distanceToHit - uShockRadius) / 1.34, 2.0));
    float choir = 0.5 + 0.5 * sin(aMeta.w * 18.0 + aMeta.x * 6.2831 - uTime * 2.4);
    float afterTone = sin(uTime * (7.0 + aMeta.x * 2.8) - distanceToHit * 0.72);
    float tension = pow(uCharge, 1.35);
    float height = 0.24 + aMeta.z * 0.72;
    height += tension * (0.38 + choir * 0.92);
    height += ring * (2.2 + aMeta.z * 2.35);
    height += uBurst * max(0.0, afterTone) * 0.44 * exp(-uImpactAge * 0.5);

    vec3 p = position;
    float top = p.y + 0.5;
    p.y = top * height;
    p.z += top * tension * (0.055 + choir * 0.04);
    p.x += top * ring * sin(aMeta.x * 17.0 + uTime * 5.0) * 0.035;

    vec2 tangent = vec2(-aFacing.y, aFacing.x);
    vec3 localWorld = vec3(
      aSeat.x + tangent.x * p.x + aFacing.x * p.z,
      aSeat.y + p.y,
      aSeat.z + tangent.y * p.x + aFacing.y * p.z
    );

    vec3 signalColor = mix(uCyan, uCoral, step(0.49, aMeta.y));
    signalColor = mix(signalColor, uGold, step(0.86, aMeta.x) * 0.58);
    vSignal = clamp(ring * 1.15 + tension * choir * 0.46 + uImpactEnergy, 0.0, 1.7);
    vColor = mix(signalColor, uIvory, clamp(vSignal * 0.62, 0.0, 0.78));
    vShade = 0.66 + max(0.0, dot(normalize(normal), normalize(vec3(-0.5, 0.8, 0.35)))) * 0.42;

    vec4 mvPosition = modelViewMatrix * vec4(localWorld, 1.0);
    vDepth = -mvPosition.z;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const SIGNAL_COLUMN_FRAGMENT = /* glsl */ `
  uniform vec3 uInk;
  varying vec3 vColor;
  varying float vSignal;
  varying float vShade;
  varying float vDepth;

  void main() {
    vec3 color = vColor * vShade;
    color += vColor * vSignal * 0.27;
    ${FOG_FRAGMENT}
  }
`;

const PAPER_BIRD_VERTEX = /* glsl */ `
  attribute vec3 aSeat;
  attribute vec2 aFacing;
  attribute vec4 aMeta;
  attribute float aFacet;

  uniform float uTime;
  uniform float uCharge;
  uniform float uImpactAge;
  uniform float uImpactEnergy;
  uniform float uShockRadius;
  uniform float uBurst;
  uniform vec3 uImpactPosition;
  uniform vec3 uIvory;
  uniform vec3 uCoral;
  uniform vec3 uCyan;
  uniform vec3 uGold;

  varying vec3 vColor;
  varying float vFacet;
  varying float vFlight;
  varying float vDepth;

  void main() {
    float distanceToHit = distance(aSeat.xz, uImpactPosition.xz);
    float ring = exp(-pow((distanceToHit - uShockRadius) / 1.16, 2.0));
    float localAge = max(0.0, uImpactAge - distanceToHit / 10.5 - aMeta.x * 0.13);
    float flight = smoothstep(0.02, 0.46, localAge) * uBurst;

    vec3 bird = position;
    vec3 terrace = vec3(position.x * 0.72, abs(position.x) * 0.22, position.z * 0.42);
    terrace.y += abs(position.x) * uCharge * 0.34;
    terrace.z += uCharge * 0.035 * sign(position.x);

    float wingBeat = sin(localAge * (15.0 + aMeta.y * 5.0) + aMeta.x * 6.2831);
    bird.y += abs(bird.x) * wingBeat * 0.52 * flight;
    bird.z += abs(bird.x) * (1.0 - wingBeat) * 0.08 * flight;
    vec3 p = mix(terrace, bird, flight);
    p.y += ring * 0.28;

    vec2 away = aSeat.xz - uImpactPosition.xz;
    away /= max(length(away), 0.001);
    vec2 orbit = vec2(-away.y, away.x);
    float travel = localAge * localAge * (1.5 + aMeta.z * 2.4);
    vec2 flightOffset = away * travel;
    flightOffset += orbit * sin(localAge * 2.8 + aMeta.x * 8.0) * localAge * (0.45 + aMeta.y);

    vec2 tangent = vec2(-aFacing.y, aFacing.x);
    vec3 localWorld = vec3(
      aSeat.x + tangent.x * p.x + aFacing.x * p.z + flightOffset.x,
      aSeat.y + p.y + flight * (localAge * (2.1 + aMeta.z * 2.4) + aMeta.x * 0.8),
      aSeat.z + tangent.y * p.x + aFacing.y * p.z + flightOffset.y
    );

    vec3 wingColor = mix(uIvory, uCyan, step(0.58, aMeta.y) * 0.72);
    wingColor = mix(wingColor, uCoral, step(0.82, aMeta.x) * (0.42 + flight * 0.48));
    wingColor = mix(wingColor, uGold, ring * 0.34);
    vColor = wingColor;
    vFacet = aFacet;
    vFlight = max(flight, uImpactEnergy * 0.65);

    vec4 mvPosition = modelViewMatrix * vec4(localWorld, 1.0);
    vDepth = -mvPosition.z;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const PAPER_BIRD_FRAGMENT = /* glsl */ `
  uniform vec3 uInk;
  varying vec3 vColor;
  varying float vFacet;
  varying float vFlight;
  varying float vDepth;

  void main() {
    float paperLight = mix(0.57, 1.22, vFacet);
    vec3 color = vColor * paperLight;
    color += vec3(0.22, 0.15, 0.07) * vFlight;
    ${FOG_FRAGMENT}
  }
`;

function deterministic(index: number, salt: number) {
  const value = Math.sin((index + 1) * (12.9898 + salt * 31.733)) * 43758.5453;
  return value - Math.floor(value);
}

function makeUniforms(): CrowdUniforms {
  return {
    uTime: new THREE.Uniform(0),
    uCharge: new THREE.Uniform(0),
    uImpactAge: new THREE.Uniform(0),
    uImpactEnergy: new THREE.Uniform(0),
    uShockRadius: new THREE.Uniform(-2),
    uBurst: new THREE.Uniform(0),
    uImpactPosition: new THREE.Uniform(new THREE.Vector3(0, 1.3, -8.55)),
    uInk: new THREE.Uniform(new THREE.Color('#061118')),
    uIvory: new THREE.Uniform(new THREE.Color('#f2edd8')),
    uCoral: new THREE.Uniform(new THREE.Color('#ff513d')),
    uCyan: new THREE.Uniform(new THREE.Color('#46d7c7')),
    uGold: new THREE.Uniform(new THREE.Color('#d7a84f'))
  };
}

function useRuntimeUniforms(uniforms: CrowdUniforms) {
  useFrame((state) => {
    // The selected crowd performs one read of the shared frame object per frame.
    const frame = frameRuntime;
    uniforms.uTime.value = state.clock.elapsedTime;
    uniforms.uCharge.value = frame.charge;
    uniforms.uImpactAge.value = frame.impactAge;
    uniforms.uImpactEnergy.value = frame.impactEnergy;
    uniforms.uShockRadius.value = frame.shockRadius;
    uniforms.uBurst.value = frame.burst;
    uniforms.uImpactPosition.value.copy(frame.target);
  });
}

function addInstancedAttribute(
  geometry: THREE.InstancedBufferGeometry,
  name: string,
  values: number[],
  itemSize: number
) {
  const attribute = new THREE.InstancedBufferAttribute(new Float32Array(values), itemSize);
  attribute.setUsage(THREE.StaticDrawUsage);
  geometry.setAttribute(name, attribute);
}

function createFoldedCardGeometry() {
  const positions = [
    // Left fold.
    -0.19, 0, 0, 0, 0, 0.045, -0.16, 0.55, 0,
    0, 0, 0.045, 0, 0.6, 0.075, -0.16, 0.55, 0,
    // Right fold.
    0, 0, 0.045, 0.19, 0, 0, 0, 0.6, 0.075,
    0.19, 0, 0, 0.16, 0.55, 0, 0, 0.6, 0.075,
    // Diamond head.
    0, 0.59, 0.055, -0.09, 0.68, 0.015, 0, 0.79, 0.045,
    0, 0.59, 0.055, 0, 0.79, 0.045, 0.09, 0.68, 0.015
  ];
  const facets = [
    0.58, 0.58, 0.58, 0.72, 0.72, 0.72,
    1, 1, 1, 0.9, 0.9, 0.9,
    0.68, 0.68, 0.68, 1, 1, 1
  ];
  const seats: number[] = [];
  const facing: number[] = [];
  const meta: number[] = [];
  let index = 0;

  const rows = 44;
  const columns = 288;
  for (let row = 0; row < rows; row += 1) {
    const rowT = row / (rows - 1);
    for (let column = 0; column < columns; column += 1) {
      const theta = (column / columns) * Math.PI * 2;
      // The opening is a camera tunnel, not a missing accidental wedge.
      if (Math.sin(theta) > 0.72 && Math.abs(Math.cos(theta)) < 0.29) continue;

      const jitter = (deterministic(index, 1) - 0.5) * 0.045;
      const radiusX = 8.25 + row * 0.225;
      const radiusZ = 13.15 + row * 0.225;
      const x = Math.cos(theta) * radiusX;
      const z = -1.45 + Math.sin(theta) * radiusZ;
      const y = 1.22 + row * 0.137 + jitter;
      const length = Math.hypot(x, z + 1.45);

      seats.push(x, y, z);
      facing.push(-x / length, (-1.45 - z) / length);
      meta.push(
        deterministic(index, 2),
        deterministic(index, 3),
        rowT,
        column / columns
      );
      index += 1;
    }
  }

  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aFacet', new THREE.Float32BufferAttribute(facets, 1));
  addInstancedAttribute(geometry, 'aSeat', seats, 3);
  addInstancedAttribute(geometry, 'aFacing', facing, 2);
  addInstancedAttribute(geometry, 'aMeta', meta, 4);
  geometry.instanceCount = seats.length / 3;
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 5, -1.5), 30);
  return geometry;
}

function createSignalColumnGeometry() {
  const seats: number[] = [];
  const facing: number[] = [];
  const meta: number[] = [];
  let index = 0;

  const pushColumn = (
    x: number,
    y: number,
    z: number,
    facingX: number,
    facingZ: number,
    band: number
  ) => {
    seats.push(x, y, z);
    facing.push(facingX, facingZ);
    meta.push(
      deterministic(index, 4),
      deterministic(index, 5),
      0.28 + deterministic(index, 6) * 0.72,
      band
    );
    index += 1;
  };

  // A rectilinear rear choir contrasts with variant A's circular mechanism.
  const rearRows = 64;
  const rearColumns = 96;
  for (let row = 0; row < rearRows; row += 1) {
    for (let column = 0; column < rearColumns; column += 1) {
      const x = THREE.MathUtils.lerp(-10.9, 10.9, column / (rearColumns - 1));
      pushColumn(x, 1.05 + row * 0.132, -10.55 - row * 0.145, 0, 1, column / rearColumns);
    }
  }

  const sideRows = 48;
  const sideColumns = 46;
  for (const side of [-1, 1]) {
    for (let row = 0; row < sideRows; row += 1) {
      for (let column = 0; column < sideColumns; column += 1) {
        const x = side * (7.6 + row * 0.12);
        const z = THREE.MathUtils.lerp(-9.4, 8.5, column / (sideColumns - 1));
        pushColumn(x, 0.98 + row * 0.137, z, -side, 0, column / sideColumns + row * 0.013);
      }
    }
  }

  const base = new THREE.BoxGeometry(0.095, 1, 0.095);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setIndex(base.getIndex()?.clone() ?? null);
  geometry.setAttribute('position', base.getAttribute('position').clone());
  geometry.setAttribute('normal', base.getAttribute('normal').clone());
  base.dispose();
  addInstancedAttribute(geometry, 'aSeat', seats, 3);
  addInstancedAttribute(geometry, 'aFacing', facing, 2);
  addInstancedAttribute(geometry, 'aMeta', meta, 4);
  geometry.instanceCount = seats.length / 3;
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 5, -4), 31);
  return geometry;
}

function createPaperBirdGeometry() {
  const positions = [
    // Left wing: three folded faces.
    0, 0.035, 0.03, -0.08, 0.1, 0.06, -0.42, 0, 0.08,
    0, 0.035, 0.03, -0.42, 0, 0.08, -0.07, -0.015, -0.23,
    0, 0.035, 0.03, -0.07, -0.015, -0.23, -0.08, 0.1, 0.06,
    // Right wing: three folded faces.
    0, 0.035, 0.03, 0.42, 0, 0.08, 0.08, 0.1, 0.06,
    0, 0.035, 0.03, 0.07, -0.015, -0.23, 0.42, 0, 0.08,
    0, 0.035, 0.03, 0.08, 0.1, 0.06, 0.07, -0.015, -0.23
  ];
  const facets = [
    1, 1, 1, 0.63, 0.63, 0.63, 0.79, 0.79, 0.79,
    0.88, 0.88, 0.88, 0.55, 0.55, 0.55, 0.73, 0.73, 0.73
  ];
  const seats: number[] = [];
  const facing: number[] = [];
  const meta: number[] = [];
  let index = 0;

  const terraces = [
    {baseX: 0, baseZ: -10.2, facingX: 0, facingZ: 1},
    {baseX: -7.25, baseZ: -5.8, facingX: 0.82, facingZ: 0.57},
    {baseX: 7.25, baseZ: -5.8, facingX: -0.82, facingZ: 0.57}
  ];
  const rows = 84;

  for (let terraceIndex = 0; terraceIndex < terraces.length; terraceIndex += 1) {
    const terrace = terraces[terraceIndex];
    const tangentX = -terrace.facingZ;
    const tangentZ = terrace.facingX;
    for (let row = 0; row < rows; row += 1) {
      const depth = row * 0.126;
      const width = Math.max(0.1, row * 0.145);
      for (let column = 0; column <= row; column += 1) {
        const columnT = row === 0 ? 0.5 : column / row;
        const lateral = (columnT - 0.5) * width * 2;
        const x = terrace.baseX + tangentX * lateral - terrace.facingX * depth;
        const z = terrace.baseZ + tangentZ * lateral - terrace.facingZ * depth;
        const y = 1.28 + row * 0.105 + (deterministic(index, 7) - 0.5) * 0.035;

        seats.push(x, y, z);
        facing.push(terrace.facingX, terrace.facingZ);
        meta.push(
          deterministic(index, 8),
          deterministic(index, 9),
          row / (rows - 1),
          terraceIndex / 2
        );
        index += 1;
      }
    }
  }

  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aFacet', new THREE.Float32BufferAttribute(facets, 1));
  addInstancedAttribute(geometry, 'aSeat', seats, 3);
  addInstancedAttribute(geometry, 'aFacing', facing, 2);
  addInstancedAttribute(geometry, 'aMeta', meta, 4);
  geometry.instanceCount = seats.length / 3;
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 7, -8), 34);
  return geometry;
}

function makeMaterial(
  vertexShader: string,
  fragmentShader: string,
  side: THREE.Side = THREE.FrontSide
) {
  const uniforms = makeUniforms();
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    side,
    depthWrite: true,
    depthTest: true,
    transparent: false,
    toneMapped: true
  });
  material.dithering = true;
  return {material, uniforms};
}

function FoldedNation() {
  const geometry = useMemo(createFoldedCardGeometry, []);
  const rendered = useMemo(
    () => makeMaterial(FOLDED_CARD_VERTEX, FOLDED_CARD_FRAGMENT, THREE.DoubleSide),
    []
  );
  useRuntimeUniforms(rendered.uniforms);
  return <mesh geometry={geometry} material={rendered.material} frustumCulled={false} />;
}

function SignalChoir() {
  const geometry = useMemo(createSignalColumnGeometry, []);
  const rendered = useMemo(() => makeMaterial(SIGNAL_COLUMN_VERTEX, SIGNAL_COLUMN_FRAGMENT), []);
  useRuntimeUniforms(rendered.uniforms);
  return <mesh geometry={geometry} material={rendered.material} frustumCulled={false} />;
}

function PaperFlock() {
  const geometry = useMemo(createPaperBirdGeometry, []);
  const rendered = useMemo(
    () => makeMaterial(PAPER_BIRD_VERTEX, PAPER_BIRD_FRAGMENT, THREE.DoubleSide),
    []
  );
  useRuntimeUniforms(rendered.uniforms);
  return <mesh geometry={geometry} material={rendered.material} frustumCulled={false} />;
}

/**
 * A — circular folded-card mechanism (roughly 11.7k instances, one draw call)
 * B — rectilinear signal choir (10.5k instances, one draw call)
 * C — three triangular paper terraces (10.7k instances, one draw call)
 */
export function CrowdVariants({variant}: {variant: Variant}) {
  if (variant === 'B') return <SignalChoir />;
  if (variant === 'C') return <PaperFlock />;
  return <FoldedNation />;
}
