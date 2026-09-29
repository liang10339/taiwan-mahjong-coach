function setupLessons($, mode) {
  let step = 0,
    wind = null,
    dice = null,
    wallOK = false,
    cutOK = false,
    choiceOK = false,
    dealRound = 0;
  const winds = ['東', '南', '西', '北'];
  let hidden = winds.slice().sort(() => Math.random() - 0.5);
  const sections = [
    [
      '認牌與胡牌',
      '萬、筒、索各一到九；每種四張。東南西北、中發白不能組順子。一般胡牌是五組加一對，槓算一組。',
    ],
    [
      '抓位：抽風牌、依風位入座',
      '抓位是決定誰坐哪裡。本課程先指定東風座位，東、南、西、北依逆時針排列，再將四張風牌蓋著洗，各抽一張入座。正式牌桌也可能先擲骰定東位或另行撒莊；本課程簡化為東位起莊。',
    ],
    [
      '擲骰：找出哪一家的牌牆',
      '莊家擲三顆骰子，加總點數。從莊家算 1，下家算 2、對家算 3、上家算 4，逆時針繼續數，數到的那家就是取牌的起始牌牆。',
    ],
    [
      '數墩：從哪裡開始取牌？',
      '每家牌牆有十八墩，每墩上下兩張。站在被選中的牌牆主人視角，從右邊數過骰子總點數的墩數，從下一墩開始取牌。十八點則繞到接續牌牆第一墩。',
    ],
    [
      '配牌與開門',
      '玩家逆時針輪流，每次取兩墩（四張），共四輪，每人十六張；牌牆取牌方向沿順時針。莊家再多取一張門牌，先出牌。各地「開門」也可能指切牌牆的動作，先確認桌規。',
    ],
    [
      '補花與槓後補牌',
      '拿到花牌要攤開，從牌尾補一張；補到花再補，直到補到一般牌。花不算在十六張手牌內。槓牌也是先補牌，再出牌。',
    ],
    [
      '吃、碰、槓：有人出牌時先決定',
      '只有上家打出的數字牌可以吃成順子。任何一家打出的牌可用手上兩張相同牌碰、三張相同牌明槓；自己四張可暗槓，已碰的牌再摸到第四張可加槓。胡優先於碰／槓，碰／槓優先於吃。',
    ],
    [
      '一進聽：跟著場上的牌作選擇',
      '一進聽表示再進一張合適的牌，出牌後就有機會聽牌；兩進聽還要再改善兩步。教練會依手牌、牌河與攤牌更新，而不是保證下一摸就能聽牌。',
    ],
    [
      '147、258、369：五連張的三面聽',
      '口訣說的是可以等哪些牌，不是固定留下147、258、369。以下五張都必須同花色；整手其餘部分已完成三組加一對（含攤牌），這五張再進一張組成兩組，才是完整的五組加一對。',
    ],
    [
      '把口訣用回牌桌',
      '同樣三面聽，已經出現的牌越多，能胡的張數就越少。形狀漂亮不代表一定快胡，也不能把147、258、369當成必定安全的牌。',
    ],
  ];
  const demo = $('#lessonDemo'),
    feedback = $('#lessonFeedback');
  function say(s) {
    feedback.textContent = s;
  }
  function button(text, fn) {
    const b = document.createElement('button');
    b.className = 'secondary-button';
    b.textContent = text;
    b.onclick = fn;
    demo.append(b);
    return b;
  }
  function line(text) {
    const p = document.createElement('p');
    p.textContent = text;
    demo.append(p);
  }
  function passed() {
    return step === 1
      ? wind !== null
      : step === 2
        ? wallOK
        : step === 3
          ? cutOK
          : step === 4
            ? dealRound === 5
            : step === 6
              ? choiceOK
              : true;
  }
  function controls() {
    $('#lessonNext').disabled = !passed();
    $('#lessonNext').textContent = step === sections.length - 1 ? '進入實戰' : '下一步';
  }
  function render() {
    $('#lessonTitle').textContent = sections[step][0];
    $('#lessonDescription').textContent = sections[step][1];
    $('#lessonStepNumber').textContent = step + 1;
    $('#lessonTotal').textContent = sections.length;
    $('#lessonBack').disabled = step === 0;
    $('#lessonProgressBar').style.width = ((step + 1) / sections.length) * 100 + '%';
    demo.replaceChildren();
    say('');
    if (step === 0) {
      line('順子：2萬 3萬 4萬　｜　刻子：中 中 中　｜　對子：東 東');
      if (typeof Tiles !== 'undefined')
        [
          ['萬子', [0, 1, 2, 3, 4, 5, 6, 7, 8]],
          ['筒子', [9, 10, 11, 12, 13, 14, 15, 16, 17]],
          ['索子（條子，一索畫的是鳥）', [18, 19, 20, 21, 22, 23, 24, 25, 26]],
          ['字牌：東南西北、中發白', [27, 28, 29, 30, 31, 32, 33]],
          ['花牌：春夏秋冬、梅蘭竹菊', [34, 35, 36, 37, 38, 39, 40, 41]],
        ].forEach(([name, tiles]) => {
          const row = document.createElement('div');
          row.className = 'lesson-tiles';
          const cap = document.createElement('small');
          cap.textContent = name;
          row.append(cap);
          tiles.forEach((t) => row.append(Tiles.node(t, 'md')));
          demo.append(row);
        });
    }
    if (step === 1) {
      if (wind === null) {
        line('請抽一張蓋著的風牌。');
        hidden.forEach((w, i) =>
          button('第 ' + (i + 1) + ' 張蓋牌', () => {
            wind = w;
            render();
          }),
        );
      } else {
        line('你抽到「' + wind + '」：請坐' + wind + '風位。示範座位由東起，逆時針為東 → 南 → 西 → 北。');
        button('重新抓位', () => {
          wind = null;
          hidden = winds.slice().sort(() => Math.random() - 0.5);
          render();
        });
      }
    }
    if (step === 2) {
      button(dice ? '重新擲骰' : '擲三顆骰子', () => {
        dice = Array.from({ length: 3 }, () => 1 + Math.floor(Math.random() * 6));
        wallOK = false;
        cutOK = false;
        render();
      });
      if (dice) {
        const sum = dice.reduce((a, b) => a + b, 0);
        line('骰子：' + dice.join(' + ') + ' = ' + sum + '。從莊家開始數，選哪一家的牌牆？');
        winds.forEach((w, i) =>
          button(w + '家牌牆', () => {
            wallOK = i === (sum - 1) % 4;
            say(
              wallOK
                ? '答對！' + sum + ' 點落在' + w + '家。'
                : '再試一次：莊家東家是 1，南家 2，西家 3，北家 4，再回東家 5。',
            );
            controls();
          }),
        );
      }
    }
    if (step === 3) {
      if (!dice) dice = [2, 3, 4];
      const sum = dice.reduce((a, b) => a + b, 0);
      line(
        '本次 ' +
          sum +
          ' 點：選中' +
          winds[(sum - 1) % 4] +
          '家牌牆。下方以牌牆主人視角呈現，右端是第一墩。請點「第一個要拿的墩」。',
      );
      const wall = document.createElement('div');
      wall.className = 'lesson-wall';
      demo.append(wall);
      for (let i = 18; i >= 1; i--) {
        const b = document.createElement('button');
        b.textContent = i + '墩';
        b.className = 'wall-stack';
        b.onclick = () => check(i);
        wall.append(b);
      }
      button('接續牌牆第 1 墩（數過18墩後）', () => check(19));
      function check(n) {
        cutOK = n === sum + 1;
        say(
          cutOK
            ? '答對！留下前 ' + sum + ' 墩，從下一墩開始拿。下一步練習配牌。'
            : '要數過 ' + sum + ' 墩，不能從第 ' + sum + ' 墩本身開始拿。',
        );
        controls();
      }
    }
    if (step === 4) {
      line(
        '目前每家 ' +
          Math.min(dealRound, 4) * 4 +
          ' 張' +
          (dealRound === 5 ? '；莊家已多拿一張，共17張。' : '。'),
      );
      button(dealRound < 4 ? '四家依序各拿四張' : dealRound === 4 ? '莊家拿門牌' : '重新練習', () => {
        dealRound = dealRound === 5 ? 0 : dealRound + 1;
        render();
      });
    }
    if (step === 5)
      line('例：摸到「春」 → 攤開春 → 從牌尾補牌 → 又補到「梅」 → 攤開梅 → 再補到「5筒」，把5筒放進手牌。');
    if (step === 6) {
      line('小練習：你手上有 3萬、4萬，對家打出 2萬，可以吃嗎？');
      button('可以吃', () => {
        say('不行，只有上家的牌能吃。對家的牌只能在符合條件時碰、槓或胡。');
      });
      button('不能吃，只有上家可以', () => {
        choiceOK = true;
        say('答對！若是上家打2萬，就可以用3萬、4萬吃成順子。吃完直接出牌，不再摸牌。');
        controls();
      });
    }
    if (step === 7)
      line(
        '實戰中：摸牌後看出牌比較；有人打出能吃碰的牌時，先看吃碰前後幾進聽，再選吃碰或略過。暗槓與加槓按鈕只在符合條件時出現。',
      );
    if (step === 8) {
      for (const p of Coach.patterns)
        button(p.shape.join('') + ' → 等 ' + p.waits.join('、'), () => {
          say(
            '同花色 ' +
              p.shape.join('') +
              '：' +
              p.waits.map((n, i) => '進' + n + ' → ' + p.splits[i]).join('；') +
              '。這些是局部拆牌示範，整手仍須符合五組加一對。',
          );
        });
      line('例如留23456，是因為進1、4、7都能拆成兩組順子；單獨的147彼此不能直接組順子。');
    }
    if (step === 9) {
      line(
        '例：同花色23456等147。自己已有一張4，所以尚未扣牌河前最多11張（1有4張、4有3張、7有4張），不是12張。',
      );
      button('如果牌河已有三張1、一張4、兩張7？', () =>
        say('剩下尚未看見：1有1張、4有2張、7有2張，共5張。這些牌也可能在對手手上，不代表牌牆裡一定還有5張。'),
      );
      line(
        '想知道自己的牌：回到教練實戰，選牌後按「打我選的這張，可以嗎？」或輸入「打白板可以嗎」。目前為本機規則問答，尚非任意聊天。',
      );
    }
    controls();
  }
  $('#lessonBack').onclick = () => {
    step = Math.max(0, step - 1);
    render();
  };
  $('#lessonNext').onclick = () => {
    if (!passed()) return;
    if (step === sections.length - 1) mode('table');
    else {
      step++;
      render();
    }
  };
  render();
}
