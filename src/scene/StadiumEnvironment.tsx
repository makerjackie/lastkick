import {useFrame, useThree} from '@react-three/fiber';
import {useLayoutEffect, useMemo, useRef} from 'react';
import * as THREE from 'three';
import {frameRuntime, GOAL_HALF_WIDTH, sampleShot} from '../experience/runtime';
import type {ShotStyle, Variant} from '../experience/store';

const COLORS = {
  ink: new THREE.Color('#061118'),
  pitch: new THREE.Color('#163b32'),
  ivory: new THREE.Color('#f2edd8'),
  gold: new THREE.Color('#d7a84f'),
  coral: new THREE.Color('#ff513d'),
  cyan: new THREE.Color('#46d7c7')
};

function createSoftDiscTexture() {
  const size = 24;
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const nx = (x + 0.5) / size - 0.5;
      const ny = (y + 0.5) / size - 0.5;
      const distance = Math.hypot(nx, ny);
      const alpha = 1 - THREE.MathUtils.smoothstep(distance, 0.35, 0.5);
      const offset = (y * size + x) * 4;
      pixels[offset] = 255;
      pixels[offset + 1] = 255;
      pixels[offset + 2] = 255;
      pixels[offset + 3] = Math.round(alpha * 255);
    }
  }
  const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

const SOFT_DISC_TEXTURE = createSoftDiscTexture();

const PITCH_VERTEX = /* glsl */ `
  varying vec3 vWorld;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const PITCH_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uShockRadius;
  uniform float uImpactEnergy;
  uniform vec3 uImpactPosition;
  uniform vec3 uPitch;
  uniform vec3 uIvory;
  uniform vec3 uCoral;
  varying vec3 vWorld;
  varying vec2 vUv;

  float stroke(float distanceValue, float width) {
    return 1.0 - smoothstep(width, width + 0.025, abs(distanceValue));
  }

  float limitedStroke(float distanceValue, float width, float limiter, float limit) {
    return stroke(distanceValue, width) * (1.0 - smoothstep(limit, limit + 0.03, abs(limiter)));
  }

  void main() {
    vec2 p = vWorld.xz;
    float mowing = 0.5 + 0.5 * sin((p.y + 10.8) * 2.72);
    float micro = sin(p.x * 31.0 + sin(p.y * 19.0)) * 0.012;
    vec3 color = uPitch * mix(0.72, 1.08, mowing) + micro;

    float lineMask = 0.0;
    lineMask = max(lineMask, limitedStroke(abs(p.x) - 6.62, 0.035, p.y - 0.98, 9.55));
    lineMask = max(lineMask, limitedStroke(abs(p.y - 0.98) - 9.55, 0.035, p.x, 6.62));
    lineMask = max(lineMask, limitedStroke(p.y - 0.98, 0.032, p.x, 6.62));

    float centerCircle = abs(length(vec2(p.x, p.y - 0.98)) - 1.46);
    lineMask = max(lineMask, stroke(centerCircle, 0.035));
    lineMask = max(lineMask, 1.0 - smoothstep(0.045, 0.075, length(vec2(p.x, p.y - 0.98))));

    float penaltySide = limitedStroke(abs(p.x) - 4.18, 0.032, p.y + 6.47, 2.08);
    float penaltyFront = limitedStroke(p.y + 4.39, 0.032, p.x, 4.18);
    lineMask = max(lineMask, max(penaltySide, penaltyFront));
    float goalSide = limitedStroke(abs(p.x) - 2.35, 0.03, p.y + 7.62, 0.94);
    float goalFront = limitedStroke(p.y + 6.68, 0.03, p.x, 2.35);
    lineMask = max(lineMask, max(goalSide, goalFront));
    lineMask = max(lineMask, 1.0 - smoothstep(0.035, 0.065, length(vec2(p.x, p.y + 5.15))));

    color = mix(color, uIvory * 0.9, lineMask * 0.82);

    float hitDistance = distance(p, uImpactPosition.xz);
    float ring = exp(-pow((hitDistance - uShockRadius) / 0.19, 2.0));
    float echoRing = exp(-pow((hitDistance - uShockRadius * 0.78) / 0.34, 2.0));
    color += uCoral * ring * 0.92 + uIvory * echoRing * 0.18;

    float wet = pow(max(0.0, 1.0 - abs(vUv.x - 0.5) * 1.4), 4.0);
    color += vec3(0.045, 0.075, 0.065) * wet;
    color *= 0.94 + uImpactEnergy * 0.12;

    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const NET_VERTEX = /* glsl */ `
  uniform float uImpactAge;
  uniform float uImpactEnergy;
  uniform float uGoalHit;
  uniform vec3 uTarget;
  varying vec2 vUv;
  varying float vDeform;

  void main() {
    vUv = uv;
    vec3 p = position;
    vec2 targetUv = vec2(uTarget.x / 7.1 + 0.5, uTarget.y / 2.5);
    float d = distance(uv, targetUv);
    float kick = exp(-d * d * 38.0) * uGoalHit;
    float wave = sin(d * 38.0 - uImpactAge * 20.0) * exp(-uImpactAge * 2.7);
    p.z -= kick * (0.5 + wave * 0.18);
    p.z -= uImpactEnergy * exp(-d * d * 52.0) * 0.12;
    vDeform = kick;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const NET_FRAGMENT = /* glsl */ `
  uniform vec3 uIvory;
  uniform vec3 uCyan;
  varying vec2 vUv;
  varying float vDeform;

  void main() {
    vec2 cells = vUv * vec2(29.0, 13.0);
    vec2 f = min(fract(cells), 1.0 - fract(cells));
    float line = 1.0 - smoothstep(0.035, 0.105, min(f.x, f.y));
    float edge = 1.0 - smoothstep(0.0, 0.055, min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y)));
    float alpha = max(line * 0.54, edge * 0.72);
    vec3 color = mix(uIvory, uCyan, vDeform * 0.45);
    gl_FragColor = vec4(color, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const RAIN_VERTEX = /* glsl */ `
  attribute vec3 aBase;
  attribute float aSeed;
  uniform float uTime;
  uniform float uImpactAge;
  uniform float uImpactEnergy;
  varying float vAlpha;

  void main() {
    float reverse = smoothstep(0.02, 0.18, uImpactAge) * (1.0 - smoothstep(0.42, 0.96, uImpactAge));
    float fall = uTime * (11.0 + aSeed * 8.0);
    float y = mod(aBase.y - fall + reverse * uImpactAge * 34.0 + 180.0, 18.0) - 1.5;
    vec3 p = vec3(aBase.x, y, aBase.z);
    p.x += sin(uTime * 0.5 + aSeed * 18.0) * 0.18;
    p.y += position.y * (0.18 + aSeed * 0.32);
    p.x += position.x;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vAlpha = (0.12 + aSeed * 0.34) * (1.0 + uImpactEnergy * 1.7);
    gl_Position = projectionMatrix * mv;
  }
`;

const RAIN_FRAGMENT = /* glsl */ `
  uniform vec3 uRainColor;
  varying float vAlpha;

  void main() {
    gl_FragColor = vec4(uRainColor, vAlpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function Pitch() {
  const rendered = useMemo(() => {
    const uniforms = {
      uTime: new THREE.Uniform(0),
      uShockRadius: new THREE.Uniform(-2),
      uImpactEnergy: new THREE.Uniform(0),
      uImpactPosition: new THREE.Uniform(new THREE.Vector3()),
      uPitch: new THREE.Uniform(COLORS.pitch.clone()),
      uIvory: new THREE.Uniform(COLORS.ivory.clone()),
      uCoral: new THREE.Uniform(COLORS.coral.clone())
    };
    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: PITCH_VERTEX,
      fragmentShader: PITCH_FRAGMENT,
      toneMapped: true
    });
    return {uniforms, material};
  }, []);

  useFrame((state) => {
    rendered.uniforms.uTime.value = state.clock.elapsedTime;
    rendered.uniforms.uShockRadius.value = frameRuntime.shockRadius;
    rendered.uniforms.uImpactEnergy.value = frameRuntime.impactEnergy;
    rendered.uniforms.uImpactPosition.value.copy(frameRuntime.target);
  });

  return (
    <mesh position={[0, 0, 0.98]} rotation={[-Math.PI / 2, 0, 0]} material={rendered.material}>
      <planeGeometry args={[13.4, 19.4, 1, 1]} />
    </mesh>
  );
}

function GoalNet() {
  const rendered = useMemo(() => {
    const uniforms = {
      uImpactAge: new THREE.Uniform(0),
      uImpactEnergy: new THREE.Uniform(0),
      uGoalHit: new THREE.Uniform(0),
      uTarget: new THREE.Uniform(new THREE.Vector3()),
      uIvory: new THREE.Uniform(COLORS.ivory.clone()),
      uCyan: new THREE.Uniform(COLORS.cyan.clone())
    };
    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: NET_VERTEX,
      fragmentShader: NET_FRAGMENT,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: true
    });
    return {uniforms, material};
  }, []);

  useFrame(() => {
    rendered.uniforms.uImpactAge.value = frameRuntime.impactAge;
    rendered.uniforms.uImpactEnergy.value = frameRuntime.impactEnergy;
    rendered.uniforms.uGoalHit.value = frameRuntime.impactKind === 'goal' ? frameRuntime.burst : 0;
    rendered.uniforms.uTarget.value.copy(frameRuntime.target);
  });

  return (
    <mesh position={[0, 1.25, -8.72]} material={rendered.material}>
      <planeGeometry args={[7.1, 2.5, 36, 14]} />
    </mesh>
  );
}

