import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent
} from 'react';
import {lastKickAudio} from './audio/LastKickAudio';
import {
  SHOT_STYLES,
  UI,
  impactLabel,
  momentCopy,
  type Language
} from './experience/copy';
import {
  getShotWindowState,
  useExperienceStore,
  type Aim,
  type ImpactKind,
  type ShotStyle,
  type Variant
} from './experience/store';
import {createShotCard} from './share/createShotCard';
import {StadiumCanvas} from './scene/StadiumCanvas';

const VARIANTS: Array<{id: Variant; name: string; count: string}> = [
  {id: 'A', name: 'FOLDED NATION', count: '11,484 FOLDS'},
  {id: 'B', name: 'SIGNAL CHOIR', count: '10,560 SIGNALS'},
  {id: 'C', name: 'PAPER FLOCK', count: '10,710 WINGS'}
];

const CASE_STUDY_URL =
  'https://01mvp.com/docs/cases/last-kick-gpt56?utm_source=lastkick&utm_medium=game&utm_campaign=gpt56-case';
const COMMUNITY_QR_URL = 'https://01mvp.com/01mvp-usergroup.webp';

function readVariant(): Variant {
  const value = new URLSearchParams(window.location.search).get('variant');
  return value === 'B' || value === 'C' ? value : 'A';
}

