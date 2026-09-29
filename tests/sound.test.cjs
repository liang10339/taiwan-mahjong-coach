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
console.log(
  'PASS: Chinese tile names, voice selection/styles, persistence, queued calls, mute/reset, missing voices and unavailable audio.',
);