function GoalFrame() {
  const frameMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: COLORS.ivory,
        emissive: new THREE.Color('#b9b69f'),
        emissiveIntensity: 0.95,
        roughness: 0.22,
        metalness: 0.18
      }),
    []
  );
  const darkMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({color: '#152226', roughness: 0.75}),
    []
  );
  return (
    <group>
      <mesh position={[-3.55, 1.25, -8.55]} material={frameMaterial}>
        <cylinderGeometry args={[0.075, 0.075, 2.5, 14]} />
      </mesh>
      <mesh position={[3.55, 1.25, -8.55]} material={frameMaterial}>
        <cylinderGeometry args={[0.075, 0.075, 2.5, 14]} />
      </mesh>
      <mesh position={[0, 2.5, -8.55]} rotation={[0, 0, Math.PI / 2]} material={frameMaterial}>
        <cylinderGeometry args={[0.075, 0.075, 7.1, 14]} />
      </mesh>
      {[-3.55, 3.55].map((x) => (
        <mesh
          key={x}
          position={[x, 0.06, -9.25]}
          rotation={[Math.PI / 2, 0, 0]}
          material={darkMaterial}
        >
          <cylinderGeometry args={[0.045, 0.045, 1.4, 8]} />
        </mesh>
      ))}
      <GoalNet />
    </group>
  );
}

type GuidePoint = [number, number];

function createGuideGeometry(points: GuidePoint[]) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(points.flatMap(([x, y]) => [x, y, 0]), 3)
  );
  return geometry;
}

function addArc(
  points: GuidePoint[],
  radiusX: number,
  radiusY: number,
  start: number,
  length: number,
  count: number
) {
  for (let index = 0; index < count; index += 1) {
    const t = index / Math.max(1, count - 1);
    const angle = start + length * t;
    points.push([Math.cos(angle) * radiusX, Math.sin(angle) * radiusY]);
  }
}

