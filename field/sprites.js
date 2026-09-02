// 픽셀 스프라이트 — 이미지 파일 0개. 문자 격자 + 팔레트로 정의하고 오프스크린 캔버스에 한 번만 굽는다.
// 매 프레임 셀 단위 fillRect 를 돌리면 몬스터 20 마리에서 프레임이 무너진다. 반드시 캐시한다.

const SPRITES = {
  player: {
    pal: { 'K':'#241a12', 'h':'#7a5330', 'H':'#54381f', 's':'#f0c9a0', 'S':'#d0a077', 'e':'#20242c', 'b':'#3f8f5f', 'B':'#2f6f47', 'p':'#40506b', 'P':'#2e3b52', 'c':'#2b2f38' },
    rows: [
      '.......KKKKKKKK.......',
      '.....KKhhhhhhhhKK.....',
      '....KhhhhhhhhhhhhK....',
      '...KhhhhhhhhhhhhhhK...',
      '...KhhsssssssssshhK...',
      '...KhsssssssssssshK...',
      '...KhsseessseesssHK...',
      '...KhssssssssssssHK...',
      '...KHhsssssssssshHK...',
      '....KsssssssssssSK....',
      '.....KKssssssssKK.....',
      '.......KsssssssK......',
      '....KKKBBBBBBBBKKK....',
      '...KsKBbbbbbbbbBKsK...',
      '..KssKBbbbbbbbbBKssK..',
      '..KssKbbbbbbbbbbKssK..',
      '..KsSKbbbbbbbbbbKsSK..',
      '..KKKKbbbbbbbbbbKKKK..',
      '.....KbbbbbbbbbbK.....',
      '.....KBBBBBBBBBBK.....',
      '.....KppppppppppK.....',
      '.....KppppKKppppK.....',
      '.....KpppKKKKpppK.....',
      '.....KpppK..KpppK.....',
      '.....KPppK..KPppK.....',
      '.....KcccK..KcccK.....',
      '....KKcccKKKKcccKK....',
      '....KKKKK...KKKKK.....',
    ],
  },
  slime: {
    pal: { 'K':'#1e3a12', 'a':'#6fbf3f', 'b':'#4a9130', 'c':'#a8e05f', 'd':'#c9f08a' },
    rows: [
      '..........KKKKKK........',
      '........KKccccccKK......',
      '.......KcdddcccaaaK.....',
      '......KcdddccaaaaaaK....',
      '.....KcdddcaaaaaaaaaK...',
      '....KccdccaaaaaaaaaaaK..',
      '...KccccaaaaaaaaaaaaabK.',
      '..KcccaaaaaaaaaaaaaaaabK',
      '..KaaaaKKaaaaaaKKaaaaabK',
      '..KaaaaaaaaaaaaaaaaaabbK',
      '..KaaaaaaKKKKaaaaaaaabbK',
      '.KaaaaaaaaaaaaaaaaaabbbK',
      '.KaaaaaaaaaaaaaaaaabbbbK',
      'KaaaaaaaaaaaaaaaaabbbbbK',
      'KbaaaaaaaaaaaaaabbbbbbbK',
      'KbbbbbbbbbbbbbbbbbbbbbbK',
      '.KKKKKKKKKKKKKKKKKKKKKK.',
    ],
  },
  rat: {
    pal: { 'K':'#2a1c10', 'a':'#8b6b4a', 'b':'#6a4f34', 'c':'#a98a67', 't':'#d9a8a0', 'e':'#141414', 'n':'#e0a0a0' },
    rows: [
      '.....................KKKK.....',
      '....................KaaaaK....',
      '...KKK..............KacccaK...',
      '..KttK..............KaccccK...',
      '.KtK.K..............KaaaaaK...',
      '.KtK..KK.......KKKKKKaaaaaK...',
      '.KtK....KKKKKKKcccccaaaaaaK...',
      '..KtK..KKcccccccccccaaaaeaK...',
      '...KtKKcccccccccccccaaaaaanK..',
      '....KKcccccccccccccaaaaaaanKK.',
      '.....KbccccccccccccaaaaaaaanK.',
      '.....KbbbcccccccccaaaaaaaaKK..',
      '.....KbbbbbbbbbbbbbbbbbbbK....',
      '......KbbKbbKKKbbKbbKKKbK.....',
      '......KKK.KK...KKK.KK..KK.....',
    ],
  },
  boar: {
    pal: { 'K':'#241608', 'a':'#6b4a2e', 'b':'#4a3220', 'c':'#8a6642', 'm':'#3a2616', 'w':'#f0e6cc', 'e':'#1a1008', 'n':'#3a2a1e' },
    rows: [
      '..........KKK.....KK...........',
      '.........KmmmKKKKKmmK..........',
      '........KmmKmmmmmmmmmKK........',
      '.......KmmKKcccccccmmmmKK......',
      '......KmmKcccccccccccmmmmKK....',
      '.....KmmKccccccccccccccaaaaK...',
      '....KmKKccccccccccccccaaaaaaK..',
      '...KKKcccccccccccccccaaaeaaanK.',
      '..KKcccccccccccccccccaaaaaaannK',
      '.KaccccccccccccccccccaaaaaaannK',
      'KaaacccccccccccccccccaaaaaaannK',
      'KaaaaaaacccccccccccaaaaaawaannK',
      'KaaaaaaaaaaaaaaaaaaaaaaawaaannK',
      '.KaaaaaaaaaaaaaaaaaaaaaaaaaannK',
      '.KbbbbbbbbbbbbbbbbbbbbbbbbbbK..',
      '..KbbKbbKKKKKKbbKbbKKKKKbbKK...',
      '..KbbKbbK....KbbKbbK...KbbK....',
      '..KKKKKKK....KKKKKKK...KKKK....',
    ],
  },
  bear: {
    pal: { 'K':'#241408', 'a':'#7a5230', 'b':'#5a3a20', 'c':'#96683c', 'm':'#d9b489', 'e':'#160e06', 'n':'#2a1a10' },
    rows: [
      '...KKKK..........KKKK...',
      '..KaaaaK........KaaaaK..',
      '.KaccccaK......KaccccaK.',
      '.KacccaaKKKKKKKKaacccaK.',
      '.KaaaaKccccccccccKaaaaK.',
      '..KKKKcccccccccccccKKK..',
      '...KccccccccccccccccK...',
      '..KcccceecccccceecccccK.',
      '..KccccccccccccccccccK..',
      '..KcccccmmmmmmmmccccK...',
      '...KcccmmmnnmmmmmccK....',
      '...KKcccmmmmmmmmccKK....',
      '....KKcccccccccccK......',
      '...KaaKcccccccccKaaK....',
      '..KaaaaKcccccccKaaaaK...',
      '.KaaaaaaKmmmmmKaaaaaaK..',
      '.KaaaaaaKmmmmmKaaaaaaK..',
      '.KaaaaaaKmmmmmKaaaaaaK..',
      '.KaaaaaaaKmmmKaaaaaaaK..',
      '..KaaaaaaaaaaaaaaaaaK...',
      '..KbaaaaaaaaaaaaaaabK...',
      '..KbbaaaaaaaaaaaaabbK...',
      '...KbbbbbbbbbbbbbbbK....',
      '...KbbKKbbbbbbKKbbbK....',
      '...KbbK..KKKK..KbbK.....',
      '...KbbK........KbbK.....',
      '..KKbbKK......KKbbKK....',
      '..KKKKKK......KKKKKK....',
    ],
  },
  unicorn: {
    pal: { 'K':'#5a4a5a', 'w':'#f7f7fb', 'v':'#d8d8e6', 'p':'#ff9ec4', 'q':'#ff7ab0', 'g':'#ffd166', 'y':'#e0a83a', 'e':'#3a3a4a', 'n':'#f0b8c8' },
    rows: [
      '.....................KgK......',
      '....................KgyK......',
      '...................KgyK.......',
      '..........KKK.....KgyK........',
      '.........KppKK...KKKK.........',
      '........KpppKKKKKwwwwKK.......',
      '.......KpqppKwwwwwwwwwwK......',
      '......KpqppKwwwwwwewwwwK......',
      '.....KpqppKwwwwwwwwwwwwK......',
      '....KpqppKwwwwwwwwwwwnnK......',
      '....KpqpKwwwwwwwwwwwwnKK......',
      '....KpqKwwwwwwwwwwwwwKK.......',
      '.KKKKppKwwwwwwwwwwwwwK........',
      'KppqqppKwwwwwwwwwwwwK.........',
      'KpqqppKwwwwwwwwwwwwwK.........',
      'KpqqpKwwwwwwwwwwwwwwK.........',
      'KpqpKwwwwwwwwwwwwwwwK.........',
      '.KpKwwwwvvvwwwwwvvvwwK........',
      '..KKwwwvvvKwwwwwvvvKwK........',
      '....KwwvvK.KwwwwKvvKwK........',
      '....KwwvvK.KwwwwKvvKwK........',
      '....KwvvvK.KwwvvKvvKwK........',
      '....KpppK..KpppKKpppKK........',
      '....KKKKK..KKKKK.KKKKK........',
    ],
  },
  sasquatch: {
    pal: { 'K':'#1e1208', 'a':'#6b4726', 'b':'#4a3018', 'c':'#8a5f34', 'm':'#c9955e', 'n':'#a87a48', 'e':'#140c04' },
    rows: [
      '.....KKKKKKKKKK.....',
      '...KKaaaaaaaaaaKK...',
      '..KaaaaaaaaaaaaaaK..',
      '..KaaammmmmmmmaaaK..',
      '..KaammmmmmmmmmaaK..',
      '..KammeemmmmeemmaK..',
      '..KammmmmnnmmmmmaK..',
      '..KammmmKKKKmmmmaK..',
      '..KaammmmmmmmmmaaK..',
      '...KaaammmmmmaaaK...',
      '....KaaaaaaaaaaK....',
      '..KKaaaaaaaaaaaaKK..',
      '.KaaKaaammmmaaaKaaK.',
      'KaaaKaammmmmmaaKaaaK',
      'KaaaKaammmmmmaaKaaaK',
      'KaaaKaaammmmaaaKaaaK',
      'KaaaKaaaaaaaaaaKaaaK',
      'KaaaKaaaaaaaaaaKaaaK',
      'KaaaKKaaaaaaaaKKaaaK',
      '.KaaaKaaaaaaaaKaaaK.',
      '.KnnnKaaaaaaaaKnnnK.',
      '..KKKKbaaaaaabKKKK..',
      '.....KbbbbbbbbK.....',
      '.....KbbKKKKbbK.....',
      '.....KbbK..KbbK.....',
      '.....KbbK..KbbK.....',
      '....KKbbKK.KKbbKK...',
      '...KKnnnnK.KnnnnKK..',
      '...KKKKKKK.KKKKKKK..',
    ],
  },
  zombie: {
    pal: { 'K':'#1c2416', 'a':'#8aa66f', 'b':'#688552', 'c':'#a3bd88', 't':'#5c6b4a', 'u':'#44523a', 'p':'#3f4a3a', 'e':'#e8e8c0', 'm':'#3a2020', 'r':'#8a3030' },
    rows: [
      '......KKKKKKK.......',
      '....KKaaaaaaaKK.....',
      '...KaacccccccaaK....',
      '...KacccccccccaK....',
      '...KaccKeccceccK....',
      '...KaccKeccceccK....',
      '...KacccccccccaK....',
      '...KaccmmmmmccaK....',
      '...KaccKKKKKccaK....',
      '....KaacccccaaK.....',
      '.....KKaaaaaKK......',
      '.......KaaaK........',
      '....KKKttttttKKK....',
      '..KaaKttttttttKaaK..',
      '..KaaKtttrttttKaaK..',
      '..KaaKttttttttKaaK..',
      '..KaaKtttttttuKaaK..',
      '..KaaKttuuuuuuKaaK..',
      '..KacKtttttttuKcaK..',
      '...KKKuuuuuuuuKKK...',
      '.....KppppppppK.....',
      '.....KppppppppK.....',
      '.....KpppKKpppK.....',
      '.....KpppK.KpppK....',
      '.....KpppK.KpppK....',
      '....KKpppK.KpppKK...',
      '....KuuuuK.KuuuuK...',
      '....KKKKKK.KKKKKK...',
    ],
  },
  veteran: {
    pal: { 'K':'#161208', 'd':'#4a6b3a', 'D':'#37522b', 's':'#e0b088', 'S':'#c08f66', 'h':'#3a2a18', 'e':'#1a1a1a', 'v':'#5a6b3a', 'V':'#42502a', 'p':'#4a5a3a', 'c':'#2b2b26', 'n':'#3a3a3a', 'N':'#5a5a5a', 'g':'#8a8a8a' },
    rows: [
      '.....KKKKKKKK.......',
      '....KddddddddK......',
      '...KdDddddddDdK.....',
      '...KsssssssssK......',
      '...KssssssssssK.....',
      '..KhsseessseesK.....',
      '..KhssssssssssK.....',
      '..KhsshhhhhssSK.....',
      '..KhSshhhhhsSSK.....',
      '...KSsssssssSK......',
      '....KKssssKKK.......',
      '..KKKvvvvvvvKKK.....',
      '.KssKvVvvvvVvKssK...',
      'KsssKvvvvvvvvKsssK..',
      'KsssKvvvvvvvvKsssK..',
      'KSssKvvvvvvvvKSssK..',
      '.KKKKvvvvvvvvKKKK...',
      '..KgnnnnnnnnnnnngK..',
      '..KnNNNNNNNNNNNNnK..',
      '...KKKvvvvvvKKKKK...',
      '.....KppppppK.......',
      '.....KppppppK.......',
      '.....KpppKpppK......',
      '.....KpppKpppK......',
      '.....KpppKpppK......',
      '....KKcccKcccKK.....',
      '....KcccccKcccK.....',
      '....KKKKKKKKKKK.....',
    ],
  },
  senator: {
    pal: { 'K':'#0e1014', 'h':'#3a2a1a', 's':'#e8c0a0', 'S':'#c99c78', 'e':'#1a1a1a', 'g':'#cfe0f0', 'w':'#ffffff', 'b':'#1f2937', 'B':'#151d27', 'T':'#d93a3a', 'p':'#f2f2f2', 'r':'#d93a3a', 'c':'#0b0d10' },
    rows: [
      '.....KKKKKKKK.......',
      '....KhhhhhhhhK......',
      '...KhhhhhhhhhhK.....',
      '...KhssssssssshK....',
      '...KssssssssssK.....',
      '..KggKeKggKeKgK.....',
      '..KssssssssssssK....',
      '..KsssssssssssSK....',
      '...KsssKKKKssSK.....',
      '....KssssssSK.......',
      '.....KwwwwwwK.......',
      '...KKKwwTTwwKKK.....',
      '..KbbKwwTTwwKbbK....',
      '.KbbbKwwTTwwKbbbK...',
      '.KbbbKwrTTwwKbbbKppK',
      '.KbbbKwwTTwwKbbbKppK',
      '.KbbbKwwTTwwKbbbKpK.',
      '.KBbbKwwwwwwKbbBK...',
      '..KKKbbbbbbbbKKK....',
      '....KbbbbbbbbK......',
      '....KbbbbbbbbK......',
      '....KbbbKbbbbK......',
      '....KbbbKbbbbK......',
      '....KBbbKbbbBK......',
      '....KbbbKbbbbK......',
      '...KKcccKcccKK......',
      '...KcccccKcccK......',
      '...KKKKKKKKKKK......',
    ],
  },
  pooh: {
    pal: { 'K':'#4a3410', 'y':'#f2c14e', 'Y':'#d9a63a', 'm':'#e8b878', 'r':'#d94b3a', 'R':'#b83a2a', 'e':'#2a1a10', 'h':'#c48a3a', 'H':'#8a5f24', 'n':'#f7d98a' },
    rows: [
      '..KKKK........KKKK..',
      '.KyyyyK......KyyyyK.',
      '.KyYYyKKKKKKKKyYYyK.',
      '.KyyyKyyyyyyyyKyyyK.',
      '..KKKyyyyyyyyyyKKK..',
      '...KyyyyyyyyyyyyK...',
      '...KyyeyyyyyyeyyK...',
      '...KyyyyyyyyyyyyK...',
      '...KyyynmmmmnyyyK...',
      '....KyymmeemmyyK....',
      '....KyyymmmmyyyK....',
      '.....KyyyyyyyyK.....',
      '...KKKrrrrrrrrKKK...',
      '..KyyKrrrrrrrrKyyK..',
      '..KyyKrrrrrrrrKyyK..',
      '..KyyKrRrrrrRrKyyK..',
      '..KyyKrrrrrrrrKyyKK.',
      '...KKKrrrrrrrrKKKhhK',
      '.....KrrrrrrrrK.KhHK',
      '.....KyyyyyyyyK.KhhK',
      '.....KyyyyyyyyK.KKKK',
      '.....KYyyyyyyYK.....',
      '.....KyyyKKyyyK.....',
      '.....KyyyK.KyyyK....',
      '....KKyyyK.KyyyKK...',
      '....KYYyyK.KyyYYK...',
      '....KKKKKK.KKKKKK...',
    ],
  },
};

