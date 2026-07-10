export type LastKickImpactKind =
  | 'post'
  | 'bar'
  | 'crossbar'
  | 'goal'
  | 'net'
  | 'save'
  | 'fold'
  | 'crowd'
  | 'miss';

export type LastKickShotStyle = 'power' | 'curve' | 'chip';

type NoiseProfile = 'pink' | 'white' | 'fold' | 'rattle';

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const GOAL_CHEER_URL = '/audio/stadium-goal-cheer-cc0.mp3';
const CROWD_DISAPPOINTMENT_URL = '/audio/crowd-disappointment-cc0.mp3';

/**
 * A self-contained, procedural Web Audio score for the Last Kick prototype.
 * The AudioContext is deliberately created lazily so importing this module is
 * safe during SSR and does not violate browser autoplay policies.
 */
export class LastKickAudio {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private ambientBus: GainNode | null = null;
  private effectsBus: GainNode | null = null;

  private ambientSource: AudioBufferSourceNode | null = null;
  private ambientGain: GainNode | null = null;
  private ambientFilter: BiquadFilterNode | null = null;
  private breathLfo: OscillatorNode | null = null;

  private rainElement: HTMLAudioElement | null = null;
  private rainSource: MediaElementAudioSourceNode | null = null;
  private rainGain: GainNode | null = null;
  private rainHighpass: BiquadFilterNode | null = null;
  private rainLowpass: BiquadFilterNode | null = null;

  private goalCheerBuffer: AudioBuffer | null = null;
  private goalCheerLoad: Promise<AudioBuffer | null> | null = null;
  private goalCheerRequest = 0;
  private crowdDisappointmentBuffer: AudioBuffer | null = null;
  private crowdDisappointmentLoad: Promise<AudioBuffer | null> | null = null;
  private crowdDisappointmentRequest = 0;

  private chargeDrone: OscillatorNode | null = null;
  private chargeDroneGain: GainNode | null = null;
  private chargeAir: AudioBufferSourceNode | null = null;
  private chargeAirGain: GainNode | null = null;
  private chargeAirFilter: BiquadFilterNode | null = null;

  private charge = 0;
  private muted = false;
  private shotWhistlePending = false;
  private tensionInhalePending = false;
  private heartbeatTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
  private readonly activeSources = new Set<AudioScheduledSourceNode>();
  private readonly flightSources = new Set<AudioScheduledSourceNode>();
  private readonly noiseBuffers = new Map<string, AudioBuffer>();

  get isUnlocked(): boolean {
    return this.context?.state === 'running';
  }

  get isMuted(): boolean {
    return this.muted;
  }

  async unlock(): Promise<void> {
    if (typeof AudioContext === 'undefined') return;

    if (!this.context || this.context.state === 'closed') {
      this.createGraph();
    }

    const context = this.context;
    if (!context) return;

    // Start both operations synchronously while the pointer gesture is still
    // active. Safari can reject media playback if we cross an `await` first.
    const resumePromise = context.state === 'running' ? Promise.resolve() : context.resume();
    const rainPromise = this.rainElement?.paused
      ? this.rainElement.play()
      : Promise.resolve();
    await Promise.allSettled([resumePromise, rainPromise]);

    // A silent, one-sample source also unlocks audio reliably on older iOS.
    const silent = context.createBufferSource();
    silent.buffer = context.createBuffer(1, 1, context.sampleRate);
    silent.connect(context.destination);
    silent.start();
    silent.addEventListener('ended', () => silent.disconnect(), {once: true});

    this.applyCharge(this.charge);
    if (context.state === 'running' && this.shotWhistlePending && this.charge > 0.035) {
      this.shotWhistlePending = false;
      this.playWhistle(context.currentTime + 0.012, 0.66, 0.34);
    }
    if (context.state === 'running' && this.tensionInhalePending && this.charge > 0.035) {
      this.tensionInhalePending = false;
      this.playTensionInhale(context.currentTime + 0.018, 0.72, 1.22);
    }
  }

  /** Short, non-blocking stadium cue for the cinematic start button. */
  introSting(): void {
    const play = () => {
      const context = this.runningContext();
      if (!context || !this.effectsBus) return;
      const now = context.currentTime + 0.012;
      this.duckAmbience(now, 0.84, 0.012, 0.06);
      this.playHeartPulse(now, 0.78);
      this.playHeartPulse(now + 0.13, 0.46);
      this.playTensionInhale(now + 0.025, 0.76, 0.76);
      this.playWhistle(now + 0.43, 0.52, 0.24);
    };

    if (this.runningContext()) {
      play();
    } else {
      void this.unlock().then(play);
    }
  }

  setCharge(value: number): void {
    const previousCharge = this.charge;
    this.charge = clamp01(Number.isFinite(value) ? value : 0);
    this.applyCharge(this.charge);

    // The first press is also the referee's signal. If the AudioContext is
    // still resuming on iOS, unlock() plays the pending whistle immediately.
    if (previousCharge <= 0.035 && this.charge > 0.035) {
      const context = this.runningContext();
      if (context) {
        this.playWhistle(context.currentTime, 0.66, 0.34);
        this.playTensionInhale(context.currentTime + 0.04, 0.72, 1.22);
      } else {
        this.shotWhistlePending = true;
        this.tensionInhalePending = true;
      }
    }
  }

  release(power: number, style: LastKickShotStyle = 'power'): void {
    const context = this.runningContext();
    const normalizedPower = Math.max(0.18, clamp01(Number.isFinite(power) ? power : 0));
    const shotStyle: LastKickShotStyle =
      style === 'curve' || style === 'chip' ? style : 'power';

    this.charge = 0;
    this.shotWhistlePending = false;
    this.tensionInhalePending = false;
    this.goalCheerRequest += 1;
    this.crowdDisappointmentRequest += 1;
    this.applyCharge(0);
    this.stopHeartbeat();

    if (!context || !this.effectsBus) return;

    // A new shot is a hard edit: cancel any heartbeat tail or prior flight.
    this.stopTransientSources();
    // Leave a perceptible vacuum on pointer-up. The effects bus drops almost
    // to zero, then the leather transient punches through at 58ms.
    this.scheduleContactVacuum(context.currentTime);
    this.playKickImpulse(context.currentTime + 0.058, normalizedPower, shotStyle);
    this.playFlightWind(context.currentTime + 0.104, normalizedPower, shotStyle);

    // The whole stadium inhales around the kick, then rushes back in.
    if (this.ambientGain) {
      const gain = this.ambientGain.gain;
      gain.cancelScheduledValues(context.currentTime);
      gain.setValueAtTime(Math.max(0.001, gain.value), context.currentTime);
      gain.linearRampToValueAtTime(0.001, context.currentTime + 0.04);
      gain.exponentialRampToValueAtTime(0.026, context.currentTime + 0.5);
    }
    if (this.rainGain) {
      const gain = this.rainGain.gain;
      gain.cancelScheduledValues(context.currentTime);
      gain.setValueAtTime(Math.max(0.001, gain.value), context.currentTime);
      gain.linearRampToValueAtTime(0.006, context.currentTime + 0.04);
      gain.exponentialRampToValueAtTime(0.14, context.currentTime + 0.72);
    }
  }