function GoalTargetGuide() {
  const powerLeft = useRef<THREE.Group>(null);
  const powerRight = useRef<THREE.Group>(null);
  const curveLeft = useRef<THREE.Group>(null);
  const curveRight = useRef<THREE.Group>(null);
  const chip = useRef<THREE.Group>(null);

  const rendered = useMemo(() => {
    const powerPoints: GuidePoint[] = [];
    for (let quadrant = 0; quadrant < 4; quadrant += 1) {
      addArc(powerPoints, 0.36, 0.36, quadrant * (Math.PI / 2) + 0.12, 0.52, 7);
    }
    for (let index = -2; index <= 2; index += 1) {
      powerPoints.push([index * 0.055, 0]);
      powerPoints.push([0, index * 0.055]);
    }

    const curvePoints: GuidePoint[] = [];
    for (let index = 0; index < 48; index += 1) {
      const t = index / 47;
      const angle = -0.55 + t * Math.PI * 1.72;
      const radius = THREE.MathUtils.lerp(0.48, 0.16, t);
      curvePoints.push([
        Math.cos(angle) * radius,
        Math.sin(angle) * radius * 0.74 + THREE.MathUtils.lerp(-0.08, 0.08, t)
      ]);
    }

    const chipPoints: GuidePoint[] = [];
    for (let index = 0; index < 38; index += 1) {
      const t = index / 37;
      const x = THREE.MathUtils.lerp(-0.52, 0.52, t);
      chipPoints.push([x, 0.3 - Math.pow(x / 0.52, 2) * 0.43]);
    }
    for (let index = 0; index < 24; index += 1) {
      const t = index / 23;
      const x = THREE.MathUtils.lerp(-0.34, 0.34, t);
      chipPoints.push([x, 0.17 - Math.pow(x / 0.34, 2) * 0.26]);
    }
    for (let index = 0; index < 6; index += 1) {
      chipPoints.push([0, -0.36 + index * 0.055]);
    }

    const makeMaterial = (color: THREE.Color) =>
      new THREE.PointsMaterial({
        color,
        size: 0.105,
        sizeAttenuation: true,
        map: SOFT_DISC_TEXTURE,
        alphaTest: 0.02,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false
      });

    return {
      geometry: {
        power: createGuideGeometry(powerPoints),
        curveLeft: createGuideGeometry(curvePoints.map(([x, y]) => [-x, y])),
        curveRight: createGuideGeometry(curvePoints),
        chip: createGuideGeometry(chipPoints)
      },
      material: {
        powerLeft: makeMaterial(COLORS.coral),
        powerRight: makeMaterial(COLORS.coral),
        curveLeft: makeMaterial(COLORS.cyan),
        curveRight: makeMaterial(COLORS.cyan),
        chip: makeMaterial(COLORS.gold)
      }
    };
  }, []);

  useFrame((state, delta) => {
    const visiblePhase = frameRuntime.phase === 'ready' || frameRuntime.phase === 'charging';
    const charging = frameRuntime.phase === 'charging';
    const style = frameRuntime.shotStyle;
    const selectedSide = Math.abs(frameRuntime.aim.x) > 0.12 ? Math.sign(frameRuntime.aim.x) : 0;
    const pulse = 1 + Math.sin(state.clock.elapsedTime * 2.7) * 0.035 + (charging ? frameRuntime.charge * 0.035 : 0);
    const baseOpacity = charging ? 0.48 + frameRuntime.charge * 0.3 : 0.34;
    const dampOpacity = (material: THREE.PointsMaterial, target: number) => {
      material.opacity = THREE.MathUtils.damp(material.opacity, target, 12, delta);
    };

    const powerVisible = visiblePhase && style === 'power';
    const curveVisible = visiblePhase && style === 'curve';
    const chipVisible = visiblePhase && style === 'chip';
    if (powerLeft.current) {
      powerLeft.current.visible = powerVisible;
      powerLeft.current.scale.setScalar(pulse);
    }
    if (powerRight.current) {
      powerRight.current.visible = powerVisible;
      powerRight.current.scale.setScalar(pulse);
    }
    if (curveLeft.current) {
      curveLeft.current.visible = curveVisible;
      curveLeft.current.scale.setScalar(pulse);
      curveLeft.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.9) * 0.025;
    }
    if (curveRight.current) {
      curveRight.current.visible = curveVisible;
      curveRight.current.scale.setScalar(pulse);
      curveRight.current.rotation.z = -Math.sin(state.clock.elapsedTime * 0.9) * 0.025;
    }
    if (chip.current) {
      chip.current.visible = chipVisible;
      chip.current.scale.setScalar(pulse);
      chip.current.position.y = 1.86 + Math.sin(state.clock.elapsedTime * 1.8) * 0.018;
    }

    dampOpacity(
      rendered.material.powerLeft,
      powerVisible ? baseOpacity * (selectedSide === 1 ? 0.45 : 1) : 0
    );
    dampOpacity(
      rendered.material.powerRight,
      powerVisible ? baseOpacity * (selectedSide === -1 ? 0.45 : 1) : 0
    );
    dampOpacity(
      rendered.material.curveLeft,
      curveVisible ? baseOpacity * (selectedSide === 1 ? 0.34 : 1) : 0
    );
    dampOpacity(
      rendered.material.curveRight,
      curveVisible ? baseOpacity * (selectedSide === -1 ? 0.34 : 1) : 0
    );
    dampOpacity(rendered.material.chip, chipVisible ? baseOpacity * 0.92 : 0);
  });

  return (
    <group position={[0, 0, -8.43]}>
      <group ref={powerLeft} position={[-2.78, 1.08, 0]} visible={false}>
        <points
          geometry={rendered.geometry.power}
          material={rendered.material.powerLeft}
          frustumCulled={false}
        />
      </group>
      <group ref={powerRight} position={[2.78, 1.08, 0]} visible={false}>
        <points
          geometry={rendered.geometry.power}
          material={rendered.material.powerRight}
          frustumCulled={false}
        />
      </group>
      <group ref={curveLeft} position={[-2.86, 1.82, 0]} visible={false}>
        <points
          geometry={rendered.geometry.curveLeft}
          material={rendered.material.curveLeft}
          frustumCulled={false}
        />
      </group>
      <group ref={curveRight} position={[2.86, 1.82, 0]} visible={false}>
        <points
          geometry={rendered.geometry.curveRight}
          material={rendered.material.curveRight}
          frustumCulled={false}
        />
      </group>
      <group ref={chip} position={[0, 1.86, 0]} visible={false}>
        <points
          geometry={rendered.geometry.chip}
          material={rendered.material.chip}
          frustumCulled={false}
        />
      </group>
    </group>
  );
}

const TRACE_POINT_COUNT = 56;