const SENATOR_TIES = { red: '#d93a3a', blue: '#2f6fd9' };

const _cache = new Map();

// key 는 스프라이트 이름, over 는 팔레트 덮어쓰기(넥타이 색 등).
// 결과는 격자 1칸 = 1px 인 작은 캔버스다. 실제 크기 조절은 그릴 때 한다.
function bake(key, over) {
  const id = key + (over ? ':' + JSON.stringify(over) : '');
  if (_cache.has(id)) return _cache.get(id);

  const sp = SPRITES[key];
  if (!sp) throw new Error('없는 스프라이트: ' + key);
  const pal = Object.assign({}, sp.pal, over || {});
  const w = Math.max(...sp.rows.map(r => r.length));
  const h = sp.rows.length;

  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  sp.rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = pal[row[x]];
      if (!c) continue;              // '.' 은 투명
      g.fillStyle = c;
      g.fillRect(x, y, 1, 1);
    }
  });

  const out = { cv, w, h };
  _cache.set(id, out);
  return out;
}

// 바닥(발밑) 기준으로 그린다. 횡스크롤은 발이 지면에 붙어야 해서 중심 기준이면 계속 어긋난다.
function drawSprite(ctx, key, cx, footY, drawW, drawH, opts = {}) {
  const s = bake(key, opts.pal);
  const x = cx - drawW / 2, y = footY - drawH;
  ctx.save();
  ctx.imageSmoothingEnabled = false;      // 이게 켜져 있으면 픽셀아트가 뭉갠다
  if (opts.alpha != null) ctx.globalAlpha = opts.alpha;
  if (opts.flip) { ctx.translate(cx * 2, 0); ctx.scale(-1, 1); }
  ctx.drawImage(s.cv, 0, 0, s.w, s.h, x, y, drawW, drawH);
  if (opts.flash) {                        // 피격 실루엣
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = `rgba(255,255,255,${opts.flash})`;
    ctx.fillRect(x, y, drawW, drawH);
  }
  ctx.restore();
}