function initialLanguage(): Language {
  try {
    const saved = window.localStorage.getItem('lastkick.language');
    if (saved === 'zh' || saved === 'en') return saved;
  } catch {
    // Storage can be unavailable in private embedded contexts.
  }
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

function initialTutorialSeen() {
  try {
    return window.localStorage.getItem('lastkick.tutorialSeen') === '1';
  } catch {
    return false;
  }
}

function initialIntroOpen() {
  const mode = new URLSearchParams(window.location.search).get('intro');
  if (mode === '1') return true;
  if (mode === '0') return false;
  try {
    return window.sessionStorage.getItem('lastkick.introSeen') !== '1';
  } catch {
    return true;
  }
}

function shaped(value: number) {
  const n = Math.max(-1, Math.min(1, value));
  return 0.72 * n + 0.28 * n * n * n;
}

function chargeFromAge(ageMs: number) {
  const u = Math.max(0, Math.min(1, ageMs / 1250));
  if (u >= 1) return 0.98 + Math.sin(ageMs / 98) * 0.02;
  return 0.28 + 0.72 * (1 - Math.pow(1 - u, 2.2));
}

type Gesture = {
  active: boolean;
  pointerId: number;
  downX: number;
  downY: number;
  x: number;
  y: number;
  startedAt: number;
  aim: Aim;
  charge: number;
  raf: number;
};

const initialGesture = (): Gesture => ({
  active: false,
  pointerId: -1,
  downX: 0,
  downY: 0,
  x: 0,
  y: 0,
  startedAt: 0,
  aim: {x: 0, y: 0.34},
  charge: 0.28,
  raf: 0
});

function resultMark(kind: ImpactKind) {
  if (kind === 'goal') return 'G';
  if (kind === 'save') return 'S';
  if (kind === 'post') return 'P';
  return 'B';
}

export function App() {
  const [variant, setVariant] = useState<Variant>(readVariant);
  const [language, setLanguageState] = useState<Language>(initialLanguage);
  const [tutorialSeen, setTutorialSeen] = useState(initialTutorialSeen);
  const [introOpen, setIntroOpen] = useState(initialIntroOpen);
  const [helpOpen, setHelpOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [communityOpen, setCommunityOpen] = useState(false);
  const [communityQrFailed, setCommunityQrFailed] = useState(false);
  const [caseCtaDismissed, setCaseCtaDismissed] = useState(false);
  const [shareStatus, setShareStatus] = useState('');
  const [shareCard, setShareCard] = useState<Blob | null>(null);
  const [shareCardUrl, setShareCardUrl] = useState('');
  const gesture = useRef<Gesture>(initialGesture());
  const communityCloseRef = useRef<HTMLButtonElement>(null);

  const phase = useExperienceStore((state) => state.phase);
  const charge = useExperienceStore((state) => state.charge);
  const aim = useExperienceStore((state) => state.aim);
  const attempt = useExperienceStore((state) => state.attempt);
  const impactKind = useExperienceStore((state) => state.impactKind);
  const shotStyle = useExperienceStore((state) => state.shotStyle);
  const keeperSaves = useExperienceStore((state) => state.keeperSaves);
  const goals = useExperienceStore((state) => state.goals);
  const previousAim = useExperienceStore((state) => state.previousAim);
  const muted = useExperienceStore((state) => state.muted);
  const roundShots = useExperienceStore((state) => state.roundShots);

  const clean = useMemo(
    () => new URLSearchParams(window.location.search).get('clean') === '1',
    []
  );
  const lab = useMemo(
    () => new URLSearchParams(window.location.search).get('lab') === '1',
    []
  );
  const text = UI[language];
  const roundComplete = phase === 'aftermath' && roundShots.length >= 3;
  const tutorialFirstShot = !tutorialSeen && roundShots.length === 0;
  const currentKick = Math.max(
    1,
    Math.min(3, roundShots.length + (phase === 'ready' || phase === 'charging' ? 1 : 0))
  );
  const activeShot = SHOT_STYLES.find((item) => item.id === shotStyle) ?? SHOT_STYLES[0];
  const copy = momentCopy({
    phase,
    impactKind,
    shotStyle,
    roundShots,
    goals,
    language
  });
  const hasDragged = Math.abs(aim.x) > 0.075 || Math.abs(aim.y - 0.34) > 0.075;
  const shotWindow = getShotWindowState(aim, charge, shotStyle);
  const coachAction =
    phase === 'ready'
      ? text.hold
      : shotWindow === 'ready'
        ? text.chargeSweet
        : shotWindow === 'over'
          ? text.chargeOver
          : shotWindow === 'low' && hasDragged
            ? text.chargeLow
            : hasDragged
              ? text.aimWindow
              : text.drag;

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next);
    try {
      window.localStorage.setItem('lastkick.language', next);
    } catch {
      // Keep the in-memory choice when persistence is unavailable.
    }
  }, []);

  const clearShare = useCallback(() => {
    setShareStatus('');
    setShareCard(null);
    setShareOpen(false);
  }, []);

  const selectVariant = useCallback(
    (next: Variant) => {
      gesture.current.active = false;
      if (gesture.current.raf) cancelAnimationFrame(gesture.current.raf);
      gesture.current.raf = 0;
      setVariant(next);
      setCaseCtaDismissed(false);
      setCommunityOpen(false);
      clearShare();
      const url = new URL(window.location.href);
      url.searchParams.set('variant', next);
      window.history.replaceState({}, '', url);
      useExperienceStore.getState().restartRound();
      lastKickAudio.reset();
    },
    [clearShare]
  );

  useEffect(() => {
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
  }, [language]);

  useEffect(() => {
    if (phase !== 'aftermath' || roundShots.length === 0 || tutorialSeen) return;
    setTutorialSeen(true);
    try {
      window.localStorage.setItem('lastkick.tutorialSeen', '1');
    } catch {
      // The progressive tutorial still works for the current session.
    }
  }, [phase, roundShots.length, tutorialSeen]);

  useEffect(() => {
    const onPopState = () => setVariant(readVariant());
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.matches('input, textarea, select, [contenteditable="true"]') ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey
      ) {
        return;
      }

      if (event.key === 'Escape') {
        setHelpOpen(false);
        setShareOpen(false);
        setCommunityOpen(false);
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        const current = VARIANTS.findIndex((item) => item.id === readVariant());
        const direction = event.key === 'ArrowRight' ? 1 : -1;
        selectVariant(VARIANTS[(current + direction + VARIANTS.length) % VARIANTS.length].id);
      }
      if (event.key.toLowerCase() === 'r' && useExperienceStore.getState().phase === 'aftermath') {
        clearShare();
        setCaseCtaDismissed(false);
        setCommunityOpen(false);
        const state = useExperienceStore.getState();
        if (state.roundShots.length >= 3) state.restartRound();
        else state.reset();
        lastKickAudio.reset();
      }
      const styleIndex = Number(event.key) - 1;
      if (
        useExperienceStore.getState().phase === 'ready' &&
        styleIndex >= 0 &&
        styleIndex < SHOT_STYLES.length
      ) {
        useExperienceStore.getState().selectShotStyle(SHOT_STYLES[styleIndex].id);
      }
    };
    window.addEventListener('popstate', onPopState);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('popstate', onPopState);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [clearShare, selectVariant]);

  useEffect(() => {
    if (!communityOpen) return;
    communityCloseRef.current?.focus();
  }, [communityOpen]);

  useEffect(() => {
    if (phase === 'impact') lastKickAudio.impact(impactKind);
  }, [impactKind, phase]);

  useEffect(() => {
    if (phase !== 'aftermath') {
      setShareCard(null);
      setShareOpen(false);
      return;
    }

    let cancelled = false;
    setShareCard(null);
    const timer = window.setTimeout(() => {
      const source = document.querySelector('.experience canvas');
      if (!(source instanceof HTMLCanvasElement)) return;

      void createShotCard({
        source,
        impactKind,
        shotStyle,
        charge,
        attempt: attempt + 1,
        keeperSaves,
        goals,
        roundShots,
        language
      })
        .then((blob) => {
          if (!cancelled) setShareCard(blob);
        })
        .catch(() => {
          if (!cancelled) setShareStatus(text.cardFailed);
        });
    }, 1050);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [attempt, charge, goals, impactKind, keeperSaves, language, phase, roundShots, shotStyle, text.cardFailed]);

  useEffect(() => {
    if (!shareCard) {
      setShareCardUrl('');
      return;
    }
    const objectUrl = URL.createObjectURL(shareCard);
    setShareCardUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [shareCard]);

  useEffect(
    () => () => {
      if (gesture.current.raf) cancelAnimationFrame(gesture.current.raf);
      lastKickAudio.dispose();
    },
    []
  );

  const updateAim = useCallback((clientX: number, clientY: number) => {
    const current = gesture.current;
    current.x = clientX;
    current.y = clientY;
    const unit = Math.min(window.innerWidth, 480);
    const nx = (clientX - current.downX) / Math.max(96, unit * 0.3);
    const ny = (current.downY - clientY) / Math.max(112, window.innerHeight * 0.19);
    current.aim = {
      x: Math.max(-1, Math.min(1, shaped(nx))),
      y: Math.max(0, Math.min(1, 0.34 + shaped(ny) * 0.66))
    };
  }, []);

  const tickCharge = useCallback(() => {
    const current = gesture.current;
    if (!current.active) return;
    current.charge = chargeFromAge(performance.now() - current.startedAt);
    useExperienceStore.getState().updateGesture(current.aim, current.charge);
    lastKickAudio.setCharge(current.charge);
    current.raf = requestAnimationFrame(tickCharge);
  }, []);

  const finishGesture = useCallback((pointerId?: number) => {
    const current = gesture.current;
    if (!current.active || (pointerId !== undefined && pointerId !== current.pointerId)) return;
    current.active = false;
    if (current.raf) cancelAnimationFrame(current.raf);
    current.raf = 0;
    useExperienceStore.getState().release(current.aim, current.charge);
    lastKickAudio.release(current.charge, useExperienceStore.getState().shotStyle);
  }, []);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if ((event.target as HTMLElement).closest('[data-ui]')) return;
      if (introOpen) return;
      if (phase !== 'ready') return;

      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      const current = gesture.current;
      current.active = true;
      current.pointerId = event.pointerId;
      current.downX = event.clientX;
      current.downY = event.clientY;
      current.x = event.clientX;
      current.y = event.clientY;
      current.startedAt = performance.now();
      current.aim = {x: 0, y: 0.34};
      current.charge = 0.28;
      void lastKickAudio.unlock();
      useExperienceStore.getState().beginCharge();
      lastKickAudio.setCharge(0.28);
      current.raf = requestAnimationFrame(tickCharge);
    },
    [introOpen, phase, tickCharge]
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!gesture.current.active || event.pointerId !== gesture.current.pointerId) return;
      event.preventDefault();
      updateAim(event.clientX, event.clientY);
      useExperienceStore.getState().updateGesture(gesture.current.aim, gesture.current.charge);
    },
    [updateAim]
  );

  const toggleMute = useCallback(() => {
    const next = !muted;
    if (!next) void lastKickAudio.unlock();
    useExperienceStore.getState().setMuted(next);
    lastKickAudio.setMuted(next);
  }, [muted]);

  const selectShotStyle = useCallback((next: ShotStyle) => {
    void lastKickAudio.unlock();
    useExperienceStore.getState().selectShotStyle(next);
  }, []);

  const enterChallenge = useCallback(() => {
    try {
      window.sessionStorage.setItem('lastkick.introSeen', '1');
    } catch {
      // The opening still works when session storage is unavailable.
    }
    setIntroOpen(false);
    void lastKickAudio.introSting();
  }, []);

  const continueRound = useCallback(() => {
    clearShare();
    setCaseCtaDismissed(false);
    setCommunityOpen(false);
    const state = useExperienceStore.getState();
    if (state.roundShots.length >= 3) state.restartRound();
    else state.reset();
    lastKickAudio.reset();
  }, [clearShare]);

  const shareUrl = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete('clean');
    url.searchParams.delete('lab');
    url.searchParams.delete('variant');
    url.searchParams.set('challenge', 'vozinha');
    return url.toString();
  }, []);

  const shareText = useCallback(() => {
    if (language === 'zh') {
      if (roundComplete) {
        return `我用三脚挑战 40 岁的佛得角门神 Vozinha，进了 ${goals} 个。你能过这堵墙吗？\n${shareUrl()}`;
      }
      return `我用${activeShot.label.zh}挑战 Vozinha：${impactLabel(impactKind, 'zh')}。轮到你了。\n${shareUrl()}`;
    }
    if (roundComplete) {
      return `I took three kicks against Cabo Verde keeper Vozinha and scored ${goals}. Can you beat the wall?\n${shareUrl()}`;
    }
    return `I challenged Vozinha with a ${activeShot.label.en.toLowerCase()} shot: ${impactLabel(impactKind, 'en')}. Your turn.\n${shareUrl()}`;
  }, [activeShot.label.en, activeShot.label.zh, goals, impactKind, language, roundComplete, shareUrl]);

  const saveResult = useCallback(() => {
    if (!shareCard || !shareCardUrl) return;
    const download = document.createElement('a');
    download.href = shareCardUrl;
    download.download = `last-kick-${roundComplete ? `3-kicks-${goals}-goals` : `kick-${attempt + 1}`}.png`;
    download.click();
    setShareStatus(text.downloaded);
  }, [attempt, goals, roundComplete, shareCard, shareCardUrl, text.downloaded]);

  const shareResult = useCallback(async () => {
    if (!shareCard) return;
    const file = new File(
      [shareCard],
      `last-kick-${roundComplete ? `3-kicks-${goals}-goals` : `kick-${attempt + 1}`}.png`,
      {type: 'image/png'}
    );
    const payloadText = shareText();
    const canShareFile = Boolean(navigator.canShare?.({files: [file]}));

    try {
      if (navigator.share) {
        await navigator.share({
          title: language === 'zh' ? '最后一脚 · 挑战 Vozinha' : 'The Last Kick · Beat Vozinha',
          text: payloadText,
          ...(canShareFile ? {files: [file]} : {})
        });
        setShareStatus(text.shared);
        return;
      }
      await navigator.clipboard.writeText(payloadText);
      setShareStatus(text.copied);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setShareStatus(text.shareFailed);
    }
  }, [attempt, goals, language, roundComplete, shareCard, shareText, text.copied, text.shareFailed, text.shared]);

  const displayAim = aim;
  const visualStyle = {
    '--charge': charge.toFixed(3),
    '--charge-offset': (339.292 * (1 - charge)).toFixed(2),
    '--aim-left': `${50 + displayAim.x * 21}%`,
    '--aim-top': `${45 - displayAim.y * 18}%`,
    '--memory-aim-left': `${50 + (previousAim?.x ?? 0) * 21}%`,
    '--memory-aim-top': `${45 - (previousAim?.y ?? 0.34) * 18}%`
  } as CSSProperties;

  return (
    <main
      className="experience"
      data-phase={phase}
      data-variant={variant}
      data-shot={shotStyle}
      data-impact={impactKind}
      data-tutorial={tutorialFirstShot ? 'first' : 'seen'}
      data-intro={introOpen ? 'open' : 'closed'}
      data-window={shotWindow}
      data-postmatch={roundComplete && !caseCtaDismissed ? 'open' : 'closed'}
      style={visualStyle}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(event) => finishGesture(event.pointerId)}
      onPointerCancel={(event) => finishGesture(event.pointerId)}
      onLostPointerCapture={(event) => finishGesture(event.pointerId)}
      onContextMenu={(event) => event.preventDefault()}
      aria-label={text.ariaGame}
    >
      <StadiumCanvas variant={variant} />

      <div className="grain" aria-hidden="true" />
      <div className="contact-wipe" aria-hidden="true" />
      <div className="impact-flash" aria-hidden="true" />

      {introOpen ? (
        <div
          className="kickoff-intro"
          data-ui
          role="dialog"
          aria-modal="true"
          aria-labelledby="kickoff-intro-title"
        >
          <div className="kickoff-intro__shutter kickoff-intro__shutter--top" aria-hidden="true" />
          <div className="kickoff-intro__shutter kickoff-intro__shutter--bottom" aria-hidden="true" />
          <section className="kickoff-intro__stage">
            <header>
              <span>{text.introKicker}</span>
              <div className="language-toggle kickoff-intro__language" aria-label="Language / 语言">
                <button type="button" className={language === 'zh' ? 'is-active' : ''} onClick={() => setLanguage('zh')}>中</button>
                <button type="button" className={language === 'en' ? 'is-active' : ''} onClick={() => setLanguage('en')}>EN</button>
              </div>
            </header>

            <div className="kickoff-intro__clock" aria-label="120 minutes">120:00</div>
            <div className="kickoff-intro__score" aria-label="Cabo Verde one, challenger one">
              <span>CABO VERDE</span><b>1</b><i>—</i><b>1</b><span>YOU</span>
            </div>

            <div className="kickoff-intro__hero">
              <strong aria-hidden="true">03</strong>
              <div>
                <span>THE LAST THREE</span>
                <h1 id="kickoff-intro-title">{text.introTitle}</h1>
                <p>{text.introLead}</p>
              </div>
            </div>

            <ul className="kickoff-intro__rules" aria-label="Challenge rules">
              <li><b>01</b><span>{text.introShots}</span></li>
              <li><b>02</b><span>{text.introMemory}</span></li>
              <li><b>03</b><span>{text.introWall}</span></li>
            </ul>

            <button className="kickoff-intro__start" type="button" onClick={enterChallenge}>
              <span>{text.introStart}</span><i aria-hidden="true">→</i>
            </button>
            <small>{text.introSound}</small>
          </section>
        </div>
      ) : null}

      <header className="broadcast-hud" data-ui>
        <div className="match-label">
          <span>WORLD CUP · 119:00</span>
          <strong>CABO VERDE</strong>
        </div>
        <div className="score" aria-label={`${1 + goals} — 1`}>
          <span>{1 + goals}</span><i>—</i><span>1</span>
        </div>
        <div className="hud-actions">
          <div className="keeper-stat" aria-label={`Vozinha · ${keeperSaves} saves`}>
            <span>VOZINHA · 40</span>
            <strong>{keeperSaves} SAVES</strong>
          </div>
          <div className="language-toggle" aria-label="Language / 语言">
            <button type="button" className={language === 'zh' ? 'is-active' : ''} onClick={() => setLanguage('zh')}>中</button>
            <button type="button" className={language === 'en' ? 'is-active' : ''} onClick={() => setLanguage('en')}>EN</button>
          </div>
          <button className="help-toggle" type="button" onClick={() => setHelpOpen(true)} aria-label={text.help}>?</button>
          <button className="sound-toggle" type="button" onClick={toggleMute} aria-label={muted ? text.unmute : text.mute}>
            <span>{muted ? text.soundOff : text.soundOn}</span>
            <i aria-hidden="true">{muted ? '×' : '◖'}</i>
          </button>
        </div>
      </header>

      <section className="round-progress" data-ui aria-label={`${text.roundRule}: ${currentKick} / 3`}>
        <div>
          <span>{text.roundRule}</span>
          <b>{language === 'zh' ? `第 ${currentKick} / 3 脚` : `KICK ${currentKick} / 3`}</b>
        </div>
        <ol>
          {[0, 1, 2].map((index) => {
            const record = roundShots[index];
            const unresolvedCurrent =
              index === roundShots.length - 1 && (phase === 'contact' || phase === 'flight');
            const resolved = Boolean(record) && !unresolvedCurrent;
            const active =
              (!roundComplete && phase === 'ready' && index === roundShots.length) ||
              (unresolvedCurrent && index === roundShots.length - 1);
            return (
              <li
                key={index}
                className={`${resolved ? `is-${record.impactKind}` : ''} ${active ? 'is-active' : ''}`}
                aria-label={resolved ? impactLabel(record.impactKind, language) : `${index + 1}`}
              >
                <i>{resolved ? resultMark(record.impactKind) : index + 1}</i>
              </li>
            );
          })}
        </ol>
        <small>{text.scoreOnce}</small>
      </section>

      <div className="aim-reticle" aria-hidden="true">
        <i /><i /><b />
        {phase === 'ready' || phase === 'charging' ? <em>{activeShot.code}</em> : null}
      </div>

      {phase === 'ready' && roundShots.length > 0 && previousAim ? (
        <div className="memory-reticle" aria-hidden="true">
          <i />
          <span>{language === 'zh' ? '他记得这里' : 'HE REMEMBERS HERE'}</span>
        </div>
      ) : null}

      <div className="charge-orbit" aria-hidden="true">
        <svg viewBox="0 0 120 120">
          <circle cx="60" cy="60" r="54" />
          <circle className="charge-progress" cx="60" cy="60" r="54" />
        </svg>
        <span>{Math.round(charge * 100)}</span>
      </div>

      {(phase === 'ready' || phase === 'charging') ? (
        <div className="coach-tip" data-stage={shotWindow === 'ready' ? 'release' : phase} data-window={shotWindow} aria-live="polite">
          <i aria-hidden="true">{phase === 'ready' ? '↓' : shotWindow === 'ready' ? '!' : hasDragged ? '↗' : '↗'}</i>
          <div>
            <strong>{coachAction}</strong>
            <span>{tutorialFirstShot ? activeShot.hint[language] : activeShot.hint[language]}</span>
          </div>
        </div>
      ) : null}

      <section className="moment-copy" aria-live="polite">
        <span className="eyebrow">{text.factualLine}</span>
        <h1>{copy.title}</h1>
        {copy.detail ? <p>{copy.detail}</p> : null}
        {copy.tip ? <div className="result-tip"><b>TIP</b><span>{copy.tip}</span></div> : null}
        {phase === 'ready' && roundShots.length === 2 ? <div className="last-kick-fact">{text.lastKickFact}</div> : null}
        {phase === 'aftermath' ? (
          <small>
            {language === 'zh' ? `第 ${roundShots.length} / 3 脚` : `KICK ${roundShots.length} / 3`} · {activeShot.label[language]} · {Math.round(charge * 100)}% · {goals} GOAL
          </small>
        ) : null}
      </section>

      {phase === 'ready' && !tutorialFirstShot ? (
        <section className="shot-selector" data-ui aria-label={text.selectShot}>
          <div className="shot-selector__label">
            <span>{text.selectShot}</span>
            <b>{text.keys}</b>
          </div>
          <div className="shot-options">
            {SHOT_STYLES.map((item) => (
              <button
                type="button"
                key={item.id}
                className={item.id === shotStyle ? 'is-active' : ''}
                aria-pressed={item.id === shotStyle}
                onClick={() => selectShotStyle(item.id)}
              >
                <i aria-hidden="true">{item.mark}</i>
                <span><strong>{item.label[language]}</strong><small>{item.code}</small></span>
              </button>
            ))}
          </div>
          <p>{activeShot.hint[language]}</p>
        </section>
      ) : null}

      {phase === 'aftermath' && (!roundComplete || caseCtaDismissed) ? (
        <div className={`result-actions ${roundComplete ? 'is-round-complete' : ''}`} data-ui>
          <button type="button" className="replay-button" onClick={continueRound}>
            {roundComplete
              ? text.restart
              : impactKind === 'goal'
                ? `${text.nextKick} · ${text.scoreAgain}`
                : `${text.nextKick} · ${text.changeIt}`}
          </button>
          <button
            type="button"
            className="share-button"
            disabled={!shareCard}
            onClick={() => {
              setShareStatus('');
              setShareOpen(true);
            }}
          >
            {shareCard ? text.preview : text.generating}
          </button>
          {shareStatus ? <span role="status">{shareStatus}</span> : null}
        </div>
      ) : null}

      {roundComplete && !caseCtaDismissed ? (
        <aside className="postmatch-cta" data-ui aria-labelledby="postmatch-cta-title">
          <button
            className="postmatch-cta__close"
            type="button"
            onClick={() => setCaseCtaDismissed(true)}
            aria-label={text.caseDismiss}
          >×</button>
          <div className="postmatch-cta__signal" aria-hidden="true">
            <span>FT</span><b>03</b>
          </div>
          <div className="postmatch-cta__copy">
            <span>{text.caseKicker}</span>
            <h2 id="postmatch-cta-title">{text.caseTitle}</h2>
            <p>{text.caseLead}</p>
          </div>
          <div className="postmatch-cta__actions">
            <a className="postmatch-cta__primary" href={CASE_STUDY_URL}>
              <span>{text.casePrimary}</span><i aria-hidden="true">↗</i>
            </a>
            <button
              className="postmatch-cta__community"
              type="button"
              onClick={() => {
                setCommunityQrFailed(false);
                setCommunityOpen(true);
              }}
            >{text.community}</button>
          </div>
          <div className="postmatch-cta__utility">
            <button type="button" onClick={continueRound}>{text.caseReplay}</button>
            <button
              type="button"
              disabled={!shareCard}
              onClick={() => {
                setShareStatus('');
                setShareOpen(true);
              }}
            >{shareCard ? text.preview : text.generating}</button>
          </div>
        </aside>
      ) : null}

      {helpOpen ? (
        <div className="modal-layer help-layer" data-ui role="dialog" aria-modal="true" aria-labelledby="help-title">
          <section className="help-card">
            <button className="modal-close" type="button" onClick={() => setHelpOpen(false)} aria-label={text.closePreview}>×</button>
            <span>3 SHOTS · ONE WALL</span>
            <h2 id="help-title">{text.helpTitle}</h2>
            <p>{text.helpLead}</p>
            <ol>
              {text.helpSteps.map((step, index) => <li key={step}><b>0{index + 1}</b><span>{step}</span></li>)}
            </ol>
            <div className="help-card__fact">40 YEARS OLD · 8 SAVES VS ARGENTINA</div>
            <button className="modal-primary" type="button" onClick={() => {
              setHelpOpen(false);
              void lastKickAudio.unlock();
            }}>{text.close}</button>
          </section>
        </div>
      ) : null}

      {shareOpen && shareCardUrl ? (
        <div className="modal-layer share-layer" data-ui role="dialog" aria-modal="true" aria-labelledby="share-title">
          <section className="share-preview">
            <button className="modal-close" type="button" onClick={() => setShareOpen(false)} aria-label={text.closePreview}>×</button>
            <div className="share-preview__copy">
              <span>YOUR CHALLENGE CARD · 1080 × 1920</span>
              <h2 id="share-title">{text.shareTitle}</h2>
              <p>{text.shareLead}</p>
            </div>
            <figure>
              <img src={shareCardUrl} alt={text.shareTitle} />
              <figcaption>{text.longPress}</figcaption>
            </figure>
            <div className="share-preview__actions">
              <button type="button" onClick={saveResult}>{text.saveImage}</button>
              <button type="button" className="modal-primary" onClick={() => void shareResult()}>{text.shareImage}</button>
            </div>
            {shareStatus ? <span className="share-preview__status" role="status">{shareStatus}</span> : null}
          </section>
        </div>
      ) : null}

      {communityOpen ? (
        <div
          className="modal-layer community-layer"
          data-ui
          role="dialog"
          aria-modal="true"
          aria-labelledby="community-title"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setCommunityOpen(false);
          }}
        >
          <section className="community-card">
            <button
              ref={communityCloseRef}
              className="modal-close"
              type="button"
              onClick={() => setCommunityOpen(false)}
              aria-label={text.groupClose}
            >×</button>
            <div className="community-card__copy">
              <span>{text.groupKicker}</span>
              <h2 id="community-title">{text.groupTitle}</h2>
              <p>{text.groupLead}</p>
              <button className="community-card__back" type="button" onClick={() => setCommunityOpen(false)}>
                {text.groupClose}
              </button>
            </div>
            <figure>
              {!communityQrFailed ? (
                <img
                  src={COMMUNITY_QR_URL}
                  alt={text.groupQrAlt}
                  onError={() => setCommunityQrFailed(true)}
                />
              ) : (
                <div className="community-card__qr-fallback" role="status">QR</div>
              )}
              {communityQrFailed ? (
                <a href={COMMUNITY_QR_URL} target="_blank" rel="noreferrer">{text.groupDirect}</a>
              ) : null}
            </figure>
          </section>
        </div>
      ) : null}

      {lab && !clean ? (
        <nav className="variant-switcher" data-ui aria-label="Crowd visual prototypes">
          <button type="button" className="step-arrow" aria-label="Previous variant" onClick={() => {
            const index = VARIANTS.findIndex((item) => item.id === variant);
            selectVariant(VARIANTS[(index + VARIANTS.length - 1) % VARIANTS.length].id);
          }}>←</button>
          <div className="variant-list">
            {VARIANTS.map((item) => (
              <button type="button" key={item.id} className={item.id === variant ? 'is-active' : ''} aria-current={item.id === variant ? 'true' : undefined} onClick={() => selectVariant(item.id)}>
                <b>{item.id}</b><span>{item.name}</span>
              </button>
            ))}
          </div>
          <button type="button" className="step-arrow" aria-label="Next variant" onClick={() => {
            const index = VARIANTS.findIndex((item) => item.id === variant);
            selectVariant(VARIANTS[(index + 1) % VARIANTS.length].id);
          }}>→</button>
        </nav>
      ) : null}

      <aside className="prototype-tag" data-ui aria-hidden="true">GPT 5.6 · OFFLINE / NO API</aside>
    </main>
  );
}
