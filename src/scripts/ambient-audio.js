// 水下環境音與聲納音效：全部用 Web Audio API 即時合成，沒有任何音檔
// 預設靜音；只有在使用者操作之後才建立 AudioContext（瀏覽器的自動播放規定）
const STORE_KEY = 'deepecho-sound';

export function createAmbientAudio(cfg) {
  const A = cfg.audio;
  let ctx = null;
  let master = null;
  let pingBus = null;
  let enabled = readChoice();
  const listeners = new Set();

  function readChoice() {
    try { return window.localStorage.getItem(STORE_KEY) === 'on'; } catch { return false; }
  }
  function saveChoice(on) {
    try { window.localStorage.setItem(STORE_KEY, on ? 'on' : 'off'); } catch { /* 儲存被封鎖 */ }
  }

  // 棕色雜訊：低頻的水流聲
  function brownNoise(seconds) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    }
    return buf;
  }

  function build() {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return false;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);

    // 低鳴：幾個略微走音的低頻正弦波，經過緩慢開合的低通濾波
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = A.filterHz;
    lowpass.Q.value = 0.8;
    lowpass.connect(master);

    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = A.filterLfoHz;
    lfoGain.gain.value = A.filterLfoDepth;
    lfo.connect(lfoGain).connect(lowpass.frequency);
    lfo.start();

    A.droneFreqs.forEach((f, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = f;
      g.gain.value = A.droneGain / (i + 1);
      osc.connect(g).connect(lowpass);
      osc.start();
    });

    const noise = ctx.createBufferSource();
    noise.buffer = brownNoise(6);
    noise.loop = true;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = A.noiseGain;
    noise.connect(noiseGain).connect(lowpass);
    noise.start();

    // 聲納：回音用延遲加回授
    pingBus = ctx.createGain();
    const delay = ctx.createDelay(2);
    delay.delayTime.value = A.echoDelay;
    const feedback = ctx.createGain();
    feedback.gain.value = A.echoFeedback;
    const echoFilter = ctx.createBiquadFilter();
    echoFilter.type = 'lowpass';
    echoFilter.frequency.value = 1800;
    pingBus.connect(master);
    pingBus.connect(delay);
    delay.connect(echoFilter).connect(feedback).connect(delay);
    echoFilter.connect(master);
    return true;
  }

  function fade(to, seconds) {
    if (!ctx) return;
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(to, now + seconds);
  }

  // 必須在使用者操作的事件處理中呼叫
  function start() {
    if (!ctx && !build()) return;
    if (ctx.state === 'suspended') ctx.resume();
    fade(enabled ? A.masterGain : 0, 1.2);
  }

  function ping(level = 1) {
    if (!ctx || !enabled || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(A.pingFreq, now);
    osc.frequency.exponentialRampToValueAtTime(A.pingFreq * 0.94, now + A.pingDecay);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(A.pingGain * level, now + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, now + A.pingDecay);
    osc.connect(g).connect(pingBus);
    osc.start(now);
    osc.stop(now + A.pingDecay + 0.1);
  }

  function setEnabled(on) {
    enabled = on;
    saveChoice(on);
    if (on) start(); else fade(0, 0.5);
    listeners.forEach((fn) => fn(on));
  }

  // 記住「開啟」的訪客：等到第一次互動才開始播放
  if (enabled) {
    const kick = () => {
      start();
      window.removeEventListener('pointerdown', kick);
      window.removeEventListener('keydown', kick);
    };
    window.addEventListener('pointerdown', kick);
    window.addEventListener('keydown', kick);
  }

  return {
    get enabled() { return enabled; },
    setEnabled,
    toggle() { setEnabled(!enabled); if (enabled) setTimeout(() => ping(0.8), 250); },
    ping,
    onChange(fn) { listeners.add(fn); },
  };
}