/* ---------- 장비 스프라이트 ---------- */
// 등급 1~10. 무기는 실루엣 3종(길이)을 등급대로 늘리고 팔레트로 재질을 바꾼다.
// 10개를 손으로 다 그리는 것보다 격자를 만들어 쓰는 쪽이 짧고, 등급이 늘어도 그대로 돈다.
const WEAPON_PAL = [
  { b:'#b98a52', t:'#d9b184', g:'#7a5a34', h:'#5c4326', p:'#8a6a3e' },  // 1 나무·구리
  { b:'#c8ced6', t:'#eef2f6', g:'#8f96a0', h:'#5a4a34', p:'#9aa2ad' },  // 2 철
  { b:'#d9e0e8', t:'#ffffff', g:'#e0b455', h:'#5a4a34', p:'#e0b455' },  // 3 강철·금장식
  { b:'#a8e6cf', t:'#e7fff5', g:'#7fbfa0', h:'#4a5c50', p:'#9ad9bd' },  // 4 비취
  { b:'#cfe6ff', t:'#ffffff', g:'#7f9fd0', h:'#3f4a5c', p:'#9fc0e8' },  // 5 룬
  { b:'#ff7a2e', t:'#ffd166', g:'#8a3a1a', h:'#4a2a18', p:'#ff9f45' },  // 6 화염
  { b:'#7fc6ff', t:'#e8f6ff', g:'#3f7fbf', h:'#2f4a5c', p:'#a8dcff' },  // 7 냉기
  { b:'#4a5260', t:'#8a94a4', g:'#2a2f38', h:'#22262e', p:'#6a7488' },  // 8 흑철
  { b:'#ffd166', t:'#fff3c4', g:'#c9962e', h:'#6a4a1e', p:'#ffdf8a' },  // 9 황금
  { b:'#b48aff', t:'#f0e6ff', g:'#6a3fbf', h:'#2e2440', p:'#d9c2ff' },  // 10 우주
];
const WEAPON_GLOW = [null, null, null, null, '#4da3ff', '#ff8a3d', '#8fd4ff', null, '#ffd166', '#c9a0ff'];