  impact(kind: LastKickImpactKind): void {
    const context = this.runningContext();
    if (!context || !this.effectsBus) return;

    this.stopFlight();
    const now = context.currentTime;

    switch (kind) {
      case 'post':
      case 'bar':
      case 'crossbar':
        this.duckAmbience(now, 1.7, 0.009, 0.038);
        this.playMetalStrike(now, kind === 'post' ? 1.08 : 1.2);
        this.playCrowdSigh(now + 0.055, 0.58);
        this.playCrowdDisappointment(
          now + 0.045,
          kind === 'post' ? 0.92 : 1,
          kind === 'post' ? 1.04 : 0.98,
        );
        break;
      case 'goal':
        this.duckAmbience(now, 3.2, 0.008, 0.026);
        this.playNetRattle(now, 1);
        this.playGoalCheer(now + 0.075);
        this.playFoldBurst(now + 0.11, 0.42);
        this.playWhistle(now + 0.64, 0.3, 0.24);
        this.playWhistle(now + 1.22, 0.22, 0.18);
        break;
      case 'net':
        this.playNetRattle(now, 1);
        this.playFoldBurst(now + 0.06, 0.68);
        break;
      case 'save':
        this.duckAmbience(now, 2.1, 0.008, 0.034);
        this.playGloveSave(now, 1.32);
        this.playCrowdSigh(now + 0.045, 0.72);
        this.playCrowdDisappointment(now + 0.035, 1.08, 0.96);
        break;
      case 'fold':
      case 'crowd':
        this.playFoldBurst(now, kind === 'fold' ? 0.92 : 0.76);
        break;
      case 'miss':
        this.playMiss(now);
        break;
    }
  }

  reset(): void {
    this.charge = 0;
    this.shotWhistlePending = false;
    this.tensionInhalePending = false;
    this.goalCheerRequest += 1;
    this.crowdDisappointmentRequest += 1;
    this.stopHeartbeat();
    this.stopTransientSources();
    this.applyCharge(0);

    const context = this.runningContext();
    if (context && this.ambientGain) {
      this.ramp(this.ambientGain.gain, 0.026, 0.35, context.currentTime);
    }
    if (context && this.rainGain) {
      this.ramp(this.rainGain.gain, 0.14, 0.55, context.currentTime);
    }
    if (context && this.effectsBus) {
      this.ramp(this.effectsBus.gain, 0.78, 0.16, context.currentTime);
    }
  }

  /** Pass no argument to toggle. Returns the resulting mute state. */
  setMuted(muted = !this.muted): boolean {
    this.muted = muted;

    const context = this.context;
    const master = this.masterGain;
    if (context && master && context.state !== 'closed') {
      const now = context.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(master.gain.value, now);
      master.gain.linearRampToValueAtTime(muted ? 0 : 0.68, now + 0.045);
    }

    return this.muted;
  }

  dispose(): void {
    this.stopHeartbeat();
    this.stopFlight();
    this.goalCheerRequest += 1;
    this.crowdDisappointmentRequest += 1;

    for (const source of this.activeSources) {
      this.safeStop(source);
    }
    this.activeSources.clear();

    this.safeStop(this.ambientSource);
    this.safeStop(this.breathLfo);
    this.safeStop(this.chargeDrone);
    this.safeStop(this.chargeAir);
    this.rainElement?.pause();
    this.rainElement?.removeAttribute('src');
    this.rainElement?.load();
    this.rainSource?.disconnect();
    this.rainHighpass?.disconnect();
    this.rainLowpass?.disconnect();
    this.rainGain?.disconnect();

    const context = this.context;
    this.context = null;
    this.masterGain = null;
    this.ambientBus = null;
    this.effectsBus = null;
    this.ambientSource = null;
    this.ambientGain = null;
    this.ambientFilter = null;
    this.breathLfo = null;
    this.rainElement = null;
    this.rainSource = null;
    this.rainGain = null;
    this.rainHighpass = null;
    this.rainLowpass = null;
    this.goalCheerBuffer = null;
    this.goalCheerLoad = null;
    this.crowdDisappointmentBuffer = null;
    this.crowdDisappointmentLoad = null;
    this.chargeDrone = null;
    this.chargeDroneGain = null;
    this.chargeAir = null;
    this.chargeAirGain = null;
    this.chargeAirFilter = null;
    this.noiseBuffers.clear();

    if (context && context.state !== 'closed') {
      void context.close();
    }
  }

  private createGraph(): void {
    const context = new AudioContext({latencyHint: 'interactive'});
    const masterGain = context.createGain();
    const compressor = context.createDynamicsCompressor();
    const ambientBus = context.createGain();
    const effectsBus = context.createGain();

    masterGain.gain.value = this.muted ? 0 : 0.68;
    ambientBus.gain.value = 0.82;
    effectsBus.gain.value = 0.78;

    compressor.threshold.value = -20;
    compressor.knee.value = 18;
    compressor.ratio.value = 5;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.24;

    ambientBus.connect(masterGain);
    effectsBus.connect(masterGain);
    masterGain.connect(compressor);
    compressor.connect(context.destination);

    this.context = context;
    this.masterGain = masterGain;
    this.ambientBus = ambientBus;
    this.effectsBus = effectsBus;

    this.createAmbientCrowd();
    this.createRainLayer();
    this.createChargeLayer();
    void this.loadGoalCheer();
    void this.loadCrowdDisappointment();
  }

