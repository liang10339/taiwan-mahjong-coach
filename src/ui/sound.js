(function (root) {
  'use strict';
  // 音效全部以 Web Audio 即時合成，不需要音檔；喊牌使用瀏覽器內建的中文語音。
  const KEY = 'mahjong-coach-sound';
  let enabled = true,
    ctx = null;
  const profiles = {
    natural: { label: '自然原聲', pitch: 1, rate: 1.15 },
    male: { label: '男聲風格（模擬）', pitch: 0.8, rate: 1.1 },
    female: { label: '女聲風格（模擬）', pitch: 1.2, rate: 1.15 },
    elder: { label: '長者風格（模擬）', pitch: 0.85, rate: 0.9 },
    child: { label: '童聲風格（模擬）', pitch: 1.5, rate: 1.2 },
  };
  let voiceId = '',
    profile = 'natural';
  try {
    voiceId = root.localStorage.getItem(KEY + '-voice') || '';
    const saved = root.localStorage.getItem(KEY + '-profile');
    if (profiles[saved]) profile = saved;
  } catch (e) {}
  try {
    enabled = root.localStorage.getItem(KEY) !== 'off';
  } catch (e) {}

  function audio() {
    if (!enabled) return null;
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return null;
    if (!ctx) ctx = new AC();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  let noiseBuffer = null;
  function noise(c) {
    if (noiseBuffer) return noiseBuffer;
    noiseBuffer = c.createBuffer(1, c.sampleRate * 0.25, c.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return noiseBuffer;
  }
  // 一次「喀」：高頻的撞擊聲＋低頻的桌面悶響
  function clack(c, when, { gain = 0.5, pitch = 2600, thump = 170, length = 0.07 } = {}) {
    const src = c.createBufferSource();
    src.buffer = noise(c);
    const band = c.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = pitch;
    band.Q.value = 2.2;
    const g = c.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(gain, when + 0.002);
    g.gain.exponentialRampToValueAtTime(0.001, when + length);
    src.connect(band).connect(g).connect(c.destination);
    src.start(when);
    src.stop(when + length + 0.02);
    if (thump) {
      const osc = c.createOscillator(),
        og = c.createGain();
      osc.frequency.setValueAtTime(thump, when);
      osc.frequency.exponentialRampToValueAtTime(thump * 0.55, when + 0.09);
      og.gain.setValueAtTime(gain * 0.7, when);
      og.gain.exponentialRampToValueAtTime(0.001, when + 0.1);
      osc.connect(og).connect(c.destination);
      osc.start(when);
      osc.stop(when + 0.12);
    }
  }
  function tone(c, when, freq, dur, gain = 0.18, type = 'triangle') {
    const osc = c.createOscillator(),
      g = c.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(gain, when + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, when + dur);
    osc.connect(g).connect(c.destination);
    osc.start(when);
    osc.stop(when + dur + 0.05);
  }
  const effects = {
    select: (c) => clack(c, c.currentTime, { gain: 0.12, pitch: 3400, thump: 0, length: 0.03 }),
    draw: (c) => clack(c, c.currentTime, { gain: 0.28, pitch: 3000, thump: 220, length: 0.05 }),
    discard: (c) => {
      const t = c.currentTime;
      clack(c, t, { gain: 0.6, pitch: 2400, thump: 160 });
      clack(c, t + 0.045, { gain: 0.18, pitch: 2900, thump: 0, length: 0.04 });
    },
    claim: (c) => {
      const t = c.currentTime;
      clack(c, t, { gain: 0.5 });
      clack(c, t + 0.11, { gain: 0.5, pitch: 2200 });
      clack(c, t + 0.2, { gain: 0.35, pitch: 2700, thump: 0 });
    },
    shuffle: (c) => {
      const t = c.currentTime;
      for (let i = 0; i < 46; i++)
        clack(c, t + Math.random() * 1.3, {
          gain: 0.08 + Math.random() * 0.18,
          pitch: 2000 + Math.random() * 1800,
          thump: Math.random() < 0.3 ? 140 : 0,
          length: 0.04,
        });
    },
    win: (c) => {
      const t = c.currentTime;
      [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => tone(c, t + i * 0.11, f, 0.7 - i * 0.05));
      tone(c, t + 0.55, 1567.98, 1.1, 0.12, 'sine');
    },
    lose: (c) => {
      const t = c.currentTime;
      [392, 329.63, 261.63].forEach((f, i) => tone(c, t + i * 0.16, f, 0.5, 0.14));
    },
    // 三顆骰子在碗裡滾動
    dice: (c) => {
      const t = c.currentTime;
      for (let i = 0; i < 9; i++)
        clack(c, t + i * 0.055 + Math.random() * 0.03, {
          gain: 0.12 + Math.random() * 0.12,
          pitch: 3200 + Math.random() * 1200,
          thump: 0,
          length: 0.03,
        });
    },
    tick: (c) => tone(c, c.currentTime, 880, 0.08, 0.06, 'sine'),
  };
  function play(name) {
    try {
      const c = audio();
      if (c && effects[name]) effects[name](c);
    } catch (e) {}
  }
  // 中文牌名，不朗讀數字代碼；索子以台灣常用的「條」報牌。
  function tileName(t) {
    if (!Number.isInteger(t) || t < 0 || t > 41) return '';
    return t < 27
      ? '一二三四五六七八九'[t % 9] + ['萬', '筒', '條'][Math.floor(t / 9)]
      : [
          '東風',
          '南風',
          '西風',
          '北風',
          '紅中',
          '青發',
          '白板',
          '春',
          '夏',
          '秋',
          '冬',
          '梅',
          '蘭',
          '竹',
          '菊',
        ][t - 27];
  }
  function voices() {
    return root.speechSynthesis?.getVoices().filter((v) => /^zh|^cmn/i.test(v.lang)) || [];
  }
  function setVoice(id, style) {
    voiceId = id || '';
    profile = profiles[style] ? style : 'natural';
    try {
      root.localStorage.setItem(KEY + '-voice', voiceId);
      root.localStorage.setItem(KEY + '-profile', profile);
    } catch (e) {}
  }
  function stop() {
    waiting.length = 0;
    try {
      root.speechSynthesis?.cancel();
    } catch (e) {}
  }

  // 瀏覽器規定：使用者點一下或按鍵之後，網頁才能出聲。
  // 第一次互動時同時解鎖音效（AudioContext）與語音，之後電腦出牌的音效和報牌才不會被擋掉。
  let unlocked = false;
  function unlock() {
    if (unlocked) return;
    unlocked = true;
    try {
      audio(); // 建立或恢復 AudioContext（必須在使用者互動當下）
    } catch (e) {}
    try {
      // 唸一段無聲的內容，讓語音引擎取得使用者互動授權（Chrome 需要）
      if (root.speechSynthesis && root.SpeechSynthesisUtterance) {
        const u = new root.SpeechSynthesisUtterance(' ');
        u.volume = 0;
        root.speechSynthesis.speak(u);
      }
    } catch (e) {}
  }
  if (root.addEventListener)
    for (const type of ['pointerdown', 'keydown', 'touchend'])
      root.addEventListener(type, unlock, { capture: true, passive: true });

  // 有些瀏覽器（例如 Windows 的 Chrome）開頁時語音清單是空的，稍後才載入。
  // 還沒載入時先把報牌排隊（只留最近幾句），載入後補唸，第一局就不會沒有聲音。
  const waiting = [];
  function voicesReady() {
    try {
      return root.speechSynthesis.getVoices().length > 0;
    } catch (e) {
      return false;
    }
  }
  function flush() {
    while (waiting.length && voices().length) speakNow(waiting.shift());
  }
  try {
    root.speechSynthesis?.addEventListener?.('voiceschanged', flush);
  } catch (e) {}
  // 排隊報牌，不能讓下一家的報牌把前一張切斷。
  function say(text) {
    if (!text || !enabled || !root.speechSynthesis || !root.SpeechSynthesisUtterance) return false;
    if (!voicesReady()) {
      waiting.push(text);
      if (waiting.length > 3) waiting.shift();
      return false;
    }
    return speakNow(text);
  }
  function speakNow(text) {
    try {
      const available = voices(),
        voice =
          available.find((v) => v.voiceURI === voiceId) ||
          available.find((v) => /^zh[-_]TW$/i.test(v.lang)) ||
          available[0];
      if (!voice) return false;
      const u = new root.SpeechSynthesisUtterance(text);
      u.lang = voice.lang;
      u.voice = voice;
      u.rate = profiles[profile].rate;
      u.pitch = profiles[profile].pitch;
      root.speechSynthesis.speak(u);
      return true;
    } catch (e) {
      return false;
    }
  }
  function setEnabled(on) {
    enabled = !!on;
    try {
      root.localStorage.setItem(KEY, on ? 'on' : 'off');
    } catch (e) {}
    if (!on && root.speechSynthesis)
      try {
        root.speechSynthesis.cancel();
      } catch (e) {}
  }
  const api = {
    play,
    say,
    unlock,
    tileName,
    voices,
    profiles,
    setVoice,
    stop,
    settings: () => ({ voiceId, profile }),
    setEnabled,
    isEnabled: () => enabled,
  };
  if (typeof module !== 'undefined') module.exports = api;
  else root.Sound = api;
})(globalThis);