// 날을 위로 세운 격자를 만든다. 회전은 그릴 때 손 위치를 축으로 한다.
function weaponRows(grade) {
  const len = 6 + Math.floor((grade - 1) / 3) * 2;      // 1~3:6  4~6:8  7~9:10  10:12
  const rows = ['.t.'];
  for (let i = 0; i < len; i++) rows.push(i === 0 ? '.t.' : '.b.');
  rows.push('ggg', '.h.', '.h.', '.p.');
  return rows;
}

const HELMET_PAL = [
  { L:'#8a6a42', l:'#6b5030' },
  { M:'#9aa3ad', m:'#6f7883' },
  { I:'#b9c1cb', i:'#7f8894' },
  { I:'#c3cad3', G:'#e0b455' },
  { I:'#dfe6ee', G:'#e0b455', W:'#ffffff' },
  { R:'#8f2f3a', H:'#e05a3a' },
  { P:'#2f4a7a', S:'#7fb0ff' },
  { K:'#3a404c', E:'#ff4d4d' },
  { G:'#ffd166', J:'#7fd6ff' },
  { D:'#c0442e', E:'#ffd166' },
];
const HELMETS = [
  ['....LLLL....','...LLLLLLL..','..LLLLLLLLL.','..l.......l.'],
  ['....MMMM....','...MMMMMMM..','..MMMMMMMMM.','..MM.....MM.','..mm.....mm.'],
  ['....IIII....','...IIIIIII..','..IIIIIIIII.','..II.....II.','..i.......i.'],
  ['...IIIIII...','..IIIIIIII..','..IIIGGIII..','..III..III..','..III..III..','...IIIIII...'],
  ['W...IIII...W','WW.IIIIII.WW','.WWIIIIIIWW.','..IIGGGGII..','..II....II..','...IIIIII...'],
  ['H..........H','.H..RRRR..H.','..HRRRRRRH..','..RRRRRRRR..','..RR....RR..','...RRRRRR...'],
  ['.....P......','....PPP.....','...PPPPP....','..PPPPPPP...','.PPPPPPPPP..','..SSSSSSS...'],
  ['...KKKKKK...','..KKKKKKKK..','..KK.EE.KK..','..KKKKKKKK..','..KK....KK..','...KKKKKK...'],
  ['..G.G.G.G...','..GGGGGGG...','..GJGJGJG...','..GGGGGGG...'],
  ['D..........D','.DD.DDDD.DD.','..DDDDDDDD..','..DDEEEEDD..','..DD.DD.DD..','...DDDDDD...'],
];

