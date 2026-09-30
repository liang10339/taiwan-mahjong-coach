// 測試共用工具：依 index.html 的 <script> 順序載入介面程式，讓測試和瀏覽器載入完全相同的檔案。
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');

/** 讀取專案內的檔案（路徑相對於專案根目錄） */
function read(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

/** index.html 依序載入的腳本（去掉 ?v= 版本參數） */
function pageScripts() {
  const html = read('index.html');
  return [...html.matchAll(/<script[^>]*\ssrc="([^"?]+)(?:\?[^"]*)?"/g)].map((m) => m[1]);
}

/** index.html 載入的樣式表（只算本機檔案） */
function pageStyles() {
  const html = read('index.html');
  return [...html.matchAll(/<link[^>]*rel="stylesheet"[^>]*href="([^"?]+)(?:\?[^"]*)?"/g)]
    .map((m) => m[1])
    .filter((href) => !/^https?:/.test(href));
}

/**
 * 把牌面與實戰介面（src/ui/tiles.js 與 src/ui/app/*.js）載入 vm context。
 * 核心邏輯（Mahjong、Coach…）與音效由各測試自行放進 context，方便替換成測試替身。
 */
function loadApp(context) {
  const files = pageScripts().filter((f) => f === 'src/ui/tiles.js' || f.startsWith('src/ui/app/'));
  for (const file of files) vm.runInContext(read(file), context, { filename: file });
  return files;
}

/** 測試用的簡化 DOM 元素：記錄子元素、class、屬性與事件處理函式 */
class FakeElement {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.attributes = {};
    this.dataset = {};
    this.style = { setProperty() {} };
    this.textContent = '';
    const cls = new Set();
    this._cls = cls;
    this.classList = {
      add: (...x) => x.forEach((c) => cls.add(c)),
      remove: (...x) => x.forEach((c) => cls.delete(c)),
      toggle: (c, on) => {
        if (on === undefined ? !cls.has(c) : on) cls.add(c);
        else cls.delete(c);
        return cls.has(c);
      },
      contains: (c) => cls.has(c),
    };
  }
  set className(v) {
    this._cls.clear();
    String(v)
      .split(/\s+/)
      .filter(Boolean)
      .forEach((c) => this._cls.add(c));
  }
  get className() {
    return [...this._cls].join(' ');
  }
  replaceChildren(...x) {
    this.children = [...x];
  }
  append(...x) {
    this.children.push(...x);
  }
  setAttribute(k, v) {
    this.attributes[k] = String(v);
  }
  addEventListener() {}
}

/**
 * 建立可以跑完整介面程式的 vm context：核心模組、牌面、假 DOM、可手動執行的計時器。
 * 回傳 run（在 context 裡執行程式碼）、get（依選擇器取元素）、flush（跑完所有計時器）、text（元素內所有文字）。
 */
function createUiContext({ storage = {} } = {}) {
  const nodes = new Map();
  const get = (s) => {
    if (!nodes.has(s)) nodes.set(s, new FakeElement());
    return nodes.get(s);
  };
  const timers = new Map();
  let id = 0;
  const store = new Map(Object.entries(storage));
  const context = vm.createContext({
    Mahjong: require('../src/core/engine.js'),
    Observation: require('../src/core/observation.js'),
    Coach: require('../src/core/coach.js'),
    Scoring: require('../src/core/scoring.js'),
    AI: require('../src/core/ai.js'),
    HandValue: require('../src/core/handvalue.js'),
    Opponents: require('../src/core/opponents.js'),
    Safety: require('../src/core/safety.js'),
    Policy: require('../src/core/policy.js'),
    Situation: require('../src/core/situation.js'),
    Advisor: require('../src/core/advisor.js'),
    Quiz: require('../src/core/quiz.js'),
    Notebook: require('../src/core/notebook.js'),
    Growth: require('../src/core/growth.js'),
    Fairness: require('../src/core/fairness.js'),
    Record: require('../src/core/record.js'),
    SeatRecord: require('../src/core/seatrecord.js'),
    Sound: {
      play() {},
      say() {},
      unlock() {},
      tileName: () => '',
      stop() {},
      setEnabled() {},
      isEnabled: () => true,
    },
    document: { querySelector: get, querySelectorAll: () => [], createElement: (t) => new FakeElement(t) },
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
    navigator: {},
    location: { hash: '', origin: 'https://example.test', pathname: '/' },
    history: { replaceState() {} },
    setTimeout: (f) => {
      timers.set(++id, f);
      return id;
    },
    clearTimeout: (i) => timers.delete(i),
    console,
    Math,
  });
  loadApp(context);
  const run = (code) => vm.runInContext(code, context);
  const flush = () => {
    let guard = 0;
    while (timers.size && guard++ < 10000) {
      const [i, f] = timers.entries().next().value;
      timers.delete(i);
      f();
    }
  };
  const text = (n) => [n.textContent || '', ...(n.children || []).map(text)].join(' ');
  const button = (container, label) => {
    const b = get(container).children.find((x) => x.tagName === 'BUTTON' && x.textContent.includes(label));
    if (!b)
      throw new Error(
        '找不到按鈕：' +
          label +
          '（有：' +
          get(container)
            .children.map((x) => x.textContent)
            .join('、') +
          '）',
      );
    return b;
  };
  return { context, run, get, flush, text, timers, store, button };
}

module.exports = { ROOT, read, pageScripts, pageStyles, loadApp, createUiContext, FakeElement };
