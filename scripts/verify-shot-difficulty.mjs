import assert from 'node:assert/strict';
import {
  getShotWindowState,
  resolveImpact,
  resolveShot,
  SHOT_WINDOWS
} from '../src/experience/store.ts';

const expectResolution = (input, expectedImpact, expectedReason) => {
  const result = resolveShot(
    input.aim,
    input.charge,
    input.style,
    input.previousAim ?? null,
    input.previousStyle ?? null
  );
  assert.equal(result.impactKind, expectedImpact, `${input.label}: impact`);
  assert.equal(result.reason, expectedReason, `${input.label}: reason`);
  return result;
};

expectResolution(
  {label: 'power sweet spot', aim: {x: 0.68, y: 0.22}, charge: 0.72, style: 'power'},
  'goal',
  'clean-finish'
);
expectResolution(
  {label: 'curve sweet spot', aim: {x: -0.7, y: 0.48}, charge: 0.64, style: 'curve'},
  'goal',
  'clean-finish'
);
expectResolution(
  {label: 'chip sweet spot', aim: {x: 0.04, y: 0.46}, charge: 0.6, style: 'chip'},
  'goal',
  'clean-finish'
);
expectResolution(
  {label: 'soft power', aim: {x: 0.68, y: 0.22}, charge: 0.63, style: 'power'},
  'save',
  'power-too-soft'
);
expectResolution(
  {label: 'central power', aim: {x: 0.3, y: 0.22}, charge: 0.8, style: 'power'},
  'save',
  'power-not-low-corner'
);
expectResolution(
  {label: 'overhit chip', aim: {x: 0, y: 0.46}, charge: 0.79, style: 'chip'},
  'save',
  'chip-too-hard'
);

const repeated = expectResolution(
  {
    label: 'keeper reads repeated side and style',
    aim: {x: 0.7, y: 0.48},
    charge: 0.7,
    style: 'curve',
    previousAim: {x: 0.68, y: 0.42},
    previousStyle: 'curve'
  },
  'save',
  'keeper-read-repeat'
);
assert.equal(repeated.planRepeated, true);

expectResolution(
  {
    label: 'switching side beats memory',
    aim: {x: -0.7, y: 0.48},
    charge: 0.7,
    style: 'curve',
    previousAim: {x: 0.68, y: 0.42},
    previousStyle: 'curve'
  },
  'goal',
  'clean-finish'
);
expectResolution(
  {
    label: 'all successful chips count as one central plan',
    aim: {x: -0.2, y: 0.48},
    charge: 0.62,
    style: 'chip',
    previousAim: {x: 0.2, y: 0.44},
    previousStyle: 'chip'
  },
  'save',
  'keeper-read-repeat'
);
expectResolution(
  {
    label: 'frame takes precedence over memory',
    aim: {x: 0.9, y: 0.4},
    charge: 0.8,
    style: 'power',
    previousAim: {x: 0.7, y: 0.2},
    previousStyle: 'power'
  },
  'post',
  'outside-post'
);

assert.equal(getShotWindowState({x: 0.68, y: 0.22}, 0.6, 'power'), 'low');
assert.equal(getShotWindowState({x: 0.68, y: 0.22}, 0.72, 'power'), 'ready');
assert.equal(getShotWindowState({x: 0, y: 0.46}, 0.8, 'chip'), 'over');
assert.equal(getShotWindowState({x: 0.2, y: 0.2}, 0.8, 'power'), 'offTarget');
assert.equal(SHOT_WINDOWS.power.charge[0], 0.64);

for (let index = 0; index < 100; index += 1) {
  assert.equal(
    resolveImpact({x: -0.7, y: 0.48}, 0.64, 'curve'),
    'goal',
    'same input must always produce the same result'
  );
}

const linspace = (start, end, steps = 61) =>
  Array.from({length: steps}, (_, index) => start + ((end - start) * index) / (steps - 1));

const sampleCorridor = ({style, xRanges, y, charge}) => {
  let goals = 0;
  let samples = 0;
  for (const xRange of xRanges) {
    for (const x of linspace(...xRange)) {
      for (const aimY of linspace(...y)) {
        for (const shotCharge of linspace(...charge)) {
          samples += 1;
          if (resolveImpact({x, y: aimY}, shotCharge, style) === 'goal') goals += 1;
        }
      }
    }
  }
  return {goals, samples, ratio: goals / samples};
};

// Fixed calibration corridors, not runtime randomness. "Skilled" models a
// deliberate swipe around the glowing guide; "novice" is a much looser swipe.
const skilledCorridors = [
  {style: 'power', xRanges: [[-0.82, -0.42], [0.42, 0.82]], y: [0, 0.52], charge: [0.54, 0.98]},
  {style: 'curve', xRanges: [[-0.82, -0.46], [0.46, 0.82]], y: [0.18, 0.76], charge: [0.42, 0.94]},
  {style: 'chip', xRanges: [[-0.36, 0.36]], y: [0.22, 0.74], charge: [0.34, 0.84]}
];

const noviceCorridors = [
  {style: 'power', xRanges: [[-0.82, -0.25], [0.25, 0.82]], y: [0, 0.6], charge: [0.4, 0.98]},
  {style: 'curve', xRanges: [[-0.82, -0.3], [0.3, 0.82]], y: [0.1, 0.78], charge: [0.35, 0.98]},
  {style: 'chip', xRanges: [[-0.5, 0.5]], y: [0.1, 0.8], charge: [0.3, 0.9]}
];

const skilled = skilledCorridors.map(sampleCorridor);
const novice = noviceCorridors.map(sampleCorridor);
for (const [index, result] of skilled.entries()) {
  const style = skilledCorridors[index].style;
  assert.ok(
    result.ratio >= 0.25 && result.ratio <= 0.35,
    `${style} skilled corridor must stay within 25–35%, got ${(result.ratio * 100).toFixed(1)}%`
  );
}

const noviceSingleKick = novice.reduce((sum, result) => sum + result.ratio, 0) / novice.length;
const noviceZeroOrOneInThree =
  Math.pow(1 - noviceSingleKick, 3) +
  3 * noviceSingleKick * Math.pow(1 - noviceSingleKick, 2);
assert.ok(noviceSingleKick >= 0.1 && noviceSingleKick <= 0.2);
assert.ok(noviceZeroOrOneInThree >= 0.85);

console.table(
  skilled.map((result, index) => ({
    style: skilledCorridors[index].style,
    skilledGoalSpace: `${(result.ratio * 100).toFixed(1)}%`,
    noviceGoalSpace: `${(novice[index].ratio * 100).toFixed(1)}%`
  }))
);
console.log(
  `Novice model: ${(noviceSingleKick * 100).toFixed(1)}% per kick; ` +
    `${(noviceZeroOrOneInThree * 100).toFixed(1)}% chance of 0–1 goals in three kicks.`
);
console.log('Difficulty rules verified: deterministic, explainable, and memory-aware.');
