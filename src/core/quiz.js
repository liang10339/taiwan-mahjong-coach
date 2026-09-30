(function (root) {
  'use strict';
  // 教學關卡 1–4：講解卡片、何切／聽牌／算台／防守／攻守練習題，以及學習進度紀錄。
  const node = typeof module !== 'undefined';
  const E = node ? require('./engine') : root.Mahjong,
    C = node ? require('./coach') : root.Coach,
    S = node ? require('./scoring') : root.Scoring,
    A = node ? require('./ai') : root.AI,
    Safety = node ? require('./safety') : root.Safety;
  const label = (t) => (t === 33 ? '白板' : E.names[t]);
  const cn = (n) => ['零', '一', '兩', '三', '四', '五', '六', '七', '八', '九', '十'][n] || String(n);
  const progressWord = (n) => (n < 0 ? '胡牌' : n === 0 ? '聽牌' : cn(n) + '進聽');

  function rng(seed) {
    let n = seed >>> 0;
    return () => {
      n = (Math.imul(n, 1664525) + 1013904223) >>> 0;
      return n / 4294967296;
    };
  }
  function fullSet() {
    const w = [];
    for (let t = 0; t < 34; t++) for (let i = 0; i < 4; i++) w.push(t);
    return w;
  }
  function takeFrom(pool, tiles) {
    for (const t of tiles) {
      const i = pool.indexOf(t);
      if (i < 0) throw Error('tile unavailable ' + t);
      pool.splice(i, 1);
    }
    return tiles;
  }

  /**
   * 新手學堂的階段。lessons 每一項是 [標題, 說明, 範例牌型（每列一組牌）]。
   * @typedef {[string, string, number[][]?]} StageLesson
   * @typedef {{id: number, name: string, who: string, goal: string, lessons?: StageLesson[]}} Stage
   * @type {Stage[]}
   */
  const STAGES = [
    { id: 0, name: '入門', who: '完全不會', goal: '認牌、順刻對、胡牌結構，開局流程互動演示' },
    {
      id: 1,
      name: '基礎',
      who: '會一點',
      goal: '吃碰槓時機、各種聽牌型、怎麼算台',
      lessons: [
        [
          '吃碰槓的時機',
          '吃、碰會讓牌更快成組，但攤出去就不能再拆，也會失去「門清」台與防守彈性。原則：能讓進聽數減少才考慮吃碰；只是「能吃」不代表「該吃」。明槓、暗槓都要從牌尾補牌，補到什麼不確定。',
        ],
        [
          '聽牌型：兩面、嵌張、邊張',
          '兩面：23 等 1、4，兩種牌都能胡，最好。嵌張：24 等 3，只有一種。邊張：12 等 3、89 等 7，也只有一種。同樣是聽牌，能等的牌越多越好。',
          [
            [1, 2],
            [1, 3],
            [0, 1],
          ],
        ],
        [
          '聽牌型：單吊、對碰',
          '單吊：五組都完成，只剩一張單牌，等同一張成對（常用來換成好等的字牌）。對碰：兩個對子，任一張進來成刻子，另一對當眼。',
          [[30], [31, 31, 32, 32]],
        ],
        [
          '複合型：三面聽、一一一二',
          '23456 等 1、4、7（三面聽）；1112 等 2、3；3334 等 2、4、5。多張相連時，拆法不只一種，可以等更多牌。',
          [
            [1, 2, 3, 4, 5],
            [0, 0, 0, 1],
          ],
        ],
        [
          '過水與保留八墩',
          '過水：有機會胡卻放過（例如想等自摸或更大的牌），在自己打出一張牌之前，不能再胡別人打的牌；自己摸牌自摸不受影響。保留八墩：牌牆剩下 8 墩（16 張）就不再摸，這局流局，莊家連莊。所以「海底」是保留牌前的最後一張，不是整副牌的最後一張。這兩條是本程式預設桌規，可在 ⚙ 關閉。',
        ],
        [
          '怎麼算台（北部台算法）',
          '胡牌後依牌型與情況加總台數，付款＝底＋台數×每台。莊家 1（莊家胡或莊家放槍；閒家自摸時莊家那份另加），連莊連 n 拉 n 再加 2n。門清 1、自摸 1、門清自摸 3、獨聽 1、平胡 2、全求人 1；正花每張 1、花槓 1；圈風／門風刻子各 1、中發白刻子各 1；碰碰胡 4、混一色 4、清一色 8、字一色 16；三暗刻 2、四暗刻 5、五暗刻 8；海底撈月、河底撈魚、槓上開花、搶槓各 1。牌桌下方「查看台數表」有完整列表，各地桌規可能不同。',
        ],
      ],
    },
    {
      id: 2,
      name: '牌效率',
      who: '能打但常輸',
      goal: '向聽數、進張數、孤張先打哪張、組牌方向',
      lessons: [
        [
          '向聽數（進聽數）',
          '離聽牌還差幾步。一進聽：再進一張合適的牌、打出一張後就聽牌。每一手出牌，先選「打完後進聽數最小」的牌。',
        ],
        [
          '進張數（有效牌）',
          '讓進聽數減少的牌叫有效牌，數量＝這些牌還沒看見的張數加總（扣掉自己手牌、牌河、攤牌）。進聽數相同時，選有效牌多的打法。',
        ],
        [
          '孤張先打哪張',
          '孤立的字牌（場上已見兩張以上更沒用）通常最先打；其次是 1、9 這種只能靠一邊組順子的牌；3–7 的中張能向兩邊延伸，最晚打。但要算實際有效牌，不是死背。',
        ],
        [
          '出牌順序口訣',
          '常見口訣：先丟孤張再丟風牌；孤張字牌裡，先打「客風」（不是自己的門風、也不是圈風，碰了沒台），中發白與門風、圈風碰出來有台，場上還沒出現時可以晚點打。之後是孤張么九（1、9 只能單邊組順子），最後才是 3–7 中張。效率相同時，本程式的教練也照這個順序推薦。',
        ],
        [
          '五搭原理',
          '胡牌要五組加一對。把手牌看成「幾個搭子」：面子、兩面、嵌張、邊張、對子各算一搭。已經有五搭加一對時，多出來的搭子就是要拆的；五搭不夠時，孤張要留能接成搭子的中張。147 打小、258 打中、369 打大：四連張（如 3456）拆一張時，留下能多等一種的形狀。',
        ],
        [
          '組牌方向',
          '手上搭子太多時，要把差的搭子（邊張、嵌張、已被打光的）先拆掉；兩面搭子要留。對子留一到兩組當眼與碰牌。花色偏多時可以考慮做混一色、清一色換台數，但速度會變慢。',
        ],
      ],
    },
    {
      id: 3,
      name: '看牌面',
      who: '中階',
      goal: '讀海底、找安全牌、判斷別人快聽牌的訊號、跟打與棄胡',
      lessons: [
        [
          '讀海底',
          '看每家打過什麼：一直打某花色，通常不做那門；很早打出中張，可能手牌已經成形。牌河是公開資訊，也是推理對手的唯一依據。',
        ],
        [
          '安全牌怎麼找',
          '可見張數越多越安全：四張全見的字牌完全不會被胡；三張已見的字牌只剩單吊一種可能。數牌要看「壁」：例如 4萬 四張都見到，別人就不能用 34 等 2/5 或 45 等 3/6 ……但仍可能用其他組合胡。',
        ],
        [
          '聽牌的訊號',
          '攤出三組以上、牌牆剩不多、突然開始連打中張（3–7）、摸牌後很快打出、吃碰後打出危險張，都是可能聽牌的訊號。',
        ],
        [
          '摸切、手切、空切',
          '摸切：摸進來的牌直接打出，代表手牌沒有變；手切：留下摸進來的牌、從手中打出另一張，代表手牌在前進。一家連續摸切好幾巡，常是已經聽牌、在等胡。空切：摸到和手上相同的牌時，改打手中那張，別人看起來像手切，可以隱藏自己已經聽牌。在牌桌上看動作：剛摸的牌會放在牌架最右邊、稍微隔開；直接把那張丟出去是摸切，從牌列中間抽一張出來、再把剛摸的牌插進去是手切（空切看起來也一樣）。',
        ],
        [
          '熟張、生張與盯下家',
          '熟張：場上已經出現過的牌，別人拿去用的機會較小；生張：還沒出現過的牌，後期打生張最容易放槍。口訣「一直沒人胡就打熟牌」。盯下家：你打的牌只有下家能吃，孤張效率相同時，先打下家打過或用不到的牌，不要餵下家吃。',
        ],
        [
          '清一色、混一色的訊號',
          '一家攤出兩組以上都是同一花色（可加字牌），而且一直打其他花色，多半在做清一色或混一色：那門數牌和字牌都要小心，本程式的危險度也會加重。',
        ],
        [
          '放過的牌：模型推估，不是安全保證',
          '本程式沒有「打過的牌不能胡」的規定，對手以前打過或沒胡的牌都不能直接當成安全牌。電腦設定為有胡必胡，所以教練會利用可觀察的手牌未改變期間放過的牌，做模型限定的安全推估。真人可能故意不胡、等自摸或受過水限制，不能照搬這個推估；看起來是手切時，也不能偷看暗牌判斷是不是空切。',
        ],
        [
          '過水：知道規則不等於知道暗牌',
          '依本程式桌規，有機會胡卻略過時，在自己打出下一張牌之前不能胡別人打的牌，自摸不受影響。但你看不到別人的暗牌，單憑「沒有喊胡」無法確認他真的能胡或正在過水。教練不讀取對手私密的過水旗標，也不會因此保證這一巡打什麼都安全。',
        ],
        [
          '手切的牌附近與不做的那門',
          '教學書常說：對手聽牌前的最後幾張手切，是他整理手牌時丟掉的牌，他留下的搭子常在附近（例如後期手切 7萬，5萬～9萬 要小心）。這條對會刻意留搭子的真人較有用；本程式的電腦只看牌效率，自戰統計看不出差別，所以教練的放槍機率不加權。確定有用的是反過來那條：他一直在打的那門，放槍機率約只有一般的一半多。',
        ],
        [
          '放槍機率怎麼估',
          '放槍機率 ≈ 對手聽牌的機率 × 這張正好是他要的牌的機率。聽牌機率看攤牌數、打了幾張、連續摸切；是不是他要的牌看牌的種類：生張字牌、3～7 中張較危險，見過 3 張的字牌、被「壁」擋住的數牌較安全。本程式的數字來自電腦自戰幾千局的統計（docs/CALIBRATION.md），不是憑感覺。',
        ],
        [
          '跟打與棄胡',
          '「跟打」（打別家剛打過的牌）不是安全保證。自己離聽牌還遠、對手很可能聽牌時，優先打目前風險較低的牌、放棄這局，叫做棄胡。比較公開張數、對手訊號與自己的效率代價；對子、刻子也可以拆開防守。教練對電腦放過牌的推估有模型前提，不能當成真人牌桌上的必然結論。',
        ],
      ],
    },
    {
      id: 4,
      name: '攻守判斷',
      who: '進階',
      goal: '衝胡還是守、速度與台數、依分數局勢調整',
      lessons: [
        [
          '衝還是守',
          '自己已聽牌或一進聽、有效牌多：通常繼續攻。自己還三進聽以上、對手明顯聽牌：通常守。中間地帶看危險牌是否必須打出。',
        ],
        [
          '用期望值決定攻守',
          '每張牌都可以算：期望值 ＝ 之後胡牌的機率 × 胡牌收入 − 放槍機率 × 對方胡牌的台數（含底）。自摸三家都付，所以胡牌收入大約是一次放槍的兩倍左右。教練在「放槍風險與攻守比較」列出每張牌的數字：效率首選的期望值還是最高就照打；安全牌明顯划算時才改打，這時標題會寫「建議先守」或「攻守兼顧」。',
        ],
        [
          '吃碰前先踩煞車',
          '吃碰能讓牌更快，但攤出去的牌不能再拿來防守，也少了門清。有人很可能聽牌、而吃碰後你仍差兩步以上時，教練不建議吃碰：就算吃了也聽不了，反而少了能打的安全牌。',
        ],
        [
          '速度還是大台',
          '早巡、牌很整齊時，可以往清一色、碰碰胡去做；中後巡或對手已攤牌時，先求胡再說。做大台會讓進聽數變慢，要有值得的回報。',
        ],
        [
          '依分數局勢調整',
          '大幅領先時多守，少放槍就能保住；落後很多時要冒險做台數；自己是莊家可以連莊時，胡小牌也值得。',
        ],
      ],
    },
  ];

  // ---- 題庫 ----
  const FILLER = [9, 10, 11, 12, 13, 14, 18, 19, 20, 24, 25, 26];
  const WAIT_SHAPES = [
    { shape: [1, 2], name: '兩面', pair: [33, 33] },
    { shape: [1, 3], name: '嵌張', pair: [33, 33] },
    { shape: [0, 1], name: '邊張', pair: [33, 33] },
    { shape: [7, 8], name: '邊張', pair: [33, 33] },
    { shape: [3, 4, 5, 30], name: '單吊', pair: [] },
    { shape: [31, 31, 32, 32], name: '對碰', pair: [] },
    { shape: [1, 2, 3, 4, 5], name: '三面聽', pair: [] },
    { shape: [0, 0, 0, 1], name: '一一一二', pair: [] },
    { shape: [2, 2, 2, 3], name: '三三三四', pair: [] },
    { shape: [3, 4, 5, 6], name: '四連張', pair: [] },
  ];
  function waitQuestion(i) {
    const w = WAIT_SHAPES[i % WAIT_SHAPES.length];
    // 五張型：三組＋一對＋五張；其他：四組＋（兩張搭子＋一對，或四張型）
    const filler = w.shape.length === 5 ? [...FILLER.slice(0, 9), 27, 27] : FILLER,
      hand = [...filler, ...w.shape, ...w.pair];
    const waits = S.winningTiles(hand, 0);
    const choices = [
      ...new Set(
        [...w.shape.filter((t) => t < 27), ...waits].flatMap((t) =>
          t < 27
            ? [t - 2, t - 1, t, t + 1, t + 2].filter((x) => Math.floor(x / 9) === Math.floor(t / 9) && x >= 0)
            : [t],
        ),
      ),
    ].sort((a, b) => a - b);
    return {
      id: 'wait-' + i,
      type: 'multi',
      prompt: '這手牌（16 張）聽哪些牌？選出所有能胡的牌。',
      hand,
      choices,
      answer: waits,
      explain:
        '聽 ' +
        waits.map(label).join('、') +
        '。' +
        w.name +
        '：' +
        (waits.length === 1 ? '只有一種牌能胡。' : '共 ' + waits.length + ' 種牌能胡，越多種越好。'),
    };
  }
  function scoringFixtures() {
    const mk = (hand, winTile, opts = {}) => {
      const g = E.create(1, { dealer: opts.dealer || 0, roundWind: opts.round || 0 });
      g.hands = [hand, [], [], []];
      g.melds = [opts.melds || [], [], [], []];
      g.flowers = [opts.flowers || [], [], [], []];
      // 牌局中段胡牌：先放幾筆出牌紀錄，避免被當成天胡、地胡、人胡
      const from = opts.from ?? 3;
      g.log = [
        { player: 0, action: 'discard', tile: 33 },
        { player: from, action: 'discard', tile: 29 },
        ...(opts.selfDraw
          ? [{ player: 0, action: 'tsumo', tile: winTile }]
          : [{ player: 0, action: 'ron', tile: winTile, from }]),
      ];
      return g;
    };
    return [
      {
        text: '你是南家（不是莊家），東風圈，門清，自摸 5條，沒有花。',
        g: mk([0, 1, 2, 3, 4, 5, 15, 16, 17, 19, 20, 21, 22, 23, 13, 13, 24], 22, {
          dealer: 3,
          selfDraw: true,
        }),
      },
      {
        text: '你是南家（不是莊家），門清，胡西家打出的 4條（兩面聽），沒有花。',
        g: mk([0, 1, 2, 3, 4, 5, 15, 16, 17, 19, 20, 21, 22, 23, 24, 13, 13], 21, { dealer: 3, from: 1 }),
      },
      {
        text: '你是西家，攤了三碰，手上中中中、東東、1萬1萬，胡別人打的 1萬（對碰），有一張花「秋」。',
        g: mk([31, 31, 31, 27, 27, 0, 0, 0], 0, {
          dealer: 2,
          flowers: [36],
          melds: [
            { type: 'pon', tiles: [5, 5, 5], from: 1 },
            { type: 'pon', tiles: [14, 14, 14], from: 3 },
            { type: 'pon', tiles: [22, 22, 22], from: 3 },
          ],
        }),
      },
      {
        text: '你是東家（莊家），東風圈，全部萬子加字牌，胡別人打的 7萬（89 等 7 的邊張）。',
        g: mk([0, 1, 2, 3, 4, 5, 7, 8, 6, 31, 31, 31, 27, 27, 27, 32, 32], 6, {}),
      },
      {
        text: '你是北家（不是莊家），全部是筒子，門清，胡南家打的 5筒，沒有花。',
        g: mk([9, 9, 9, 10, 11, 12, 13, 14, 15, 16, 17, 17, 17, 11, 12, 13, 15], 13, { dealer: 1, from: 2 }),
      },
    ]
      .map((f) => {
        f.g.hands[0] = f.g.hands[0].slice();
        const s = S.score(f.g, 0);
        return { ...f, score: s };
      })
      .filter((f) => f.score && E.winning(f.g.hands[0], f.g.melds[0].length));
  }
  function scoringQuestion(i) {
    const list = scoringFixtures(),
      f = list[i % list.length],
      n = f.score.total;
    const opts = [...new Set([n, n + 1, Math.max(1, n - 1), n + 2, n + 3])].slice(0, 4).sort((a, b) => a - b);
    return {
      id: 'tai-' + i,
      type: 'choice',
      prompt: f.text + ' 這手共幾台（含莊家台）？',
      hand: f.g.hands[0],
      melds: f.g.melds[0],
      flowers: f.g.flowers[0],
      options: opts.map((x) => x + ' 台'),
      answer: opts.indexOf(n),
      explain: f.score.items.map((x) => x.name + ' ' + x.tai + ' 台').join('、') + '，共 ' + n + ' 台。',
    };
  }
  // 何切（牌效率）：從隨機牌局取一手 17 張，答案是有效牌最多的一組並列最佳
  function discardQuestion(seed) {
    for (let k = 0; k < 400; k++) {
      const g = E.create(seed * 7919 + k);
      E.draw(g, 0);
      const hand = g.hands[0].slice().sort((a, b) => a - b);
      const options = E.analyze(hand, [], 0),
        best = options[0];
      if (best.shanten < 1 || best.shanten > 3) continue;
      const tied = options.filter((o) => o.shanten === best.shanten && o.remaining === best.remaining);
      const runner = options.find((o) => !tied.includes(o));
      if (!runner || tied.length > 2) continue;
      if (runner.shanten === best.shanten && best.remaining - runner.remaining < 4) continue;
      return {
        id: 'eff-' + seed,
        type: 'discard',
        prompt: '何切？打哪一張最好？（只看牌效率，場上沒有其他資訊）',
        hand,
        options,
        answerTiles: tied.map((o) => o.tile),
        judge: (t) => judgeDiscard(hand, options, t, []),
      };
    }
    return null;
  }
  function judgeDiscard(hand, options, t, pub) {
    const ex = C.explainTurn(hand, options, { publicTiles: pub }),
      pick = options.find((o) => o.tile === t),
      best = ex.best;
    const ok = pick.shanten === best.shanten && pick.remaining === best.remaining;
    const text = ok
      ? '正確！打' + label(t) + '後' + progressWord(pick.shanten) + '，有效牌 ' + pick.remaining + ' 張。'
      : '教練首選打' +
        label(best.tile) +
        '：' +
        progressWord(best.shanten) +
        '、有效牌 ' +
        best.remaining +
        ' 張；你打' +
        label(t) +
        '是' +
        progressWord(pick.shanten) +
        '、' +
        pick.remaining +
        ' 張' +
        (pick.shanten > best.shanten
          ? '，還退了一步。'
          : '，少了 ' + (best.remaining - pick.remaining) + ' 張進張。');
    return { correct: ok, text, lines: ex.lines };
  }
  // 防守何切：對手攤三組（很可能聽牌），自己還很遠，選最安全的牌
  function defenseQuestion(seed) {
    for (let k = 0; k < 200; k++) {
      const r = rng(seed * 104729 + k),
        pool = fullSet();
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(r() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      const g = E.create(1);
      g.flowers = [[], [], [], []];
      g.melds = [[], [], [], []];
      g.rivers = [[], [], [], []];
      // 對家攤三組碰
      const pons = [];
      for (let t = 0; t < 34 && pons.length < 3; t++) {
        const c = pool.filter((x) => x === t).length;
        if (c >= 3 && r() < 0.12) pons.push(t);
      }
      if (pons.length < 3) continue;
      g.melds[2] = pons.map((t) => ({
        type: 'pon',
        tiles: takeFrom(pool, [t, t, t]),
        from: k % 3 === 0 ? 1 : 3,
      }));
      for (let p = 0; p < 4; p++) g.rivers[p] = pool.splice(0, 8 + Math.floor(r() * 4));
      g.hands = [
        pool.splice(0, 17).sort((a, b) => a - b),
        pool.splice(0, 16),
        pool.splice(0, 7),
        pool.splice(0, 16),
      ];
      g.wall = pool;
      g.turn = 0;
      g.phase = 'discard';
      if (E.shanten(g.hands[0], 0) < 2) continue;
      // 用教練同一套放槍機率（safety.js）出題：最安全的牌（容許 0.3% 以內的並列）是答案
      const rated = Safety.evaluate(g, 0);
      const min = rated[0].dealIn,
        safe = rated.filter((x) => x.dealIn <= min + 0.003).map((x) => x.tile);
      const eff = E.analyze(g.hands[0], E.publicTiles(g, 0), 0)[0].tile;
      if (safe.includes(eff) || safe.length > 3 || rated[rated.length - 1].dealIn - min < 0.03) continue;
      return {
        id: 'def-' + seed,
        type: 'discard',
        prompt: '對家已碰出三組，很可能聽牌；你還離聽牌很遠。這一手打哪張最安全？',
        game: g,
        hand: g.hands[0],
        answerTiles: safe,
        judge: (t) => judgeDefense(g, t, safe, rated, eff),
      };
    }
    return null;
  }
  function judgeDefense(g, t, safe, rated, eff) {
    const ok = safe.includes(t),
      mine = rated.find((x) => x.tile === t),
      best = rated[0];
    const text =
      (ok ? '正確！' : '較安全的是 ' + safe.map(label).join('、') + '。') +
      '\n' +
      Safety.explain(best) +
      (ok || !mine ? '' : '\n你選的：' + Safety.explain(mine)) +
      '\n牌效率首選是' +
      label(eff) +
      '，但這時自己還遠、對手很近，先守比較划算。';
    return { correct: ok, text, lines: [] };
  }
  const JUDGEMENT = [
    {
      prompt:
        '你已聽牌（兩面，未見 6 張），對家攤三組看似聽牌。你摸到一張沒人打過的 5萬，打掉就維持聽牌，不打就要拆聽。怎麼做？',
      options: ['打 5萬，繼續聽牌', '拆聽，打安全牌'],
      answer: 0,
      explain: '自己已聽好牌時，胡牌的期望通常大於放槍的損失；除非對手台數明顯很大，否則繼續攻。',
    },
    {
      prompt:
        '東一局，你三進聽、手牌零散。下家剛碰第三組，牌牆剩 40 張。你手上有一張場上未見的中張 4筒，是牌效率首選。怎麼做？',
      options: ['照打 4筒，求快', '改打場上已見三張的字牌，準備棄胡'],
      answer: 1,
      explain: '三進聽離胡還很遠，對手很近。這時放槍的機會大於自己胡的機會，先守。',
    },
    {
      prompt: '早巡（牌牆剩 90 張），你手上有 11 張筒子，其餘散牌。要不要往清一色做？',
      options: ['往清一色做，先打其他花色', '維持牌效率，什麼都留'],
      answer: 0,
      explain: '早巡、同花色過半時，清一色 8 台的回報值得犧牲一點速度。中後巡才發現就不一定來得及。',
    },
    {
      prompt: '你大幅領先，最後一圈，你一進聽，對手看似聽牌。',
      options: ['保守，打安全牌', '繼續衝胡'],
      answer: 0,
      explain: '領先時不放槍就能守住名次，勝一局的邊際價值小，放槍的代價大。',
    },
    {
      prompt: '你大幅落後，最後一圈，手上有機會做混一色碰碰胡但慢三步；或直接做平胡較快。',
      options: ['做大台', '做快的小胡'],
      answer: 0,
      explain: '落後很多時小胡追不回來，要接受風險換大台數。',
    },
    {
      prompt: '你是莊家連二，手上可以很快胡一手只有 2 台的小牌。',
      options: ['快胡，保住連莊', '拆牌做大'],
      answer: 0,
      explain: '莊家胡牌就能繼續連莊，每連一次再多 2 台；快胡的價值比表面台數高。',
    },
  ];
  const READING = [
    {
      prompt: '牌牆還有 50 張可摸。下家前面都是手切，最近四巡都是摸切（灰底）。這代表什麼？',
      options: ['下家很可能已經聽牌', '下家手牌很爛、放棄了', '看不出任何訊號'],
      answer: 0,
      explain:
        '連續摸切代表手牌沒有再改變，中後巡常見於已經聽牌、只等胡牌的人。也可能是牌不好不想換，但此時打生張要特別小心。',
    },
    {
      prompt:
        '對家碰了 3筒、吃了 567筒，牌河幾乎都是萬子和條子。你手上有孤張 8筒 和孤張 西（場上已見兩張）。要打哪張？',
      options: ['打西', '打8筒'],
      answer: 0,
      explain:
        '對家攤牌全是筒子、又一直打其他花色，多半在做筒子清一色或混一色，8筒很危險；西已見兩張，相對安全。',
    },
    {
      prompt: '你摸到 5萬，手上也有一張 5萬，兩張 5萬 都沒用。為了不讓別人看出你已聽牌，應該怎麼打？',
      options: ['打手中的 5萬（空切）', '直接打摸進的 5萬（摸切）'],
      answer: 0,
      explain: '空切：打手中相同的牌，別人看起來是手切，不知道你手牌沒變。摸切會露出「手牌沒變」的訊號。',
    },
    {
      prompt: '效率完全相同的兩張孤張：東風（你是南家，東風圈）和北風（場上沒出現過）。先打哪張？',
      options: ['先打北（客風）', '先打東（圈風）'],
      answer: 0,
      explain: '東是圈風，碰出來有 1 台；北對你是客風，碰了沒台。效率相同時先打客風，留下有台的字牌。',
    },
    {
      prompt: '你手上孤張 3萬 和 7條，效率相同。下家剛打過 3萬，還沒人打過 7條。先打哪張？',
      options: ['先打 3萬（盯下家）', '先打 7條'],
      answer: 0,
      explain: '下家打過 3萬，代表他用不到的機會較大；打 7條 可能正好讓下家吃。這就是盯下家。',
    },
    {
      prompt:
        '牌牆只剩 20 張可摸，你還兩進聽，有人連續摸切三巡。你手上有生張 6萬（牌效率首選）與熟張 白（場上已見三張）。',
      options: ['打白，改守', '打6萬，繼續拚'],
      answer: 0,
      explain: '後期兩進聽胡牌機會很小，又有人可能聽牌，這時該打熟張守住，口訣「無法胡牌則打熟張」。',
    },
  ];
  function readingQuestion(i) {
    const q = READING[i % READING.length];
    return { id: 'read-' + i, type: 'choice', ...q };
  }
  function judgementQuestion(i) {
    const q = JUDGEMENT[i % JUDGEMENT.length];
    return { id: 'jdg-' + i, type: 'choice', ...q };
  }

  // 依關卡產生第 n 題
  function question(stage, n) {
    if (stage === 1) return n % 2 ? scoringQuestion(n >> 1) : waitQuestion(n >> 1);
    if (stage === 2) return discardQuestion(n + 1);
    if (stage === 3) return n % 3 === 2 ? readingQuestion(n) : defenseQuestion(n + 1);
    if (stage === 4) return n % 2 ? defenseQuestion(n + 50) : judgementQuestion(n >> 1);
    return null;
  }
  function check(q, answer) {
    if (q.type === 'choice') {
      const ok = answer === q.answer;
      return { correct: ok, text: (ok ? '正確！' : '答案是「' + q.options[q.answer] + '」。') + q.explain };
    }
    if (q.type === 'multi') {
      const a = [...answer].sort((x, y) => x - y),
        ok = a.length === q.answer.length && a.every((t, i) => t === q.answer[i]);
      return { correct: ok, text: (ok ? '正確！' : '') + q.explain };
    }
    return q.judge(answer);
  }

  // ---- 學習進度（存在本機瀏覽器） ----
  const KEY = 'mahjong-coach-progress';
  function blank() {
    return {
      stages: {},
      games: { played: 0, won: 0, tsumo: 0, dealIn: 0, draws: 0, best: 0, mistakes: 0, points: 0 },
      updated: 0,
    };
  }
  function load(store) {
    try {
      const raw = (store || root.localStorage)?.getItem(KEY);
      return raw ? { ...blank(), ...JSON.parse(raw) } : blank();
    } catch (e) {
      return blank();
    }
  }
  function save(p, store) {
    p.updated = Date.now();
    try {
      (store || root.localStorage)?.setItem(KEY, JSON.stringify(p));
    } catch (e) {}
    return p;
  }
  function recordAnswer(p, stage, correct) {
    const s = p.stages[stage] || (p.stages[stage] = { answered: 0, correct: 0, done: false });
    s.answered++;
    if (correct) s.correct++;
    if (s.correct >= 5) s.done = true;
    return p;
  }
  function recordGame(
    p,
    { won = false, tsumo = false, dealIn = false, draw = false, mistakes = 0, delta = 0 },
  ) {
    const g = p.games;
    g.played++;
    if (won) g.won++;
    if (tsumo) g.tsumo++;
    if (dealIn) g.dealIn++;
    if (draw) g.draws++;
    g.mistakes += mistakes;
    g.points += delta;
    return p;
  }

  const api = {
    STAGES,
    question,
    check,
    readingQuestion,
    READING,
    waitQuestion,
    scoringQuestion,
    discardQuestion,
    defenseQuestion,
    judgementQuestion,
    judgeDiscard,
    load,
    save,
    recordAnswer,
    recordGame,
    KEY,
    blank,
  };
  if (node) module.exports = api;
  else root.Quiz = api;
})(globalThis);