function BallAndTrace() {
  const ball = useRef<THREE.Mesh>(null);
  const shadow = useRef<THREE.Mesh>(null);
  const traceGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(TRACE_POINT_COUNT * 3), 3)
    );
    geometry.setAttribute(
      'color',
      new THREE.BufferAttribute(new Float32Array(TRACE_POINT_COUNT * 3), 3)
    );
    geometry.setDrawRange(0, 0);
    return geometry;
  }, []);
  const traceMaterial = useMemo(
    () =>
      new THREE.PointsMaterial({
        size: 0.075,
        sizeAttenuation: true,
        map: SOFT_DISC_TEXTURE,
        alphaTest: 0.02,
        transparent: true,
        opacity: 0.78,
        vertexColors: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      }),
    []
  );
  const traceLineMaterial = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        transparent: true,
        opacity: 0,
        vertexColors: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false
      }),
    []
  );
  const traceLine = useMemo(() => {
    const line = new THREE.Line(traceGeometry, traceLineMaterial);
    line.frustumCulled = false;
    return line;
  }, [traceGeometry, traceLineMaterial]);
  const sample = useMemo(() => new THREE.Vector3(), []);

  const writeTraceColors = (count: number, style: ShotStyle) => {
    const colors = traceGeometry.getAttribute('color') as THREE.BufferAttribute;
    const base = style === 'power' ? COLORS.coral : style === 'curve' ? COLORS.cyan : COLORS.gold;
    for (let index = 0; index < count; index += 1) {
      const t = count === 1 ? 1 : index / (count - 1);
      const headMix = Math.pow(t, 1.55);
      colors.setXYZ(
        index,
        THREE.MathUtils.lerp(base.r, COLORS.ivory.r, headMix),
        THREE.MathUtils.lerp(base.g, COLORS.ivory.g, headMix),
        THREE.MathUtils.lerp(base.b, COLORS.ivory.b, headMix)
      );
    }
    colors.needsUpdate = true;
  };

  useFrame(() => {
    if (ball.current) {
      ball.current.position.copy(frameRuntime.ball);
      ball.current.rotation.set(frameRuntime.ballSpin * 0.62, frameRuntime.ballSpin, frameRuntime.ballSpin * 0.17);
      const contactScale = frameRuntime.phase === 'contact' ? 0.82 : 1;
      ball.current.scale.set(1 / Math.sqrt(contactScale), contactScale, 1 / Math.sqrt(contactScale));
    }
    if (shadow.current) {
      shadow.current.position.set(frameRuntime.ball.x, 0.014, frameRuntime.ball.z);
      const altitude = Math.max(0.2, frameRuntime.ball.y);
      const scale = THREE.MathUtils.clamp(0.46 + altitude * 0.08, 0.46, 0.78);
      shadow.current.scale.set(scale, scale, scale);
      const material = shadow.current.material as THREE.MeshBasicMaterial;
      material.opacity = THREE.MathUtils.clamp(0.22 - altitude * 0.025, 0.04, 0.2);
    }

    const positions = traceGeometry.getAttribute('position') as THREE.BufferAttribute;
    if (frameRuntime.phase === 'charging') {
      for (let index = 0; index < TRACE_POINT_COUNT; index += 1) {
        sampleShot(
          index / (TRACE_POINT_COUNT - 1),
          frameRuntime.charge,
          frameRuntime.aim,
          frameRuntime.target,
          sample
        );
        positions.setXYZ(index, sample.x, sample.y, sample.z);
      }
      traceGeometry.setDrawRange(0, TRACE_POINT_COUNT);
      traceMaterial.size =
        frameRuntime.shotStyle === 'curve'
          ? 0.12
          : frameRuntime.shotStyle === 'chip'
            ? 0.105
            : 0.095;
      traceMaterial.opacity =
        (frameRuntime.shotStyle === 'curve' ? 0.62 : 0.5) + frameRuntime.charge * 0.14;
      traceLineMaterial.opacity = frameRuntime.shotStyle === 'curve' ? 0.42 : 0.25;
      writeTraceColors(TRACE_POINT_COUNT, frameRuntime.shotStyle);
      positions.needsUpdate = true;
    } else if (frameRuntime.phase === 'flight') {
      const tailLength =
        frameRuntime.shotStyle === 'curve'
          ? 0.62
          : frameRuntime.shotStyle === 'chip'
            ? 0.4
            : 0.24;
      const visibleProgress = Math.min(frameRuntime.shotProgress, tailLength);
      const pointCount = Math.max(
        3,
        Math.ceil(TRACE_POINT_COUNT * (visibleProgress / Math.max(0.001, tailLength)))
      );
      const tailStart = Math.max(0, frameRuntime.shotProgress - tailLength);
      for (let index = 0; index < pointCount; index += 1) {
        const t = index / Math.max(1, pointCount - 1);
        const p = THREE.MathUtils.lerp(tailStart, frameRuntime.shotProgress, t);
        sampleShot(p, frameRuntime.charge, frameRuntime.aim, frameRuntime.target, sample);
        positions.setXYZ(index, sample.x, sample.y, sample.z);
      }
      traceGeometry.setDrawRange(0, pointCount);
      traceMaterial.size = frameRuntime.shotStyle === 'curve' ? 0.13 : 0.105;
      traceMaterial.opacity = frameRuntime.shotStyle === 'curve' ? 0.94 : 0.84;
      traceLineMaterial.opacity = frameRuntime.shotStyle === 'curve' ? 0.5 : 0.28;
      writeTraceColors(pointCount, frameRuntime.shotStyle);
      positions.needsUpdate = true;
    } else {
      traceGeometry.setDrawRange(0, 0);
      traceLineMaterial.opacity = 0;
    }
  });

  return (
    <group>
      <primitive object={traceLine} />
      <points geometry={traceGeometry} material={traceMaterial} frustumCulled={false} />
      <mesh ref={shadow} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.54, 28]} />
        <meshBasicMaterial color="#020507" transparent opacity={0.18} depthWrite={false} />
      </mesh>
      <mesh ref={ball}>
        <icosahedronGeometry args={[0.225, 3]} />
        <meshStandardMaterial
          color="#f2edd8"
          emissive="#39382f"
          emissiveIntensity={0.62}
          roughness={0.3}
          metalness={0.07}
        />
        <mesh scale={1.008}>
          <icosahedronGeometry args={[0.225, 2]} />
          <meshBasicMaterial color="#182126" wireframe transparent opacity={0.48} />
        </mesh>
      </mesh>
    </group>
  );
}

type FacetedPartProps = {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  outlineMaterial: THREE.Material;
  position?: [number, number, number];
  rotation?: [number, number, number];
};

function FacetedPart({
  geometry,
  material,
  outlineMaterial,
  position = [0, 0, 0],
  rotation = [0, 0, 0]
}: FacetedPartProps) {
  return (
    <group position={position} rotation={rotation}>
      <mesh geometry={geometry} material={outlineMaterial} scale={1.075} />
      <mesh geometry={geometry} material={material} />
    </group>
  );
}

