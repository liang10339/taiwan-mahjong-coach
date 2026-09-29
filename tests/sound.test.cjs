const vm = require('node:vm'),
  fs = require('node:fs'),
  assert = require('node:assert/strict');
const spoken = [],
  storage = new Map();
let cancelled = 0;
const voices = [
  { voiceURI: 'en', lang: 'en-US', name: 'English' },
  { voiceURI: 'tw', lang: 'zh-TW', name: 'Chinese TW' },
  { voiceURI: 'cn', lang: 'zh-CN', name: 'Chinese CN' },
];
const c = vm.createContext({
  localStorage: { getItem: (k) => storage.get(k), setItem: (k, v) => storage.set(k, v) },
  speechSynthesis: { getVoices: () => voices, speak: (u) => spoken.push(u), cancel: () => cancelled++ },
  SpeechSynthesisUtterance: function (text) {
    this.text = text;
  },
});
const source = fs.readFileSync(__dirname + '/../src/ui/sound.js', 'utf8');
vm.runInContext(source, c);
const S = c.Sound;
assert.equal(S.tileName(7), '八萬');
assert.equal(S.tileName(16), '八筒');
assert.equal(S.tileName(25), '八條');
assert.equal(S.tileName(33), '白板');
assert.equal(S.tileName(-1), '');
assert.equal(S.voices().length, 2);
S.say(S.tileName(7));
assert.equal(spoken[0].text, '八萬');
assert.equal(spoken[0].voice.voiceURI, 'tw');
S.say('碰');
assert.equal(cancelled, 0, 'Consecutive calls must queue, not interrupt');
for (const style of ['male', 'female', 'elder', 'child']) {
  S.setVoice('cn', style);
  assert.equal(S.say('八萬'), true);
  assert.equal(spoken.at(-1).voice.voiceURI, 'cn');
  assert.equal(spoken.at(-1).pitch, S.profiles[style].pitch);
}
vm.runInContext(source, c);
assert.equal(c.Sound.settings().profile, 'child');
assert.equal(c.Sound.settings().voiceId, 'cn');
S.setVoice('missing', 'invalid');
S.say('白板');
assert.equal(spoken.at(-1).voice.voiceURI, 'tw');
assert.equal(S.settings().profile, 'natural');
const count = spoken.length;
S.setEnabled(false);
assert.equal(S.say('八萬'), false);
assert.equal(spoken.length, count);
assert.ok(cancelled);
S.setEnabled(true);
S.stop();
voices.length = 0;
assert.equal(S.say('八萬'), false);
S.play('discard');
// 語音清單稍後才載入：先排隊，載入後補唸（只留最近 3 句）
{
  const later = [],
    said = [],
    handlers = {},
    windowHandlers = {};
  let resumed = 0;
  const ctx2 = vm.createContext({
    localStorage: { getItem: () => null, setItem() {} },
    addEventListener: (type, fn) => (windowHandlers[type] = fn),
    AudioContext: function () {
      this.state = 'suspended';
      this.resume = () => resumed++;
    },
    speechSynthesis: {
      getVoices: () => later,
      speak: (u) => said.push(u.text),
      cancel() {},
      addEventListener: (type, fn) => (handlers[type] = fn),
    },
    SpeechSynthesisUtterance: function (text) {
      this.text = text;
    },
  });
  vm.runInContext(source, ctx2);
  const S2 = ctx2.Sound;
  for (const t of ['一萬', '二萬', '三萬', '四萬']) assert.equal(S2.say(t), false);
  assert.equal(said.length, 0, '語音還沒載入時不能出聲');
  later.push({ voiceURI: 'tw', lang: 'zh-TW', name: 'TW' });
  handlers.voiceschanged();
  assert.deepEqual(said, ['二萬', '三萬', '四萬'], '載入後補唸最近 3 句');
  // 第一次點擊時解鎖音效與語音
  assert.ok(windowHandlers.pointerdown, '要監聽第一次點擊');
  windowHandlers.pointerdown();
  assert.equal(resumed, 1, '解鎖時要 resume AudioContext');
  assert.equal(said.at(-1), ' ', '解鎖時唸一段無聲內容取得語音授權');
  windowHandlers.keydown();
  assert.equal(resumed, 1, '只解鎖一次');
}
console.log(
  'PASS: Chinese tile names, voice selection/styles, persistence, queued calls, mute/reset, missing voices and unavailable audio, voices loading late, first-click unlock.',
);
