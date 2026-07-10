import {create} from 'zustand';

export type Variant = 'A' | 'B' | 'C';
export type Phase = 'ready' | 'charging' | 'contact' | 'flight' | 'impact' | 'aftermath';
export type ImpactKind = 'post' | 'bar' | 'goal' | 'save';
export type ShotStyle = 'power' | 'curve' | 'chip';
export type ShotWindowState = 'low' | 'ready' | 'over' | 'offTarget';

export type ShotReason =
  | 'outside-post'
  | 'over-crossbar'
  | 'keeper-read-repeat'
  | 'power-too-soft'
  | 'power-not-low-corner'
  | 'curve-too-soft'
  | 'curve-not-wide-corner'
  | 'chip-too-soft'
  | 'chip-too-hard'
  | 'chip-not-central'
  | 'clean-finish';

export type Aim = {
  x: number;
  y: number;
};

export type ShotRecord = {
  aim: Aim;
  charge: number;
  shotStyle: ShotStyle;
  impactKind: ImpactKind;
  reason: ShotReason;
  planRepeated: boolean;
};

export type ShotResolution = {
  impactKind: ImpactKind;
  reason: ShotReason;
  planRepeated: boolean;
};

/** Shared source of truth for gameplay, live charge feedback, and target art. */
export const SHOT_WINDOWS = {
  power: {charge: [0.64, 1], absX: [0.56, 0.79], y: [0.06, 0.4]},
  curve: {charge: [0.52, 1], absX: [0.59, 0.8], y: [0.28, 0.68]},
  chip: {charge: [0.45, 0.78], absX: [0, 0.22], y: [0.3, 0.65]}
} as const satisfies Record<
  ShotStyle,
  {charge: readonly [number, number]; absX: readonly [number, number]; y: readonly [number, number]}
>;

type ExperienceState = {
  phase: Phase;
  phaseStartedAt: number;
  chargeStartedAt: number;
  charge: number;
  aim: Aim;
  attempt: number;
  impactKind: ImpactKind;
  shotStyle: ShotStyle;
  keeperSaves: number;
  goals: number;
  previousAim: Aim | null;
  previousShotStyle: ShotStyle | null;
  planRepeated: boolean;
  resolutionReason: ShotReason;
  roundShots: ShotRecord[];
  muted: boolean;
  beginCharge: () => void;
  updateGesture: (aim: Aim, charge: number) => void;
  release: (aim: Aim, charge: number) => void;
  enterPhase: (phase: Phase, impactKind?: ImpactKind) => void;
  reset: () => void;
  restartRound: () => void;
  selectShotStyle: (shotStyle: ShotStyle) => void;
  setMuted: (muted: boolean) => void;
};

const now = () => performance.now();

/**
 * Readable, deterministic rules make every miss correctable. Power belongs in
 * a low side-net window, curve needs a wide corner, and chip needs controlled
 * weight through the central lane.
 */
function shotSide(aim: Aim) {
  // Every successful chip counts as the same central plan. Nudging a repeat a
  // few pixels sideways cannot bypass the keeper's memory.
  return aim.x < -0.26 ? -1 : aim.x > 0.26 ? 1 : 0;
}

function inRange(value: number, range: readonly [number, number]) {
  return value >= range[0] && value <= range[1];
}

/** Pure live-feedback rule: safe for App/UI to call on every gesture frame. */
export function getShotWindowState(
  aim: Aim,
  charge: number,
  shotStyle: ShotStyle
): ShotWindowState {
  if (Math.abs(aim.x) > 0.82 || aim.y > 0.79) return 'offTarget';

  const window = SHOT_WINDOWS[shotStyle];
  const aimedInsideWindow =
    inRange(Math.abs(aim.x), window.absX) && inRange(aim.y, window.y);
  if (!aimedInsideWindow) return 'offTarget';
  if (charge < window.charge[0]) return 'low';
  if (charge > window.charge[1]) return 'over';
  return 'ready';
}