function Goalkeeper() {
  const root = useRef<THREE.Group>(null);
  const upperBody = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const leftUpperArm = useRef<THREE.Group>(null);
  const rightUpperArm = useRef<THREE.Group>(null);
  const leftForearm = useRef<THREE.Group>(null);
  const rightForearm = useRef<THREE.Group>(null);
  const leftUpperLeg = useRef<THREE.Group>(null);
  const rightUpperLeg = useRef<THREE.Group>(null);
  const leftLowerLeg = useRef<THREE.Group>(null);
  const rightLowerLeg = useRef<THREE.Group>(null);
  const leftGlove = useRef<THREE.Group>(null);
  const rightGlove = useRef<THREE.Group>(null);
  const leftSaveHalo = useRef<THREE.Mesh>(null);
  const rightSaveHalo = useRef<THREE.Mesh>(null);
  const shadow = useRef<THREE.Mesh>(null);

  const {geometry, material} = useMemo(() => {
    const makeStandard = (color: string, emissive = '#000000') =>
      new THREE.MeshStandardMaterial({
        color,
        emissive,
        emissiveIntensity: emissive === '#000000' ? 0 : 0.34,
        roughness: 0.72,
        metalness: 0.02,
        flatShading: true
      });

    return {
      geometry: {
        torso: new THREE.CylinderGeometry(0.23, 0.31, 0.68, 6, 1),
        shorts: new THREE.CylinderGeometry(0.23, 0.27, 0.27, 6, 1),
        neck: new THREE.CylinderGeometry(0.085, 0.095, 0.12, 7, 1),
        head: new THREE.DodecahedronGeometry(0.17, 0),
        cap: new THREE.CylinderGeometry(0.17, 0.18, 0.075, 8, 1),
        upperArm: new THREE.CylinderGeometry(0.07, 0.09, 0.38, 6, 1),
        forearm: new THREE.CylinderGeometry(0.055, 0.072, 0.34, 6, 1),
        glove: new THREE.IcosahedronGeometry(0.13, 0),
        gloveCuff: new THREE.CylinderGeometry(0.082, 0.095, 0.11, 6, 1),
        upperLeg: new THREE.CylinderGeometry(0.095, 0.125, 0.43, 6, 1),
        lowerLeg: new THREE.CylinderGeometry(0.07, 0.09, 0.42, 6, 1),
        boot: new THREE.BoxGeometry(0.18, 0.1, 0.3)
      },
      material: {
        outline: new THREE.MeshBasicMaterial({
          color: '#02080d',
          side: THREE.BackSide,
          toneMapped: false
        }),
        jersey: makeStandard('#1769aa', '#08294c'),
        jerseyLight: makeStandard('#39a6d8', '#0b3248'),
        shorts: makeStandard('#091d3e', '#020817'),
        skin: makeStandard('#6f4936', '#160a06'),
        glove: makeStandard('#ffd23f', '#594206'),
        ivory: makeStandard('#f4f0dc', '#322f27'),
        coral: makeStandard('#ef3d44', '#4e0c14'),
        boot: makeStandard('#071018', '#000000')
      }
    };
  }, []);

  useFrame((state, delta) => {
    if (
      !root.current ||
      !upperBody.current ||
      !head.current ||
      !leftUpperArm.current ||
      !rightUpperArm.current ||
      !leftForearm.current ||
      !rightForearm.current ||
      !leftUpperLeg.current ||
      !rightUpperLeg.current ||
      !leftLowerLeg.current ||
      !rightLowerLeg.current
    ) {
      return;
    }

    const phase = frameRuntime.phase;
    const outcome = frameRuntime.impactKind;
    const isSave = outcome === 'save';
    const isGoal = outcome === 'goal';
    const isAfterHit = phase === 'impact' || phase === 'aftermath';
    const isPreparing = phase === 'charging' || phase === 'contact';
    const shotDirection =
      Math.abs(frameRuntime.target.x) > 0.18 ? Math.sign(frameRuntime.target.x) : 0;
    const previousDirection =
      frameRuntime.previousAim && Math.abs(frameRuntime.previousAim.x) > 0.08
        ? Math.sign(frameRuntime.previousAim.x)
        : 0;
    const wrongGuessDirection =
      shotDirection === 0
        ? previousDirection || (frameRuntime.shotStyle === 'curve' ? -1 : 1)
        : -shotDirection;
    const diveDirection = isGoal ? wrongGuessDirection : shotDirection;
    const centerSave = isSave && shotDirection === 0;
    const targetWidth = THREE.MathUtils.clamp(
      Math.abs(frameRuntime.target.x) / GOAL_HALF_WIDTH,
      0,
      1
    );
    const reactionStart = isSave ? 0.16 : isGoal ? 0.54 : 0.3;
    const reactionEnd = isSave ? 0.76 : isGoal ? 0.96 : 0.86;
    const progress = phase === 'flight' ? frameRuntime.shotProgress : isAfterHit ? 1 : 0;
    const normalizedDive = THREE.MathUtils.clamp(
      (progress - reactionStart) / (reactionEnd - reactionStart),
      0,
      1
    );
    const dive = normalizedDive * normalizedDive * (3 - 2 * normalizedDive);
    const armReach = THREE.MathUtils.smoothstep(dive, 0.08, 0.66);
    const charge = isPreparing ? frameRuntime.charge : 0;
    const breath = Math.sin(state.clock.elapsedTime * 2.45) * 0.012 * (1 - dive);
    const afterHitSettle =
      phase === 'aftermath' ? THREE.MathUtils.clamp(frameRuntime.impactAge / 0.75, 0, 1) : 0;
    const damp = (current: number, target: number, speed = 13) =>
      THREE.MathUtils.damp(current, target, speed, delta);

    const rememberedProbeX =
      phase === 'ready' && frameRuntime.previousAim && previousDirection !== 0
        ? previousDirection * (0.34 + Math.min(1, Math.abs(frameRuntime.previousAim.x)) * 0.14)
        : 0;
    const trackX = isPreparing ? frameRuntime.aim.x * 0.2 : rememberedProbeX;
    const diveTravel = (isSave ? 0.78 : isGoal ? 0.5 : 0.68) + targetWidth * 0.14;
    const rootX = THREE.MathUtils.lerp(trackX, diveDirection * diveTravel, dive);
    const centerJump = centerSave ? 0.18 + Math.sin(dive * Math.PI) * 0.12 : 0;
    const rootY =
      dive * (0.08 + centerJump + Math.sin(dive * Math.PI) * 0.22) *
      (1 - afterHitSettle * 0.45);
    const diveAngle =
      diveDirection *
      dive *
      (isSave ? -(1.12 + targetWidth * 0.12) : isGoal ? -0.9 : -(1.02 + targetWidth * 0.1));
    const rememberedLean = phase === 'ready' ? -previousDirection * 0.085 : 0;

    root.current.position.x = damp(root.current.position.x, rootX, 11);
    root.current.position.y = damp(root.current.position.y, rootY, 12);
    root.current.rotation.z = damp(
      root.current.rotation.z,
      diveAngle + rememberedLean * (1 - dive),
      12
    );
    root.current.rotation.y = damp(root.current.rotation.y, diveDirection * dive * 0.09, 10);

    const crouch = charge * 0.13 * (1 - dive);
    upperBody.current.position.y = damp(upperBody.current.position.y, 0.84 - crouch + breath);
    upperBody.current.rotation.x = damp(upperBody.current.rotation.x, 0.12 + charge * 0.12);
    upperBody.current.rotation.z = damp(
      upperBody.current.rotation.z,
      -diveAngle * 0.07 + Math.sin(state.clock.elapsedTime * 1.15) * 0.012 * (1 - dive)
    );
    head.current.rotation.y = damp(
      head.current.rotation.y,
      -(phase === 'ready' && frameRuntime.previousAim
        ? frameRuntime.previousAim.x
        : frameRuntime.aim.x) *
        0.16 *
        (1 - dive) +
        diveDirection * dive * 0.12
    );
    head.current.rotation.z = damp(head.current.rotation.z, diveDirection * dive * 0.32);

    const heightReach = THREE.MathUtils.clamp(
      (frameRuntime.target.y - 1.4) * 0.28,
      -0.2,
      0.36
    );
    const reachAngle = diveDirection * ((isSave ? 1.64 : isGoal ? 1.38 : 1.54) + heightReach);
    const centerReachAngle = 1.58 + heightReach * 1.35;
    const memoryArmBias = phase === 'ready' ? previousDirection * 0.075 : 0;
    const leftReachAngle = centerSave
      ? centerReachAngle
      : reachAngle - diveDirection * 0.1;
    const rightReachAngle = centerSave
      ? -centerReachAngle
      : reachAngle + diveDirection * 0.1;
    leftUpperArm.current.rotation.z = damp(
      leftUpperArm.current.rotation.z,
      THREE.MathUtils.lerp(
        -0.86 - charge * 0.07 + memoryArmBias,
        leftReachAngle,
        armReach
      )
    );
    rightUpperArm.current.rotation.z = damp(
      rightUpperArm.current.rotation.z,
      THREE.MathUtils.lerp(
        0.86 + charge * 0.07 + memoryArmBias,
        rightReachAngle,
        armReach
      )
    );
    leftForearm.current.rotation.z = damp(
      leftForearm.current.rotation.z,
      THREE.MathUtils.lerp(-0.18, centerSave ? 0 : diveDirection * 0.06, armReach)
    );
    rightForearm.current.rotation.z = damp(
      rightForearm.current.rotation.z,
      THREE.MathUtils.lerp(0.18, centerSave ? 0 : diveDirection * 0.06, armReach)
    );

    const leftLegDive = centerSave ? -0.3 : diveDirection > 0 ? -0.12 : -0.48;
    const rightLegDive = centerSave ? 0.3 : diveDirection > 0 ? 0.48 : 0.12;
    leftUpperLeg.current.position.y = damp(leftUpperLeg.current.position.y, 0.82 - crouch * 0.58);
    rightUpperLeg.current.position.y = damp(rightUpperLeg.current.position.y, 0.82 - crouch * 0.58);
    leftUpperLeg.current.rotation.z = damp(
      leftUpperLeg.current.rotation.z,
      THREE.MathUtils.lerp(-0.24 - charge * 0.05, leftLegDive, dive)
    );
    rightUpperLeg.current.rotation.z = damp(
      rightUpperLeg.current.rotation.z,
      THREE.MathUtils.lerp(0.24 + charge * 0.05, rightLegDive, dive)
    );
    leftLowerLeg.current.rotation.z = damp(
      leftLowerLeg.current.rotation.z,
      THREE.MathUtils.lerp(
        0.34 + charge * 0.12,
        centerSave ? 0.28 : diveDirection > 0 ? 0.12 : 0.48,
        dive
      )
    );
    rightLowerLeg.current.rotation.z = damp(
      rightLowerLeg.current.rotation.z,
      THREE.MathUtils.lerp(
        -0.34 - charge * 0.12,
        centerSave ? -0.28 : diveDirection > 0 ? -0.48 : -0.12,
        dive
      )
    );

    const savePulse = isSave && isAfterHit ? 1 + frameRuntime.impactEnergy * 0.38 : 1;
    const leftGloveScale = isSave && (diveDirection < 0 || centerSave) ? savePulse : 1;
    const rightGloveScale = isSave && (diveDirection > 0 || centerSave) ? savePulse : 1;
    leftGlove.current?.scale.setScalar(damp(leftGlove.current.scale.x, leftGloveScale, 18));
    rightGlove.current?.scale.setScalar(damp(rightGlove.current.scale.x, rightGloveScale, 18));

    [leftSaveHalo.current, rightSaveHalo.current].forEach((halo, index) => {
      if (!halo) return;
      const isLeadingGlove = centerSave || index === (diveDirection < 0 ? 0 : 1);
      const visible = isSave && isAfterHit && isLeadingGlove && frameRuntime.impactEnergy > 0.025;
      halo.visible = visible;
      if (!visible) return;
      halo.scale.setScalar(0.8 + (1 - frameRuntime.impactEnergy) * 1.45);
      (halo.material as THREE.MeshBasicMaterial).opacity = frameRuntime.impactEnergy * 0.72;
    });

    if (shadow.current) {
      shadow.current.position.x = damp(shadow.current.position.x, rootX, 10);
      shadow.current.scale.x = damp(shadow.current.scale.x, 0.78 + dive * 1.25, 10);
      shadow.current.scale.y = damp(shadow.current.scale.y, 0.72 - dive * 0.2, 10);
      (shadow.current.material as THREE.MeshBasicMaterial).opacity = 0.17 - dive * 0.065;
    }
  });

  return (
    <group>
      <mesh ref={shadow} position={[0, 0.018, -8.04]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.48, 28]} />
        <meshBasicMaterial color="#010507" transparent opacity={0.17} depthWrite={false} />
      </mesh>

      <group ref={root} position={[0, 0, -8.04]}>
        <group ref={upperBody} position={[0, 0.84, 0]}>
          <FacetedPart
            geometry={geometry.shorts}
            material={material.shorts}
            outlineMaterial={material.outline}
            position={[0, 0.05, 0]}
          />
          <FacetedPart
            geometry={geometry.torso}
            material={material.jersey}
            outlineMaterial={material.outline}
            position={[0, 0.43, 0]}
          />

          <mesh position={[0, 0.24, 0.245]}>
            <boxGeometry args={[0.48, 0.038, 0.025]} />
            <primitive object={material.ivory} attach="material" />
          </mesh>
          <mesh position={[0, 0.18, 0.248]}>
            <boxGeometry args={[0.5, 0.045, 0.027]} />
            <primitive object={material.coral} attach="material" />
          </mesh>
          <mesh position={[0, 0.51, 0.242]}>
            <boxGeometry args={[0.045, 0.2, 0.025]} />
            <primitive object={material.ivory} attach="material" />
          </mesh>
          <mesh position={[0.032, 0.6, 0.245]} rotation={[0, 0, -0.42]}>
            <boxGeometry args={[0.1, 0.04, 0.025]} />
            <primitive object={material.ivory} attach="material" />
          </mesh>
          <mesh position={[-0.13, 0.56, 0.247]}>
            <circleGeometry args={[0.045, 5]} />
            <primitive object={material.glove} attach="material" />
          </mesh>

          <FacetedPart
            geometry={geometry.neck}
            material={material.skin}
            outlineMaterial={material.outline}
            position={[0, 0.82, 0]}
          />
          <group ref={head} position={[0, 1.02, 0.01]}>
            <FacetedPart
              geometry={geometry.head}
              material={material.skin}
              outlineMaterial={material.outline}
            />
            <FacetedPart
              geometry={geometry.cap}
              material={material.jerseyLight}
              outlineMaterial={material.outline}
              position={[0, 0.13, -0.005]}
            />
            <mesh position={[0, 0.1, 0.145]}>
              <boxGeometry args={[0.23, 0.035, 0.14]} />
              <primitive object={material.jerseyLight} attach="material" />
            </mesh>
          </group>

          <group ref={leftUpperArm} position={[-0.27, 0.69, 0]} rotation={[0, 0, -0.86]}>
            <FacetedPart
              geometry={geometry.upperArm}
              material={material.jerseyLight}
              outlineMaterial={material.outline}
              position={[0, -0.19, 0]}
            />
            <group ref={leftForearm} position={[0, -0.38, 0]} rotation={[0, 0, -0.18]}>
              <FacetedPart
                geometry={geometry.forearm}
                material={material.jersey}
                outlineMaterial={material.outline}
                position={[0, -0.17, 0]}
              />
              <FacetedPart
                geometry={geometry.gloveCuff}
                material={material.ivory}
                outlineMaterial={material.outline}
                position={[0, -0.35, 0]}
              />
              <group ref={leftGlove} position={[0, -0.46, 0]}>
                <FacetedPart
                  geometry={geometry.glove}
                  material={material.glove}
                  outlineMaterial={material.outline}
                />
                <mesh ref={leftSaveHalo} visible={false}>
                  <ringGeometry args={[0.17, 0.205, 24]} />
                  <meshBasicMaterial
                    color="#ffd23f"
                    transparent
                    opacity={0}
                    depthWrite={false}
                    blending={THREE.AdditiveBlending}
                    toneMapped={false}
                  />
                </mesh>
              </group>
            </group>
          </group>

          <group ref={rightUpperArm} position={[0.27, 0.69, 0]} rotation={[0, 0, 0.86]}>
            <FacetedPart
              geometry={geometry.upperArm}
              material={material.jerseyLight}
              outlineMaterial={material.outline}
              position={[0, -0.19, 0]}
            />
            <group ref={rightForearm} position={[0, -0.38, 0]} rotation={[0, 0, 0.18]}>
              <FacetedPart
                geometry={geometry.forearm}
                material={material.jersey}
                outlineMaterial={material.outline}
                position={[0, -0.17, 0]}
              />
              <FacetedPart
                geometry={geometry.gloveCuff}
                material={material.ivory}
                outlineMaterial={material.outline}
                position={[0, -0.35, 0]}
              />
              <group ref={rightGlove} position={[0, -0.46, 0]}>
                <FacetedPart
                  geometry={geometry.glove}
                  material={material.glove}
                  outlineMaterial={material.outline}
                />
                <mesh ref={rightSaveHalo} visible={false}>
                  <ringGeometry args={[0.17, 0.205, 24]} />
                  <meshBasicMaterial
                    color="#ffd23f"
                    transparent
                    opacity={0}
                    depthWrite={false}
                    blending={THREE.AdditiveBlending}
                    toneMapped={false}
                  />
                </mesh>
              </group>
            </group>
          </group>
        </group>

        <group ref={leftUpperLeg} position={[-0.14, 0.82, 0]} rotation={[0.06, 0, -0.24]}>
          <FacetedPart
            geometry={geometry.upperLeg}
            material={material.shorts}
            outlineMaterial={material.outline}
            position={[0, -0.215, 0]}
          />
          <group ref={leftLowerLeg} position={[0, -0.43, 0]} rotation={[-0.05, 0, 0.34]}>
            <FacetedPart
              geometry={geometry.lowerLeg}
              material={material.ivory}
              outlineMaterial={material.outline}
              position={[0, -0.21, 0]}
            />
            <mesh position={[0, -0.25, 0.09]}>
              <boxGeometry args={[0.12, 0.055, 0.16]} />
              <primitive object={material.coral} attach="material" />
            </mesh>
            <FacetedPart
              geometry={geometry.boot}
              material={material.boot}
              outlineMaterial={material.outline}
              position={[0, -0.44, 0.07]}
            />
          </group>
        </group>

        <group ref={rightUpperLeg} position={[0.14, 0.82, 0]} rotation={[0.06, 0, 0.24]}>
          <FacetedPart
            geometry={geometry.upperLeg}
            material={material.shorts}
            outlineMaterial={material.outline}
            position={[0, -0.215, 0]}
          />
          <group ref={rightLowerLeg} position={[0, -0.43, 0]} rotation={[-0.05, 0, -0.34]}>
            <FacetedPart
              geometry={geometry.lowerLeg}
              material={material.ivory}
              outlineMaterial={material.outline}
              position={[0, -0.21, 0]}
            />
            <mesh position={[0, -0.25, 0.09]}>
              <boxGeometry args={[0.12, 0.055, 0.16]} />
              <primitive object={material.coral} attach="material" />
            </mesh>
            <FacetedPart
              geometry={geometry.boot}
              material={material.boot}
              outlineMaterial={material.outline}
              position={[0, -0.44, 0.07]}
            />
          </group>
        </group>
      </group>
    </group>
  );
}