  private createAmbientCrowd(): void {
    const context = this.context;
    const bus = this.ambientBus;
    if (!context || !bus) return;

    const source = context.createBufferSource();
    const highpass = context.createBiquadFilter();
    const lowpass = context.createBiquadFilter();
    const gain = context.createGain();
    const breath = context.createOscillator();
    const breathDepth = context.createGain();
    const body = context.createOscillator();
    const bodyGain = context.createGain();

    source.buffer = this.noiseBuffer(4, 'pink', 0x51ad1a);
    source.loop = true;
    highpass.type = 'highpass';
    highpass.frequency.value = 62;
    highpass.Q.value = 0.4;
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 760;
    lowpass.Q.value = 0.7;
    gain.gain.value = 0.026;

    breath.type = 'sine';
    breath.frequency.value = 0.145;
    breathDepth.gain.value = 0.006;

    body.type = 'triangle';
    body.frequency.value = 46;
    bodyGain.gain.value = 0.009;

    source.connect(highpass).connect(lowpass).connect(gain).connect(bus);
    breath.connect(breathDepth).connect(gain.gain);
    body.connect(bodyGain).connect(bus);

    source.start();
    breath.start();
    body.start();

    this.ambientSource = source;
    this.ambientGain = gain;
    this.ambientFilter = lowpass;
    this.breathLfo = breath;

    // The body oscillator is intentionally tied to the ambient source lifetime.
    source.addEventListener(
      'ended',
      () => {
        this.safeStop(body);
        source.disconnect();
        highpass.disconnect();
        lowpass.disconnect();
        gain.disconnect();
        body.disconnect();
        bodyGain.disconnect();
      },
      {once: true},
    );
  }

  private createRainLayer(): void {
    const context = this.context;
    const bus = this.ambientBus;
    if (!context || !bus || typeof Audio === 'undefined') return;

    const element = new Audio();
    const source = context.createMediaElementSource(element);
    const highpass = context.createBiquadFilter();
    const lowpass = context.createBiquadFilter();
    const gain = context.createGain();

    element.loop = true;
    element.preload = 'auto';
    element.crossOrigin = 'anonymous';
    element.src = '/audio/light-rain-cc0.mp3';
    highpass.type = 'highpass';
    highpass.frequency.value = 115;
    highpass.Q.value = 0.45;
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 4200;
    lowpass.Q.value = 0.52;
    // The source is normalized to -26 LUFS, then deliberately mixed roughly
    // another 17 dB down so it reads as weather rather than white noise.
    gain.gain.value = 0.14;

    source.connect(highpass).connect(lowpass).connect(gain).connect(bus);

    this.rainElement = element;
    this.rainSource = source;
    this.rainGain = gain;
    this.rainHighpass = highpass;
    this.rainLowpass = lowpass;
  }

  private loadGoalCheer(): Promise<AudioBuffer | null> {
    if (this.goalCheerBuffer) return Promise.resolve(this.goalCheerBuffer);
    if (this.goalCheerLoad) return this.goalCheerLoad;

    const context = this.context;
    if (!context || typeof fetch === 'undefined') return Promise.resolve(null);

    const load = fetch(GOAL_CHEER_URL)
      .then((response) => {
        if (!response.ok) throw new Error(`Goal cheer failed to load (${response.status}).`);
        return response.arrayBuffer();
      })
      .then((bytes) => context.decodeAudioData(bytes))
      .then((buffer) => {
        if (this.context === context && context.state !== 'closed') {
          this.goalCheerBuffer = buffer;
          return buffer;
        }
        return null;
      })
      .catch(() => null)
      .finally(() => {
        if (this.goalCheerLoad === load) this.goalCheerLoad = null;
      });

    this.goalCheerLoad = load;
    return load;
  }

  private playGoalCheer(start: number): void {
    const context = this.context;
    if (!context) return;

    const request = ++this.goalCheerRequest;
    const play = (buffer: AudioBuffer | null) => {
      if (
        !buffer ||
        request !== this.goalCheerRequest ||
        this.context !== context ||
        context.state !== 'running'
      ) {
        return;
      }
      this.playGoalCheerBuffer(Math.max(start, context.currentTime + 0.008), buffer);
    };

    if (this.goalCheerBuffer) {
      play(this.goalCheerBuffer);
    } else {
      void this.loadGoalCheer().then(play);
    }
  }

  private playGoalCheerBuffer(start: number, buffer: AudioBuffer): void {
    const context = this.context;
    const bus = this.effectsBus;
    if (!context || !bus) return;

    const source = context.createBufferSource();
    const highpass = context.createBiquadFilter();
    const lowpass = context.createBiquadFilter();
    const compressor = context.createDynamicsCompressor();
    const gain = context.createGain();

    source.buffer = buffer;
    highpass.type = 'highpass';
    highpass.frequency.value = 82;
    highpass.Q.value = 0.52;
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 12_500;
    lowpass.Q.value = 0.42;
    compressor.threshold.value = -14;
    compressor.knee.value = 12;
    compressor.ratio.value = 2.2;
    compressor.attack.value = 0.007;
    compressor.release.value = 0.19;

    const end = start + buffer.duration;
    const fadeStart = Math.max(start + 0.5, end - 1.15);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(1.35, start + 0.045);
    gain.gain.setValueAtTime(1.35, fadeStart);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);

