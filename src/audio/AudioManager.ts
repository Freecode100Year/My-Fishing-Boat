export class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfx: GainNode | null = null;
  private ambientGain: GainNode | null = null;
  private engineGain: GainNode | null = null;
  private engineOscA: OscillatorNode | null = null;
  private engineOscB: OscillatorNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private volume = 0.65;
  private unlocked = false;
  private paused = false;
  private engineLevel = 0;

  async unlock(): Promise<void> {
    if (this.unlocked) {
      await this.ctx?.resume();
      return;
    }
    try {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
      await this.ctx.resume();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);

      this.sfx = this.ctx.createGain();
      this.sfx.gain.value = 0.75;
      this.sfx.connect(this.master);

      this.ambientGain = this.ctx.createGain();
      this.ambientGain.gain.value = 0.16;
      this.ambientGain.connect(this.master);

      this.noiseBuffer = this.createNoiseBuffer(3.2);
      this.startAmbient();
      this.startEngine();
      this.unlocked = true;
    } catch (err) {
      console.warn('Audio unavailable:', err);
    }
  }

  private createNoiseBuffer(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      last = last * 0.965 + white * 0.035;
      data[i] = last * 3.2;
    }
    return buffer;
  }

  private startAmbient(): void {
    if (!this.ctx || !this.noiseBuffer || !this.ambientGain) return;
    const source = this.ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 620;
    filter.Q.value = 0.7;
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.09;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 180;
    lfo.connect(lfoGain).connect(filter.frequency);
    lfo.start();
    source.connect(filter).connect(this.ambientGain);
    source.start();
  }

  private startEngine(): void {
    if (!this.ctx || !this.master) return;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 320;
    this.engineFilter.Q.value = 2.2;
    this.engineOscA = this.ctx.createOscillator();
    this.engineOscA.type = 'sawtooth';
    this.engineOscA.frequency.value = 38;
    this.engineOscB = this.ctx.createOscillator();
    this.engineOscB.type = 'triangle';
    this.engineOscB.frequency.value = 57;
    const gB = this.ctx.createGain();
    gB.gain.value = 0.35;
    this.engineOscA.connect(this.engineFilter);
    this.engineOscB.connect(gB).connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain).connect(this.master);
    this.engineOscA.start();
    this.engineOscB.start();
  }

  setVolume(value: number): void {
    this.volume = Math.max(0, Math.min(1, value));
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.08);
    }
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    if (!this.ctx) return;
    if (paused) {
      this.engineGain?.gain.setTargetAtTime(0, this.ctx.currentTime, 0.12);
      this.ambientGain?.gain.setTargetAtTime(0.035, this.ctx.currentTime, 0.2);
    } else {
      this.ambientGain?.gain.setTargetAtTime(0.16, this.ctx.currentTime, 0.3);
    }
  }

  update(speedRatio: number, throttle: number): void {
    if (!this.ctx || !this.engineGain || !this.engineOscA || !this.engineOscB || !this.engineFilter) return;
    const target = this.paused ? 0 : 0.022 + speedRatio * 0.075 + Math.abs(throttle) * 0.03;
    this.engineLevel += (target - this.engineLevel) * 0.08;
    this.engineGain.gain.setTargetAtTime(this.engineLevel, this.ctx.currentTime, 0.08);
    const pitch = 38 + speedRatio * 40 + Math.abs(throttle) * 8;
    this.engineOscA.frequency.setTargetAtTime(pitch, this.ctx.currentTime, 0.12);
    this.engineOscB.frequency.setTargetAtTime(pitch * 1.51, this.ctx.currentTime, 0.12);
    this.engineFilter.frequency.setTargetAtTime(260 + speedRatio * 480, this.ctx.currentTime, 0.1);
  }

  private tone(
    frequency: number,
    duration: number,
    type: OscillatorType = 'sine',
    gain = 0.2,
    freqEnd?: number,
    delay = 0,
  ): void {
    if (!this.ctx || !this.sfx) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, t0);
    if (freqEnd !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + duration);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(g).connect(this.sfx);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  private noise(duration: number, gain: number, frequency: number, type: BiquadFilterType = 'lowpass', delay = 0, frequencyEnd?: number): void {
    if (!this.ctx || !this.sfx || !this.noiseBuffer) return;
    const t0 = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.playbackRate.value = 0.7 + Math.random() * 0.6;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(frequency, t0);
    if (frequencyEnd !== undefined) filter.frequency.exponentialRampToValueAtTime(Math.max(30, frequencyEnd), t0 + duration);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    src.connect(filter).connect(g).connect(this.sfx);
    src.start(t0);
    src.stop(t0 + duration + 0.05);
  }

  cannon(): void {
    this.noise(0.28, 0.5, 1100, 'lowpass', 0, 130);
    this.tone(92, 0.22, 'triangle', 0.32, 38);
    this.tone(320, 0.06, 'square', 0.08, 90);
  }

  hit(crit = false): void {
    if (crit) {
      this.tone(880, 0.16, 'square', 0.14, 320);
      this.tone(1580, 0.12, 'sine', 0.12, 620);
      this.noise(0.14, 0.16, 3400, 'highpass');
    } else {
      this.tone(240 + Math.random() * 120, 0.08, 'square', 0.08, 100);
      this.noise(0.07, 0.1, 2400, 'bandpass');
    }
  }

  explosion(scale = 1): void {
    this.noise(0.75 * scale, 0.55, 900, 'lowpass', 0, 70);
    this.tone(55, 0.55, 'sine', 0.25, 24);
  }

  splash(): void {
    this.noise(0.45, 0.14, 1600, 'bandpass', 0, 350);
  }

  pickup(): void {
    this.tone(520, 0.09, 'sine', 0.13, 640);
    this.tone(780, 0.13, 'sine', 0.09, 900, 0.06);
  }

  levelUp(): void {
    [392, 523, 659].forEach((f, i) => this.tone(f, 0.28, 'triangle', 0.14, f * 1.01, i * 0.11));
    this.noise(0.35, 0.07, 2600, 'bandpass', 0.1);
  }

  heatStart(): void {
    this.tone(70, 1.5, 'sawtooth', 0.18, 420);
    this.noise(1.4, 0.24, 300, 'lowpass', 0, 4200);
    [220, 330, 440].forEach((f, i) => this.tone(f, 0.8, 'sine', 0.1, f * 2, i * 0.15));
  }

  heatEnd(): void {
    this.tone(280, 0.6, 'sine', 0.1, 55);
    this.noise(0.5, 0.08, 800, 'lowpass', 0, 100);
  }

  hurt(): void {
    this.noise(0.36, 0.25, 440, 'lowpass', 0, 80);
    this.tone(78, 0.32, 'square', 0.08, 42);
  }

  alarm(): void {
    this.tone(620, 0.18, 'square', 0.06, 520);
    this.tone(620, 0.18, 'square', 0.06, 520, 0.26);
  }

  ui(): void {
    this.tone(480, 0.045, 'square', 0.035, 390);
  }

  boost(): void {
    this.noise(0.55, 0.22, 500, 'bandpass', 0, 2600);
    this.tone(90, 0.45, 'sawtooth', 0.09, 210);
  }

  combo(count: number): void {
    const base = 440 + Math.min(count, 30) * 14;
    [1, 1.25, 1.5].forEach((m, i) => this.tone(base * m, 0.12, 'square', 0.07, base * m * 1.02, i * 0.06));
  }

  denied(): void {
    this.tone(150, 0.12, 'square', 0.06, 95);
  }
}