export function resolveShot(
  aim: Aim,
  charge: number,
  shotStyle: ShotStyle,
  previousAim: Aim | null = null,
  previousShotStyle: ShotStyle | null = null
): ShotResolution {
  const repeatedPlan =
    previousAim !== null &&
    previousShotStyle === shotStyle &&
    shotSide(previousAim) === shotSide(aim);

  // The frame wins before the keeper does: an obviously off-target swipe must
  // still sound and look like the post/bar even when its plan was repeated.
  if (Math.abs(aim.x) > 0.82) {
    return {impactKind: 'post', reason: 'outside-post', planRepeated: repeatedPlan};
  }
  if (aim.y > 0.79) {
    return {impactKind: 'bar', reason: 'over-crossbar', planRepeated: repeatedPlan};
  }
  if (repeatedPlan) {
    return {impactKind: 'save', reason: 'keeper-read-repeat', planRepeated: true};
  }

  const windowState = getShotWindowState(aim, charge, shotStyle);
  if (windowState === 'ready') {
    return {impactKind: 'goal', reason: 'clean-finish', planRepeated: false};
  }

  if (shotStyle === 'power') {
    return {
      impactKind: 'save',
      reason: windowState === 'low' ? 'power-too-soft' : 'power-not-low-corner',
      planRepeated: false
    };
  }
  if (shotStyle === 'curve') {
    return {
      impactKind: 'save',
      reason: windowState === 'low' ? 'curve-too-soft' : 'curve-not-wide-corner',
      planRepeated: false
    };
  }
  return {
    impactKind: 'save',
    reason:
      windowState === 'low'
        ? 'chip-too-soft'
        : windowState === 'over'
          ? 'chip-too-hard'
          : 'chip-not-central',
    planRepeated: false
  };
}

export function resolveImpact(
  aim: Aim,
  charge: number,
  shotStyle: ShotStyle,
  previousAim: Aim | null = null,
  previousShotStyle: ShotStyle | null = null
): ImpactKind {
  return resolveShot(aim, charge, shotStyle, previousAim, previousShotStyle).impactKind;
}

export const useExperienceStore = create<ExperienceState>((set, get) => ({
  phase: 'ready',
  phaseStartedAt: now(),
  chargeStartedAt: 0,
  charge: 0,
  aim: {x: 0, y: 0.34},
  attempt: 0,
  impactKind: 'post',
  shotStyle: 'power',
  keeperSaves: 8,
  goals: 0,
  previousAim: null,
  previousShotStyle: null,
  planRepeated: false,
  resolutionReason: 'outside-post',
  roundShots: [],
  muted: false,
  beginCharge: () => {
    if (get().phase !== 'ready') return;
    set({
      phase: 'charging',
      phaseStartedAt: now(),
      chargeStartedAt: now(),
      charge: 0.28
    });
  },
  updateGesture: (aim, charge) => {
    if (get().phase !== 'charging') return;
    set({aim, charge});
  },
  release: (aim, charge) => {
    if (get().phase !== 'charging') return;
    const current = get();
    const resolution = resolveShot(
      aim,
      charge,
      current.shotStyle,
      current.previousAim,
      current.previousShotStyle
    );
    set((state) => ({
      phase: 'contact',
      phaseStartedAt: now(),
      aim,
      charge,
      impactKind: resolution.impactKind,
      previousAim: {...aim},
      previousShotStyle: state.shotStyle,
      planRepeated: resolution.planRepeated,
      resolutionReason: resolution.reason,
      roundShots: [
        ...state.roundShots,
        {
          aim: {...aim},
          charge,
          shotStyle: state.shotStyle,
          impactKind: resolution.impactKind,
          reason: resolution.reason,
          planRepeated: resolution.planRepeated
        }
      ]
    }));
  },
  enterPhase: (phase, impactKind) =>
    set((state) => ({
      phase,
      phaseStartedAt: now(),
      ...(impactKind ? {impactKind} : {}),
      keeperSaves:
        state.keeperSaves + (phase === 'impact' && state.impactKind === 'save' ? 1 : 0),
      goals: state.goals + (phase === 'impact' && state.impactKind === 'goal' ? 1 : 0)
    })),
  reset: () => {
    if (get().roundShots.length >= 3) return;
    set((state) => ({
      phase: 'ready',
      phaseStartedAt: now(),
      chargeStartedAt: 0,
      charge: 0,
      aim: {x: 0, y: 0.34},
      attempt: state.attempt + 1,
      planRepeated: false
    }));
  },
  restartRound: () =>
    set({
      phase: 'ready',
      phaseStartedAt: now(),
      chargeStartedAt: 0,
      charge: 0,
      aim: {x: 0, y: 0.34},
      attempt: 0,
      impactKind: 'post',
      shotStyle: 'power',
      keeperSaves: 8,
      goals: 0,
      previousAim: null,
      previousShotStyle: null,
      planRepeated: false,
      resolutionReason: 'outside-post',
      roundShots: []
    }),
  selectShotStyle: (shotStyle) => {
    if (get().phase !== 'ready') return;
    set({shotStyle});
  },
  setMuted: (muted) => set({muted})
}));