    source.connect(highpass).connect(lowpass).connect(compressor).connect(gain).connect(bus);
    this.trackSource(source, [highpass, lowpass, compressor, gain]);
    source.start(start);
    source.stop(end + 0.015);
  }

  private loadCrowdDisappointment(): Promise<AudioBuffer | null> {
    if (this.crowdDisappointmentBuffer) {
      return Promise.resolve(this.crowdDisappointmentBuffer);
    }
    if (this.crowdDisappointmentLoad) return this.crowdDisappointmentLoad;

    const context = this.context;
    if (!context || typeof fetch === 'undefined') return Promise.resolve(null);

    const load = fetch(CROWD_DISAPPOINTMENT_URL)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Crowd disappointment failed to load (${response.status}).`);
        }
        return response.arrayBuffer();
      })
      .then((bytes) => context.decodeAudioData(bytes))
      .then((buffer) => {
        if (this.context === context && context.state !== 'closed') {
          this.crowdDisappointmentBuffer = buffer;
          return buffer;
        }
        return null;
      })
      .catch(() => null)
      .finally(() => {
        if (this.crowdDisappointmentLoad === load) {
          this.crowdDisappointmentLoad = null;
        }
      });

    this.crowdDisappointmentLoad = load;
    return load;
  }

  private playCrowdDisappointment(
    start: number,
    intensity: number,
    playbackRate: number,
  ): void {
    const context = this.context;
    if (!context) return;

    const request = ++this.crowdDisappointmentRequest;
    const play = (buffer: AudioBuffer | null) => {
      if (
        !buffer ||
        request !== this.crowdDisappointmentRequest ||
        this.context !== context ||
        context.state !== 'running'
      ) {
        return;
      }
      this.playCrowdDisappointmentBuffer(
        Math.max(start, context.currentTime + 0.008),
        buffer,
        intensity,
        playbackRate,
      );
    };

    if (this.crowdDisappointmentBuffer) {
      play(this.crowdDisappointmentBuffer);
    } else {
      void this.loadCrowdDisappointment().then(play);
    }
  }

  private playCrowdDisappointmentBuffer(
    start: number,
    buffer: AudioBuffer,
    intensity: number,
    playbackRate: number,
  ): void {
    const context = this.context;
    const bus = this.effectsBus;
    if (!context || !bus) return;

    const source = context.createBufferSource();
    const highpass = context.createBiquadFilter();
    const lowpass = context.createBiquadFilter();
    const compressor = context.createDynamicsCompressor();
    const gain = context.createGain();
    const rate = Math.max(0.8, Math.min(1.2, playbackRate));
    const level = 1.52 * intensity;
    const end = start + buffer.duration / rate;

    source.buffer = buffer;
    source.playbackRate.value = rate;
    highpass.type = 'highpass';
    highpass.frequency.value = 105;
    highpass.Q.value = 0.48;
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 9600;
    lowpass.Q.value = 0.4;
    compressor.threshold.value = -10;
    compressor.knee.value = 8;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.2;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(level, start + 0.028);
    gain.gain.setValueAtTime(level, Math.max(start + 0.1, end - 0.58));
    gain.gain.exponentialRampToValueAtTime(0.0001, end);

    source.connect(highpass).connect(lowpass).connect(compressor).connect(gain).connect(bus);
    this.trackSource(source, [highpass, lowpass, compressor, gain]);
    source.start(start);
    source.stop(end + 0.015);
  }

  private createChargeLayer(): void {
    const context = this.context;
    const bus = this.ambientBus;
    if (!context || !bus) return;

    const drone = context.createOscillator();
    const droneFilter = context.createBiquadFilter();
    const droneGain = context.createGain();
    const air = context.createBufferSource();
    const airFilter = context.createBiquadFilter();
    const airGain = context.createGain();

    drone.type = 'triangle';
    drone.frequency.value = 42;
    droneFilter.type = 'lowpass';
    droneFilter.frequency.value = 180;
    droneGain.gain.value = 0.0001;

    air.buffer = this.noiseBuffer(2.5, 'white', 0x5e719e);
    air.loop = true;
    airFilter.type = 'bandpass';
    airFilter.frequency.value = 720;
    airFilter.Q.value = 0.8;
    airGain.gain.value = 0.0001;

    drone.connect(droneFilter).connect(droneGain).connect(bus);
    air.connect(airFilter).connect(airGain).connect(bus);
    drone.start();
    air.start();

    this.chargeDrone = drone;
    this.chargeDroneGain = droneGain;
    this.chargeAir = air;
    this.chargeAirGain = airGain;
    this.chargeAirFilter = airFilter;
  }

  private applyCharge(value: number): void {
    const context = this.runningContext();
    if (!context) return;

    const now = context.currentTime;
    const shaped = value * value;

    if (this.chargeDrone && this.chargeDroneGain) {
      this.ramp(this.chargeDrone.frequency, 42 + value * 27, 0.09, now);
      this.ramp(this.chargeDroneGain.gain, 0.0001 + shaped * 0.064, 0.08, now);
    }
    if (this.chargeAirGain && this.chargeAirFilter) {
      this.ramp(this.chargeAirGain.gain, 0.0001 + shaped * 0.034, 0.08, now);
      this.ramp(this.chargeAirFilter.frequency, 720 + shaped * 2450, 0.1, now);
    }
    if (this.ambientGain && this.ambientFilter) {
      this.ramp(this.ambientGain.gain, 0.026 - value * 0.023, 0.12, now);
      this.ramp(this.ambientFilter.frequency, 760 - value * 500, 0.12, now);
    }
    if (this.rainGain && this.rainLowpass) {
      this.ramp(this.rainGain.gain, 0.14 - value * 0.123, 0.16, now);
      this.ramp(this.rainLowpass.frequency, 4200 - value * 3000, 0.16, now);
    }

    if (value > 0.035) {
      this.scheduleHeartbeat(true);
    } else {
      this.stopHeartbeat();
    }
  }

  private scheduleHeartbeat(immediate = false): void {
    if (this.heartbeatTimer || this.charge <= 0.035) return;

    if (immediate) this.playHeartbeat();
    const interval = 800 - this.charge * 455;
    this.heartbeatTimer = globalThis.setTimeout(() => {
      this.heartbeatTimer = null;
      if (this.charge <= 0.035) return;
      this.playHeartbeat();
      this.scheduleHeartbeat();
    }, interval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      globalThis.clearTimeout(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private playHeartbeat(): void {
    const context = this.runningContext();
    if (!context || !this.effectsBus) return;

    const now = context.currentTime;
    const strength = 0.55 + this.charge * 0.45;
    this.playHeartPulse(now, strength);
    this.playHeartPulse(now + 0.112, strength * 0.58);
  }

  private playTensionInhale(start: number, intensity: number, duration: number): void {
    const context = this.context;
    const bus = this.effectsBus;
    if (!context || !bus) return;

    const source = context.createBufferSource();
    const highpass = context.createBiquadFilter();
    const filter = context.createBiquadFilter();
    const panner = context.createStereoPanner();
    const gain = context.createGain();
    const end = start + duration;

    source.buffer = this.noiseBuffer(Math.max(0.8, duration + 0.04), 'pink', 0xb7ea7e);
    highpass.type = 'highpass';
    highpass.frequency.value = 210;
    filter.type = 'bandpass';
    filter.Q.value = 0.68;
    filter.frequency.setValueAtTime(620, start);
    filter.frequency.exponentialRampToValueAtTime(1850, end);
    panner.pan.setValueAtTime(-0.08, start);
    panner.pan.linearRampToValueAtTime(0.12, end);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.052 * intensity, start + duration * 0.58);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);

    source.connect(highpass).connect(filter).connect(panner).connect(gain).connect(bus);
    this.trackSource(source, [highpass, filter, panner, gain]);
    source.start(start);
    source.stop(end + 0.012);
  }

  private playHeartPulse(start: number, strength: number): void {
    const context = this.context;
    const bus = this.effectsBus;
    if (!context || !bus) return;

    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(58 + this.charge * 7, start);
    oscillator.frequency.exponentialRampToValueAtTime(36, start + 0.15);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.095 * strength, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.17);
    oscillator.connect(gain).connect(bus);

    this.trackSource(oscillator, [gain]);
    oscillator.start(start);
    oscillator.stop(start + 0.18);
  }

  private playKickImpulse(
    start: number,
    power: number,
    style: LastKickShotStyle,
  ): void {
    const context = this.context;
    const bus = this.effectsBus;
    if (!context || !bus) return;

    const profile =
      style === 'curve'
        ? {
            bodyStart: 224 + power * 62,
            bodyEnd: 54,
            bodyPeak: 0.25 + power * 0.085,
            clickFrequency: 2550 + power * 1550,
            clickPeak: 0.23 + power * 0.12,
            duration: 0.102,
          }
        : style === 'chip'
          ? {
              bodyStart: 315 + power * 74,
              bodyEnd: 86,
              bodyPeak: 0.12 + power * 0.052,
              clickFrequency: 3650 + power * 1650,
              clickPeak: 0.2 + power * 0.08,
              duration: 0.074,
            }
          : {
              bodyStart: 170 + power * 50,
              bodyEnd: 42,
              bodyPeak: 0.36 + power * 0.13,
              clickFrequency: 1450 + power * 1250,
              clickPeak: 0.2 + power * 0.11,
              duration: 0.112,
            };

    const body = context.createOscillator();
    const bodyGain = context.createGain();
    body.type = 'sine';
    body.frequency.setValueAtTime(profile.bodyStart, start);
    body.frequency.exponentialRampToValueAtTime(profile.bodyEnd, start + profile.duration);
    bodyGain.gain.setValueAtTime(0.0001, start);
    bodyGain.gain.exponentialRampToValueAtTime(profile.bodyPeak, start + 0.003);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, start + profile.duration);
    body.connect(bodyGain).connect(bus);
    this.trackSource(body, [bodyGain]);
    body.start(start);
    body.stop(start + profile.duration + 0.008);

    const click = context.createBufferSource();
    const clickFilter = context.createBiquadFilter();
    const clickGain = context.createGain();
    click.buffer = this.noiseBuffer(0.12, 'white', 0x96c1c);
    clickFilter.type = 'bandpass';
    clickFilter.frequency.value = profile.clickFrequency;
    clickFilter.Q.value = 0.72;
    clickGain.gain.setValueAtTime(0.0001, start);
    clickGain.gain.linearRampToValueAtTime(profile.clickPeak, start + 0.002);
    clickGain.gain.exponentialRampToValueAtTime(0.0001, start + profile.duration);
    click.connect(clickFilter).connect(clickGain).connect(bus);
    this.trackSource(click, [clickFilter, clickGain]);
    click.start(start);
    click.stop(start + profile.duration + 0.009);

    this.playShotAccent(start, power, style);
  }

  private scheduleContactVacuum(start: number): void {
    if (!this.effectsBus) return;
    const gain = this.effectsBus.gain;
    gain.cancelScheduledValues(start);
    gain.setValueAtTime(Math.max(0.0001, gain.value), start);
    gain.linearRampToValueAtTime(0.025, start + 0.018);
    gain.setValueAtTime(0.025, start + 0.043);
    gain.exponentialRampToValueAtTime(1.04, start + 0.062);
    gain.exponentialRampToValueAtTime(0.78, start + 0.2);
  }

  private playShotAccent(
    start: number,
    power: number,
    style: LastKickShotStyle,
  ): void {
    const context = this.context;
    const bus = this.effectsBus;
    if (!context || !bus) return;

    if (style === 'power') {
      const sub = context.createOscillator();
      const gain = context.createGain();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(92 + power * 18, start);
      sub.frequency.exponentialRampToValueAtTime(32, start + 0.17);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.23 + power * 0.12, start + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);
      sub.connect(gain).connect(bus);
      this.trackSource(sub, [gain]);
      sub.start(start);
      sub.stop(start + 0.19);
      return;
    }

    if (style === 'curve') {
      const scrape = context.createBufferSource();
      const filter = context.createBiquadFilter();
      const panner = context.createStereoPanner();
      const gain = context.createGain();
      scrape.buffer = this.noiseBuffer(0.22, 'white', 0xc07e5);
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(4700 + power * 850, start);
      filter.frequency.exponentialRampToValueAtTime(1750, start + 0.2);
      filter.Q.value = 0.78;
      panner.pan.setValueAtTime(-0.62, start);
      panner.pan.linearRampToValueAtTime(0.58, start + 0.19);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.2 + power * 0.08, start + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.21);
      scrape.connect(filter).connect(panner).connect(gain).connect(bus);
      this.trackSource(scrape, [filter, panner, gain]);
      scrape.start(start);
      scrape.stop(start + 0.215);
      return;
    }

    const tap = context.createOscillator();
    const tapGain = context.createGain();
    const panner = context.createStereoPanner();
    tap.type = 'triangle';
    tap.frequency.setValueAtTime(780 + power * 120, start);
    tap.frequency.exponentialRampToValueAtTime(310, start + 0.12);
    panner.pan.value = 0.12;
    tapGain.gain.setValueAtTime(0.0001, start);
    tapGain.gain.exponentialRampToValueAtTime(0.13 + power * 0.045, start + 0.003);
    tapGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.125);
    tap.connect(tapGain).connect(panner).connect(bus);
    this.trackSource(tap, [tapGain, panner]);
    tap.start(start);
    tap.stop(start + 0.13);
  }

  private playFlightWind(
    start: number,
    power: number,
    style: LastKickShotStyle,
  ): void {
    const context = this.context;
    const bus = this.effectsBus;
    if (!context || !bus) return;

    const profile =
      style === 'curve'
        ? {
            duration: 2.72,
            highpass: 520,
            filterStart: 2350,
            filterPeak: 8200,
            filterEnd: 1550,
            panStart: -0.68,
            panEnd: 0.74,
            gainPeak: 0.085 + power * 0.095,
            dopplerStart: 338 + power * 94,
            dopplerEnd: 108,
            dopplerGain: 0.019,
          }
        : style === 'chip'
          ? {
              duration: 2.5,
              highpass: 410,
              filterStart: 1180,
              filterPeak: 4700,
              filterEnd: 760,
              panStart: -0.08,
              panEnd: 0.1,
              gainPeak: 0.052 + power * 0.065,
              dopplerStart: 480 + power * 105,
              dopplerEnd: 178,
              dopplerGain: 0.012,
            }
          : {
              duration: 2.72,
              highpass: 330,
              filterStart: 1700,
              filterPeak: 6500,
              filterEnd: 1050,
              panStart: -0.28,
              panEnd: 0.32,
              gainPeak: 0.1 + power * 0.11,
              dopplerStart: 235 + power * 85,
              dopplerEnd: 74,
              dopplerGain: 0.025,
            };

    const wind = context.createBufferSource();
    const highpass = context.createBiquadFilter();
    const lowpass = context.createBiquadFilter();
    const panner = context.createStereoPanner();
    const windGain = context.createGain();

    wind.buffer = this.noiseBuffer(3.1, 'white', 0xf11947);
    highpass.type = 'highpass';
    highpass.frequency.value = profile.highpass;
    lowpass.type = 'lowpass';
    lowpass.Q.value = 0.75;
    lowpass.frequency.setValueAtTime(profile.filterStart, start);
    lowpass.frequency.exponentialRampToValueAtTime(profile.filterPeak, start + 0.28);
    lowpass.frequency.exponentialRampToValueAtTime(
      profile.filterEnd,
      start + profile.duration - 0.07,
    );
    panner.pan.setValueAtTime(profile.panStart, start);
    panner.pan.linearRampToValueAtTime(profile.panEnd, start + profile.duration - 0.2);
    windGain.gain.setValueAtTime(0.0001, start);
    windGain.gain.exponentialRampToValueAtTime(profile.gainPeak, start + 0.12);
    windGain.gain.exponentialRampToValueAtTime(profile.gainPeak * 0.42, start + 1.25);
    windGain.gain.exponentialRampToValueAtTime(0.0001, start + profile.duration);

    wind.connect(highpass).connect(lowpass).connect(panner).connect(windGain).connect(bus);
    this.trackSource(wind, [highpass, lowpass, panner, windGain], true);
    wind.start(start);
    wind.stop(start + profile.duration + 0.06);

    const doppler = context.createOscillator();
    const dopplerGain = context.createGain();
    doppler.type = 'sine';
    doppler.frequency.setValueAtTime(profile.dopplerStart, start);
    doppler.frequency.exponentialRampToValueAtTime(
      profile.dopplerEnd,
      start + profile.duration * 0.77,
    );
    dopplerGain.gain.setValueAtTime(0.0001, start);
    dopplerGain.gain.exponentialRampToValueAtTime(profile.dopplerGain, start + 0.07);
    dopplerGain.gain.exponentialRampToValueAtTime(
      0.0001,
      start + profile.duration * 0.79,
    );
    doppler.connect(dopplerGain).connect(bus);
    this.trackSource(doppler, [dopplerGain], true);
    doppler.start(start);
    doppler.stop(start + profile.duration * 0.81);
  }

  private duckAmbience(
    start: number,
    duration: number,
    ambientFloor: number,
    rainFloor: number,
  ): void {
    const recoverAt = start + duration;
    const holdUntil = start + Math.min(0.72, duration * 0.32);
    const schedule = (parameter: AudioParam, floor: number, target: number) => {
      parameter.cancelScheduledValues(start);
      parameter.setValueAtTime(Math.max(0.0001, parameter.value), start);
      parameter.linearRampToValueAtTime(floor, start + 0.035);
      parameter.setValueAtTime(floor, holdUntil);
      parameter.exponentialRampToValueAtTime(target, recoverAt);
    };

    if (this.ambientGain) schedule(this.ambientGain.gain, ambientFloor, 0.026);
    if (this.rainGain) schedule(this.rainGain.gain, rainFloor, 0.14);
  }

  private playWhistle(
    start: number,
    intensity: number,
    duration: number,
  ): void {
    const context = this.context;
    const bus = this.effectsBus;
    if (!context || !bus) return;

    const primary = context.createOscillator();
    const secondary = context.createOscillator();
    const primaryGain = context.createGain();
    const secondaryGain = context.createGain();
    const vibrato = context.createOscillator();
    const vibratoDepth = context.createGain();
    const end = start + duration;

    primary.type = 'triangle';
    primary.frequency.value = 2720;
    secondary.type = 'sine';
    secondary.frequency.value = 3150;
    vibrato.type = 'sine';
    vibrato.frequency.value = 27;
    vibratoDepth.gain.value = 34;

    primaryGain.gain.setValueAtTime(0.0001, start);
    primaryGain.gain.exponentialRampToValueAtTime(0.047 * intensity, start + 0.012);
    primaryGain.gain.setValueAtTime(0.047 * intensity, start + duration * 0.54);
    primaryGain.gain.exponentialRampToValueAtTime(0.0001, end);
    secondaryGain.gain.setValueAtTime(0.0001, start);
    secondaryGain.gain.exponentialRampToValueAtTime(0.018 * intensity, start + 0.01);
    secondaryGain.gain.exponentialRampToValueAtTime(0.0001, end);

    vibrato.connect(vibratoDepth);
    vibratoDepth.connect(primary.frequency);
    vibratoDepth.connect(secondary.frequency);
    primary.connect(primaryGain).connect(bus);
    secondary.connect(secondaryGain).connect(bus);

    this.trackSource(primary, [primaryGain]);
    this.trackSource(secondary, [secondaryGain]);
    this.trackSource(vibrato, [vibratoDepth]);
    primary.start(start);
    secondary.start(start);
    vibrato.start(start);
    primary.stop(end + 0.01);
    secondary.stop(end + 0.01);
    vibrato.stop(end + 0.01);
  }

  private playMetalStrike(start: number, intensity: number): void {
    const context = this.context;
    const bus = this.effectsBus;
    if (!context || !bus) return;

    const partials = [520, 1040, 2085, 3310];
    const levels = [0.3, 0.17, 0.075, 0.038];
    const durations = [1.22, 0.9, 0.55, 0.31];

    partials.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const panner = context.createStereoPanner();
      oscillator.type = index === 0 ? 'triangle' : 'sine';
      oscillator.frequency.setValueAtTime(frequency, start);
      oscillator.frequency.exponentialRampToValueAtTime(
        frequency * (index === 0 ? 0.96 : 0.985),
        start + durations[index],
      );
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(levels[index] * intensity, start + 0.002);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + durations[index]);
      panner.pan.value = (index - 1.5) * 0.1;
      oscillator.connect(gain).connect(panner).connect(bus);
      this.trackSource(oscillator, [gain, panner]);
      oscillator.start(start);
      oscillator.stop(start + durations[index] + 0.02);
    });

    const tick = context.createBufferSource();
    const tickFilter = context.createBiquadFilter();
    const tickGain = context.createGain();
    tick.buffer = this.noiseBuffer(0.08, 'white', 0x907157);
    tickFilter.type = 'highpass';
    tickFilter.frequency.value = 3100;
    tickGain.gain.setValueAtTime(0.36 * intensity, start);
    tickGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.075);
    tick.connect(tickFilter).connect(tickGain).connect(bus);
    this.trackSource(tick, [tickFilter, tickGain]);
    tick.start(start);
    tick.stop(start + 0.082);

    const pipeBody = context.createOscillator();
    const pipeBodyGain = context.createGain();
    pipeBody.type = 'sine';
    pipeBody.frequency.setValueAtTime(146, start);
    pipeBody.frequency.exponentialRampToValueAtTime(61, start + 0.28);
    pipeBodyGain.gain.setValueAtTime(0.0001, start);
    pipeBodyGain.gain.exponentialRampToValueAtTime(0.22 * intensity, start + 0.004);
    pipeBodyGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.3);
    pipeBody.connect(pipeBodyGain).connect(bus);
    this.trackSource(pipeBody, [pipeBodyGain]);
    pipeBody.start(start);
    pipeBody.stop(start + 0.31);
  }

  private playFoldBurst(start: number, intensity: number): void {
    const context = this.context;
    const bus = this.effectsBus;
    if (!context || !bus) return;

    const crowd = context.createBufferSource();
    const crowdBand = context.createBiquadFilter();
    const crowdGain = context.createGain();
    const paperBand = context.createBiquadFilter();
    const paperGain = context.createGain();
    const panner = context.createStereoPanner();

    crowd.buffer = this.noiseBuffer(1.65, 'fold', 0xf01d5);
    crowdBand.type = 'bandpass';
    crowdBand.frequency.value = 470;
    crowdBand.Q.value = 0.55;
    crowdGain.gain.setValueAtTime(0.0001, start);
    crowdGain.gain.exponentialRampToValueAtTime(0.15 * intensity, start + 0.055);
    crowdGain.gain.linearRampToValueAtTime(0.22 * intensity, start + 0.28);
    crowdGain.gain.exponentialRampToValueAtTime(0.0001, start + 1.58);

    paperBand.type = 'highpass';
    paperBand.frequency.value = 1450;
    paperGain.gain.setValueAtTime(0.0001, start);
    paperGain.gain.exponentialRampToValueAtTime(0.17 * intensity, start + 0.018);
    paperGain.gain.exponentialRampToValueAtTime(0.045, start + 0.72);
    paperGain.gain.exponentialRampToValueAtTime(0.0001, start + 1.48);

    panner.pan.setValueAtTime(-0.22, start);
    panner.pan.linearRampToValueAtTime(0.22, start + 1.4);

    crowd.connect(crowdBand).connect(crowdGain).connect(panner).connect(bus);
    crowd.connect(paperBand).connect(paperGain).connect(panner);
    this.trackSource(crowd, [crowdBand, crowdGain, paperBand, paperGain, panner]);
    crowd.start(start);
    crowd.stop(start + 1.64);

    const sub = context.createOscillator();
    const subGain = context.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(57, start);
    sub.frequency.exponentialRampToValueAtTime(29, start + 0.72);
    subGain.gain.setValueAtTime(0.0001, start);
    subGain.gain.exponentialRampToValueAtTime(0.18 * intensity, start + 0.025);
    subGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.78);
    sub.connect(subGain).connect(bus);
    this.trackSource(sub, [subGain]);
    sub.start(start);
    sub.stop(start + 0.8);
  }

  private playNetRattle(start: number, intensity: number): void {
    const context = this.context;
    const bus = this.effectsBus;
    if (!context || !bus) return;

    [
      {delay: 0, frequency: 1850, peak: 0.12, pan: -0.32, seed: 0x6e715},
      {delay: 0.018, frequency: 3520, peak: 0.082, pan: 0.38, seed: 0x6e716},
    ].forEach((layer) => {
      const layerStart = start + layer.delay;
      const source = context.createBufferSource();
      const filter = context.createBiquadFilter();
      const panner = context.createStereoPanner();
      const gain = context.createGain();
      source.buffer = this.noiseBuffer(0.86, 'rattle', layer.seed);
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(layer.frequency, layerStart);
      filter.frequency.exponentialRampToValueAtTime(
        layer.frequency * 0.62,
        layerStart + 0.78,
      );
      filter.Q.value = 1.15;
      panner.pan.value = layer.pan;
      gain.gain.setValueAtTime(0.0001, layerStart);
      gain.gain.exponentialRampToValueAtTime(layer.peak * intensity, layerStart + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, layerStart + 0.82);
      source.connect(filter).connect(panner).connect(gain).connect(bus);
      this.trackSource(source, [filter, panner, gain]);
      source.start(layerStart);
      source.stop(layerStart + 0.85);
    });

    const ball = context.createOscillator();
    const ballGain = context.createGain();
    ball.type = 'sine';
    ball.frequency.setValueAtTime(126, start);
    ball.frequency.exponentialRampToValueAtTime(52, start + 0.13);
    ballGain.gain.setValueAtTime(0.0001, start);
    ballGain.gain.exponentialRampToValueAtTime(0.085 * intensity, start + 0.004);
    ballGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.14);
    ball.connect(ballGain).connect(bus);
    this.trackSource(ball, [ballGain]);
    ball.start(start);
    ball.stop(start + 0.15);
  }

  private playGloveSave(start: number, intensity: number): void {
    const context = this.context;
    const bus = this.effectsBus;
    if (!context || !bus) return;

    const glove = context.createBufferSource();
    const gloveFilter = context.createBiquadFilter();
    const gloveGain = context.createGain();
    const slapFilter = context.createBiquadFilter();
    const slapGain = context.createGain();
    glove.buffer = this.noiseBuffer(0.34, 'white', 0x61a0e);
    gloveFilter.type = 'lowpass';
    gloveFilter.frequency.setValueAtTime(1450, start);
    gloveFilter.frequency.exponentialRampToValueAtTime(310, start + 0.29);
    gloveFilter.Q.value = 0.72;
    gloveGain.gain.setValueAtTime(0.0001, start);
    gloveGain.gain.exponentialRampToValueAtTime(0.5 * intensity, start + 0.004);
    gloveGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.31);
    slapFilter.type = 'bandpass';
    slapFilter.frequency.value = 1900;
    slapFilter.Q.value = 0.74;
    slapGain.gain.setValueAtTime(0.0001, start);
    slapGain.gain.exponentialRampToValueAtTime(0.29 * intensity, start + 0.003);
    slapGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.085);
    glove.connect(gloveFilter).connect(gloveGain).connect(bus);
    glove.connect(slapFilter).connect(slapGain).connect(bus);
    this.trackSource(glove, [gloveFilter, gloveGain, slapFilter, slapGain]);
    glove.start(start);
    glove.stop(start + 0.33);

    const body = context.createOscillator();
    const bodyGain = context.createGain();
    body.type = 'sine';
    body.frequency.setValueAtTime(112, start);
    body.frequency.exponentialRampToValueAtTime(43, start + 0.2);
    bodyGain.gain.setValueAtTime(0.0001, start);
    bodyGain.gain.exponentialRampToValueAtTime(0.34 * intensity, start + 0.006);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);
    body.connect(bodyGain).connect(bus);
    this.trackSource(body, [bodyGain]);
    body.start(start);
    body.stop(start + 0.23);
  }

  private playCrowdSigh(start: number, intensity: number): void {
    const context = this.context;
    const bus = this.effectsBus;
    if (!context || !bus) return;

    const air = context.createBufferSource();
    const airFilter = context.createBiquadFilter();
    const airGain = context.createGain();
    air.buffer = this.noiseBuffer(1.38, 'pink', 0x5100e);
    airFilter.type = 'bandpass';
    airFilter.frequency.setValueAtTime(1050, start);
    airFilter.frequency.exponentialRampToValueAtTime(330, start + 1.28);
    airFilter.Q.value = 0.64;
    airGain.gain.setValueAtTime(0.0001, start);
    airGain.gain.exponentialRampToValueAtTime(0.14 * intensity, start + 0.08);
    airGain.gain.exponentialRampToValueAtTime(0.0001, start + 1.34);
    air.connect(airFilter).connect(airGain).connect(bus);
    this.trackSource(air, [airFilter, airGain]);
    air.start(start);
    air.stop(start + 1.37);

    [154, 184, 221, 264].forEach((frequency, index) => {
      const voice = context.createOscillator();
      const gain = context.createGain();
      const panner = context.createStereoPanner();
      voice.type = index % 2 === 0 ? 'sine' : 'triangle';
      voice.frequency.setValueAtTime(frequency, start);
      voice.frequency.exponentialRampToValueAtTime(frequency * 0.72, start + 1.16);
      panner.pan.value = -0.58 + index * 0.39;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.028 * intensity, start + 0.075);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 1.22);
      voice.connect(gain).connect(panner).connect(bus);
      this.trackSource(voice, [gain, panner]);
      voice.start(start);
      voice.stop(start + 1.24);
    });
  }

  private playMiss(start: number): void {
    const context = this.context;
    const bus = this.effectsBus;
    if (!context || !bus) return;

    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const panner = context.createStereoPanner();
    const gain = context.createGain();
    source.buffer = this.noiseBuffer(1.1, 'white', 0x5155ed);
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(2100, start);
    filter.frequency.exponentialRampToValueAtTime(420, start + 1.02);
    filter.Q.value = 0.9;
    panner.pan.setValueAtTime(0.05, start);
    panner.pan.linearRampToValueAtTime(0.75, start + 0.95);
    gain.gain.setValueAtTime(0.095, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 1.04);
    source.connect(filter).connect(panner).connect(gain).connect(bus);
    this.trackSource(source, [filter, panner, gain]);
    source.start(start);
    source.stop(start + 1.08);
  }

  private noiseBuffer(duration: number, profile: NoiseProfile, seed: number): AudioBuffer {
    const context = this.context;
    if (!context) throw new Error('Audio graph must exist before creating noise.');

    const key = `${profile}:${duration}:${seed}:${context.sampleRate}`;
    const cached = this.noiseBuffers.get(key);
    if (cached) return cached;

    const length = Math.max(1, Math.ceil(duration * context.sampleRate));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const output = buffer.getChannelData(0);
    let randomState = seed >>> 0;
    const random = () => {
      randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
      return randomState / 0x100000000;
    };

    let pink0 = 0;
    let pink1 = 0;
    let pink2 = 0;
    let pink3 = 0;
    let pink4 = 0;
    let pink5 = 0;
    let pink6 = 0;

    for (let index = 0; index < length; index += 1) {
      const white = random() * 2 - 1;

      if (profile === 'pink') {
        pink0 = 0.99886 * pink0 + white * 0.0555179;
        pink1 = 0.99332 * pink1 + white * 0.0750759;
        pink2 = 0.969 * pink2 + white * 0.153852;
        pink3 = 0.8665 * pink3 + white * 0.3104856;
        pink4 = 0.55 * pink4 + white * 0.5329522;
        pink5 = -0.7616 * pink5 - white * 0.016898;
        output[index] =
          (pink0 + pink1 + pink2 + pink3 + pink4 + pink5 + pink6 + white * 0.5362) *
          0.105;
        pink6 = white * 0.115926;
      } else if (profile === 'fold') {
        const crack = random() > 0.992 ? (random() * 2 - 1) * 0.94 : 0;
        output[index] = white * 0.2 + crack;
      } else if (profile === 'rattle') {
        const knot = random() > 0.986 ? (random() * 2 - 1) * 0.9 : 0;
        output[index] = white * 0.045 + knot;
      } else {
        output[index] = white * 0.72;
      }
    }

    this.noiseBuffers.set(key, buffer);
    return buffer;
  }

  private trackSource(
    source: AudioScheduledSourceNode,
    ownedNodes: AudioNode[],
    flight = false,
  ): void {
    this.activeSources.add(source);
    if (flight) this.flightSources.add(source);

    source.addEventListener(
      'ended',
      () => {
        this.activeSources.delete(source);
        this.flightSources.delete(source);
        source.disconnect();
        for (const node of ownedNodes) node.disconnect();
      },
      {once: true},
    );
  }

  private stopFlight(): void {
    for (const source of this.flightSources) {
      this.safeStop(source);
    }
    this.flightSources.clear();
  }

  private stopTransientSources(): void {
    for (const source of this.activeSources) {
      this.safeStop(source);
    }
    this.activeSources.clear();
    this.flightSources.clear();
  }

  private safeStop(source: AudioScheduledSourceNode | null): void {
    if (!source) return;
    try {
      source.stop();
    } catch {
      // It is harmless to stop an already-ended scheduled source.
    }
  }

  private runningContext(): AudioContext | null {
    return this.context?.state === 'running' ? this.context : null;
  }

  private ramp(parameter: AudioParam, value: number, duration: number, now: number): void {
    parameter.cancelScheduledValues(now);
    parameter.setValueAtTime(parameter.value, now);
    parameter.linearRampToValueAtTime(value, now + duration);
  }
}

export const lastKickAudio = new LastKickAudio();