function Rain() {
  const {size} = useThree();
  const rendered = useMemo(() => {
    const count = size.width < 740 ? 2600 : 6200;
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.setIndex([0, 1, 2, 2, 1, 3]);
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([-0.008, 0, 0, 0.008, 0, 0, -0.008, 1, 0, 0.008, 1, 0], 3)
    );
    const bases = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    let value = 0x61c88647;
    const random = () => {
      value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
      return value / 0xffffffff;
    };
    for (let index = 0; index < count; index += 1) {
      bases[index * 3] = (random() - 0.5) * 38;
      bases[index * 3 + 1] = random() * 18;
      bases[index * 3 + 2] = (random() - 0.5) * 45 - 1;
      seeds[index] = random();
    }
    geometry.setAttribute('aBase', new THREE.InstancedBufferAttribute(bases, 3));
    geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
    geometry.instanceCount = count;
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 8, -1), 35);

    const uniforms = {
      uTime: new THREE.Uniform(0),
      uImpactAge: new THREE.Uniform(0),
      uImpactEnergy: new THREE.Uniform(0),
      uRainColor: new THREE.Uniform(new THREE.Color('#b8d9d3'))
    };
    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: RAIN_VERTEX,
      fragmentShader: RAIN_FRAGMENT,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      toneMapped: true
    });
    return {geometry, uniforms, material};
  }, [size.width]);

  useFrame((state) => {
    rendered.uniforms.uTime.value = state.clock.elapsedTime;
    rendered.uniforms.uImpactAge.value = frameRuntime.impactAge;
    rendered.uniforms.uImpactEnergy.value = frameRuntime.impactEnergy;
  });

  return <mesh geometry={rendered.geometry} material={rendered.material} frustumCulled={false} />;
}