// 갑옷은 몸통('b')과 트림('B') 색만 바꾼다. 실루엣을 새로 그리는 것보다 훨씬 싸고
// 10 등급이 화면에서 확실히 구분된다.
const ARMOR_PAL = [
  { b:'#8a6a42', B:'#6b5030' },   // 1 가죽
  { b:'#a8895c', B:'#7d6440' },   // 2 천
  { b:'#9aa3ad', B:'#6f7883' },   // 3 사슬
  { b:'#c3cad3', B:'#8e97a2' },   // 4 판금
  { b:'#dfe6ee', B:'#e0b455' },   // 5 은기사
  { b:'#8f2f3a', B:'#e0b455' },   // 6 붉은 마도
  { b:'#2f4a7a', B:'#7fb0ff' },   // 7 청 로브
  { b:'#3a404c', B:'#6a7488' },   // 8 흑철
  { b:'#dff0ff', B:'#7fd6ff' },   // 9 신성
  { b:'#c0442e', B:'#ff9f45' },   // 10 용린
];

const GEAR_NAME = {
  weapon: ['구리 검','철 검','강철 검','비취 검','룬 검','화염 검','서리 검','흑철 검','황금 검','성운 검'],
  helmet: ['가죽 두건','사슬 두건','철 투구','십자 투구','날개 투구','악마 투구','마도사 모자','흑기사 투구','왕관','용머리 투구'],
  armor:  ['가죽 갑옷','천 갑옷','사슬 갑옷','판금 갑옷','은기사 갑옷','붉은 로브','청 로브','흑철 갑옷','신성 갑옷','용린 갑옷'],
};

