'use strict';
// 設定與切換：分頁、牌河／音效開關、報牌聲音、⚙ 選項
function mode(name) {
  currentMode = name;
  for (const n of ['table', 'lesson', 'review']) $('#' + n + 'View').classList.toggle('hidden', n !== name);
  $$('.mode-tab').forEach((b) => b.classList.toggle('active', b.dataset.mode === name));
  if (name === 'review') {
    renderNotebook();
    renderGrowth();
    renderRecords();
    renderManual();
    renderReview();
  }
}
$$('.mode-tab').forEach((b) => (b.onclick = () => mode(b.dataset.mode)));
$('#riverToggle').onclick = () => {
  neatRiver = !neatRiver;
  try {
    localStorage.setItem('mahjong-coach-river', neatRiver ? 'neat' : 'pile');
  } catch (e) {}
  syncToggles();
  render();
};
$('#soundButton').onclick = () => {
  Sound.setEnabled(!Sound.isEnabled());
  syncToggles();
  if (Sound.isEnabled()) Sound.play('tick');
};
function syncToggles() {
  $('#riverToggle').textContent = neatRiver ? '牌河：分家' : '牌河：散落';
  $('#riverToggle').setAttribute('aria-pressed', String(neatRiver));
  $('#coachQuick').textContent = settings.coach ? '提示：開' : '提示：關';
  $('#coachQuick').setAttribute('aria-pressed', String(settings.coach));
  if (typeof Sound !== 'undefined') {
    const on = Sound.isEnabled();
    $('#soundButton').textContent = on ? '🔊' : '🔇';
    $('#soundButton').title = on ? '音效：開' : '音效：關';
    $('#soundButton').setAttribute('aria-pressed', String(on));
  }
}
function setupVoice() {
  if (typeof Sound === 'undefined' || !Sound.voices) return;
  const select = $('#voiceSelect'),
    style = $('#voiceStyle');
  for (const [key, p] of Object.entries(Sound.profiles)) {
    const o = el('option', null, p.label);
    o.value = key;
    style.append(o);
  }
  style.value = Sound.settings().profile;
  const refresh = () => {
    const list = Sound.voices(),
      saved = Sound.settings();
    select.replaceChildren();
    const auto = el('option', null, '自動選擇中文語音');
    auto.value = '';
    select.append(auto);
    for (const v of list) {
      const o = el('option', null, v.name + '（' + v.lang + '）');
      o.value = v.voiceURI;
      select.append(o);
    }
    select.value = list.some((v) => v.voiceURI === saved.voiceId) ? saved.voiceId : '';
    $('#voiceStatus').textContent = list.length
      ? '系統聲線依裝置提供；男女老少風格為音高／語速模擬，不是真人錄音。' +
        (saved.voiceId && !list.some((v) => v.voiceURI === saved.voiceId)
          ? '原聲線不可用，暫用自動選擇。'
          : '')
      : '目前沒有可用中文語音。請在系統安裝中文語音後重新開啟瀏覽器；碰牌音效仍可使用。';
  };
  select.onchange = style.onchange = () => {
    Sound.stop();
    Sound.setVoice(select.value, style.value);
  };
  $('#voicePreview').onclick = () => {
    Sound.stop();
    if (!Sound.say('八萬，三筒，六條，白板'))
      $('#voiceStatus').textContent = Sound.isEnabled()
        ? '無法播放：尚無可用中文語音或瀏覽器不支援。'
        : '目前已靜音，請先開啟右上角音效。';
  };
  globalThis.speechSynthesis?.addEventListener('voiceschanged', refresh);
  refresh();
}
function setupSettings() {
  const level = $('#levelSelect'),
    coachBox = $('#coachToggle'),
    dangerBox = $('#dangerToggle'),
    seatBox = $('#seatDrawToggle'),
    stake = $('#stakeSelect');
  const opening = $('#openingSelect');
  opening.value = settings.opening;
  opening.onchange = () => {
    settings.opening = opening.value;
    saveSettings();
    notify(settings.opening === 'full' ? '下一局起完整開局：擲骰、開門、配牌、補花' : '下一局起直接開始');
  };
  level.value = settings.level;
  coachBox.checked = settings.coach;
  dangerBox.checked = settings.danger;
  seatBox.checked = settings.seatDraw;
  stake.value = settings.stake;
  level.onchange = () => {
    settings.level = level.value;
    saveSettings();
    notify('電腦難度：' + AI.LEVELS[settings.level]);
  };
  const style = $('#styleSelect');
  if (style) {
    style.value = settings.style;
    style.onchange = () => {
      settings.style = style.value;
      saveSettings();
      notify(
        '高級電腦風格：' +
          (settings.style === 'mixed'
            ? '混合（下家速攻、對家大牌、上家保守）'
            : AI.STYLES[settings.style].name) +
          '，下一局起生效',
      );
    };
  }
  coachBox.onchange = () => {
    settings.coach = coachBox.checked;
    saveSettings();
    syncToggles();
    render();
  };
  dangerBox.onchange = () => {
    settings.danger = dangerBox.checked;
    saveSettings();
    render();
  };
  seatBox.onchange = () => {
    settings.seatDraw = seatBox.checked;
    saveSettings();
  };
  stake.onchange = () => {
    settings.stake = stake.value;
    saveSettings();
  };
  /** @type {[string, string, boolean][]} [勾選框, 設定名稱, 是否立即重畫（否則下一局生效）] */
  const toggles = [
    ['#passWaterToggle', 'passWater', false],
    ['#reserveToggle', 'reserve', false],
    ['#cutsToggle', 'showCuts', true],
    ['#valueToggle', 'value', true],
  ];
  for (const [id, key, live] of toggles) {
    const box = $(id);
    box.checked = !!settings[key];
    box.onchange = () => {
      settings[key] = box.checked;
      saveSettings();
      if (live) render();
      else notify('桌規從下一局起生效');
    };
  }
  $('#coachQuick').onclick = () => {
    settings.coach = !settings.coach;
    coachBox.checked = settings.coach;
    saveSettings();
    syncToggles();
    render();
  };
  $('#rotateDismiss').onclick = () => {
    $('#rotateHint').classList.add('hidden');
    try {
      localStorage.setItem('mahjong-coach-rotate', '1');
    } catch (e) {}
  };
  try {
    if (localStorage.getItem('mahjong-coach-rotate')) $('#rotateHint').classList.add('hidden');
  } catch (e) {}
}