function ShockRing() {
  const ring = useRef<THREE.Mesh>(null);
  useFrame(() => {
    if (!ring.current) return;
    const radius = frameRuntime.shockRadius;
    ring.current.position.set(frameRuntime.target.x, 0.025, frameRuntime.target.z);
    ring.current.scale.setScalar(Math.max(0.001, radius));
    const material = ring.current.material as THREE.MeshBasicMaterial;
    material.opacity = radius > 0 ? Math.max(0, 0.72 - radius / 21) : 0;
    ring.current.visible = radius > 0 && radius < 21;
  });
  return (
    <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
      <ringGeometry args={[0.96, 1.04, 96]} />
      <meshBasicMaterial
        color="#ff513d"
        transparent
        opacity={0}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

function StadiumArchitecture({variant}: {variant: Variant}) {
  const lights = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const accent = variant === 'B' ? '#46d7c7' : variant === 'C' ? '#d7a84f' : '#ff513d';

  useLayoutEffect(() => {
    const placements = [
      [-11.5, 8.6, -8.5, 0.18],
      [11.5, 8.6, -8.5, -0.18],
      [-12.5, 7.5, 6.4, 0.44],
      [12.5, 7.5, 6.4, -0.44]
    ];
    placements.forEach(([x, y, z, rz], index) => {
      dummy.position.set(x, y, z);
      dummy.rotation.set(-0.22, 0, rz);
      dummy.scale.set(2.8, 0.16, 0.34);
      dummy.updateMatrix();
      lights.current?.setMatrixAt(index, dummy.matrix);
    });
    if (lights.current) lights.current.instanceMatrix.needsUpdate = true;
  }, [dummy]);

  return (
    <group position={[0, 0, -1.1]}>
      <mesh position={[0, 2.7, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[1, 0.77, 1]}>
        <torusGeometry args={[15.6, 0.3, 8, 128]} />
        <meshStandardMaterial color="#101d22" metalness={0.38} roughness={0.62} />
      </mesh>
      <mesh position={[0, 6.6, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[1, 0.77, 1]}>
        <torusGeometry args={[17.15, 0.16, 6, 128]} />
        <meshBasicMaterial color={accent} toneMapped={false} />
      </mesh>
      <mesh position={[0, 8.65, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[1, 0.77, 1]}>
        <torusGeometry args={[17.9, 0.055, 5, 128]} />
        <meshBasicMaterial color="#f2edd8" transparent opacity={0.5} toneMapped={false} />
      </mesh>
      <instancedMesh ref={lights} args={[undefined, undefined, 4]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial color="#f7f2d7" toneMapped={false} />
      </instancedMesh>
    </group>
  );
}

function SkyDome({variant}: {variant: Variant}) {
  const color = variant === 'B' ? '#071a20' : variant === 'C' ? '#16140e' : '#091319';
  return (
    <mesh scale={52}>
      <sphereGeometry args={[1, 32, 18]} />
      <meshBasicMaterial color={color} side={THREE.BackSide} fog={false} />
    </mesh>
  );
}

export function StadiumEnvironment({variant}: {variant: Variant}) {
  return (
    <group>
      <SkyDome variant={variant} />
      <StadiumArchitecture variant={variant} />
      <Pitch />
      <GoalFrame />
      <GoalTargetGuide />
      <Goalkeeper />
      <BallAndTrace />
      <ShockRing />
      <Rain />
    </group>
  );
}