// rows + pal 을 바로 굽는다. 이름으로만 찾는 bake() 와 달리 즉석 격자를 받는다.
const _gcache = new Map();
function bakeRows(id, rows, pal) {
  if (_gcache.has(id)) return _gcache.get(id);
  const w = Math.max(...rows.map(r => r.length)), h = rows.length;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = pal[row[x]];
      if (!c) continue;
      g.fillStyle = c; g.fillRect(x, y, 1, 1);
    }
  });
  const out = { cv, w, h };
  _gcache.set(id, out);
  return out;
}

// 스프라이트 원본 격자 크기. 그리는 쪽이 이걸로 배율을 잡아야 픽셀이 안 찌그러진다.
const dims = key => { const s = bake(key); return { w: s.w, h: s.h }; };

const helmetSprite = grade => bakeRows('H' + grade, HELMETS[grade - 1], HELMET_PAL[grade - 1]);
const weaponSprite = grade => bakeRows('W' + grade, weaponRows(grade), WEAPON_PAL[grade - 1]);

// 손을 축으로 회전시켜 그린다. angle 은 라디안, 0 이 위로 세운 상태.
function drawWeapon(ctx, grade, handX, handY, angle, unit, flip) {
  const s = weaponSprite(grade);
  const glow = WEAPON_GLOW[grade - 1];
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.translate(handX, handY);
  ctx.rotate(flip ? -angle : angle);
  const w = s.w * unit, h = s.h * unit;
  if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = 10; }
  // 자루 끝(아래)이 손에 오도록 내린다.
  ctx.drawImage(s.cv, 0, 0, s.w, s.h, -w / 2, -h + unit * 2, w, h);
  ctx.restore();
}

// 인벤토리 목록용 아이콘. 이미 구운 캔버스를 그대로 data URL 로 낸다.
const _thumb = new Map();
function gearThumb(slot, grade) {
  const id = slot + grade;
  if (_thumb.has(id)) return _thumb.get(id);
  let cv;
  if (slot === 'weapon') cv = weaponSprite(grade).cv;
  else if (slot === 'helmet') cv = helmetSprite(grade).cv;
  else {
    // 갑옷은 실루엣이 없고 색만 바뀌므로 몸통 조각을 작게 그려 쓴다.
    const a = ARMOR_PAL[grade - 1];
    cv = document.createElement('canvas'); cv.width = 10; cv.height = 10;
    const g = cv.getContext('2d');
    g.fillStyle = a.B; g.fillRect(0, 0, 10, 2); g.fillRect(0, 8, 10, 2);
    g.fillStyle = a.b; g.fillRect(0, 2, 10, 6);
    g.fillStyle = a.B; g.fillRect(0, 2, 2, 6); g.fillRect(8, 2, 2, 6);
  }
  const url = cv.toDataURL();
  _thumb.set(id, url);
  return url;
}

if (typeof window !== 'undefined') window.Sprites = { SPRITES, SENATOR_TIES, bake, dims, drawSprite, drawWeapon, helmetSprite, weaponSprite, ARMOR_PAL, GEAR_NAME, WEAPON_GLOW, gearThumb };
if (typeof module !== 'undefined' && module.exports) module.exports = { SPRITES, SENATOR_TIES, HELMETS, HELMET_PAL, ARMOR_PAL, WEAPON_PAL, GEAR_NAME, weaponRows };
