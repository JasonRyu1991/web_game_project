// 어비스 딜버 — 화면과 입력. 수치와 규칙은 전부 core.js 에 있다.
(() => {
const C = window.CORE;
const ui = id => document.getElementById(id);

/* ---------- 숫자 표기 ---------- */
// 방치형은 금방 조 단위가 된다. 자릿수 그대로 두면 칸을 넘긴다.
const UNITS = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'De'];
function fmt(n) {
  if (!Number.isFinite(n)) return '0';
  if (n < 1000) return String(Math.floor(n));
  let i = 0;
  while (n >= 1000 && i < UNITS.length - 1) { n /= 1000; i++; }
  return n.toFixed(n < 10 ? 2 : n < 100 ? 1 : 0) + UNITS[i];
}

function fmtDuration(sec) {
  const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60);
  if (h && m) return `${h}시간 ${m}분`;
  if (h) return `${h}시간`;
  return `${Math.max(1, m)}분`;
}

const cv = ui('view'), g = cv.getContext('2d');

/* ---------- 몬스터 스프라이트 (절차 생성, 에셋 0장) ---------- */
// 원점은 발밑 가운데, 위쪽이 -y. 부위를 겹쳐 쌓되 머리는 어깨 위로 확실히 올린다.
function makeSprite(w, h, paint) {
  const t = document.createElement('canvas');
  t.width = w; t.height = h;
  const c = t.getContext('2d');
  c.translate(w / 2, h);
  c.lineJoin = c.lineCap = 'round';
  paint(c);
  return t;
}

const sym = (c, draw) => { draw(c); c.save(); c.scale(-1, 1); draw(c); c.restore(); };

function shape(c, path, fill, line = '#120b09', w = 3) {
  c.beginPath(); path(c); c.closePath();
  c.fillStyle = fill; c.fill();
  if (w) { c.strokeStyle = line; c.lineWidth = w; c.stroke(); }
}

// 위가 밝고 아래가 어두운 세로 그라데이션. 단색으로 칠하면 종이인형처럼 납작해진다.
function vgrad(c, top, bottom, light, dark) {
  const g = c.createLinearGradient(0, top, 0, bottom);
  g.addColorStop(0, light); g.addColorStop(1, dark);
  return g;
}

function glow(c, x, y, r, color) {
  c.save();
  c.shadowColor = color; c.shadowBlur = r * 3;
  c.fillStyle = color;
  c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2);
  c.fill(); c.fill();
  c.restore();
}

// 임프: 마르고 빠른 잡몹. 웅크린 자세에 긴 팔.
const gruntTex = makeSprite(112, 162, c => {
  const body = vgrad(c, -100, -40, '#9c4a33', '#4e2013');
  const limb = vgrad(c, -100, -20, '#7d3826', '#3f1a11');
  sym(c, () => {                                              // 다리 + 발
    shape(c, k => { k.moveTo(4, -48); k.lineTo(21, -50); k.lineTo(24, -8); k.lineTo(7, -6); }, limb);
    shape(c, k => { k.moveTo(5, -10); k.lineTo(27, -12); k.lineTo(30, 0); k.lineTo(4, 1); }, '#38170f');
  });
  sym(c, () => {                                              // 팔은 몸통 뒤에서 시작해 겹치지 않게
    shape(c, k => { k.moveTo(19, -96); k.lineTo(33, -92); k.lineTo(30, -50); k.lineTo(17, -54); }, limb);
    shape(c, k => {                                           // 손 + 발톱
      k.moveTo(17, -52); k.lineTo(31, -49); k.lineTo(33, -33);
      k.lineTo(28, -30); k.lineTo(25, -38); k.lineTo(21, -30); k.lineTo(16, -38);
    }, '#48200f');
  });
  shape(c, k => {                                             // 몸통 (어깨 좁고 허리 잘록)
    k.moveTo(-23, -98); k.lineTo(23, -98);
    k.lineTo(15, -70); k.lineTo(17, -44); k.lineTo(-17, -44); k.lineTo(-15, -70);
  }, body);
  shape(c, k => { k.moveTo(-9, -92); k.lineTo(9, -92); k.lineTo(6, -50); k.lineTo(-6, -50); },
        'rgba(0,0,0,.28)', null, 0);                          // 가슴 그늘
  shape(c, k => { k.moveTo(-7, -104); k.lineTo(7, -104); k.lineTo(6, -94); k.lineTo(-6, -94); }, limb);  // 목
  sym(c, () => shape(c, k => {                                // 뿔은 위로 세운다 (옆으로 벌리면 귀처럼 보임)
    k.moveTo(7, -134); k.lineTo(15, -158); k.lineTo(19, -132); k.lineTo(11, -128);
  }, '#e0d3bb'));
  shape(c, k => {                                             // 머리 — 어깨 위로 확실히
    k.moveTo(-19, -138); k.lineTo(19, -138); k.lineTo(14, -108); k.lineTo(-14, -108);
  }, vgrad(c, -138, -106, '#a5523a', '#5d2718'));
  shape(c, k => { k.moveTo(-14, -120); k.lineTo(14, -120); k.lineTo(13, -112); k.lineTo(-13, -112); },
        'rgba(0,0,0,.35)', null, 0);                          // 눈두덩 그늘
  sym(c, () => glow(c, 8, -126, 4.5, '#ffd93d'));
  c.fillStyle = '#f4efe3';                                    // 이빨
  for (let i = -10; i <= 5; i += 6) {
    c.beginPath(); c.moveTo(i, -114); c.lineTo(i + 4, -114); c.lineTo(i + 2, -108); c.fill();
  }
});

// 파괴자: 갑옷 두른 중간보스. 어깨가 몸통보다 넓고 뿔이 위로 솟는다.
const bruteTex = makeSprite(184, 180, c => {
  const flesh = vgrad(c, -116, -50, '#a54c31', '#572415');
  const armor = vgrad(c, -118, -70, '#7b838f', '#3d434c');
  const steel = vgrad(c, -130, -95, '#8d95a1', '#4a505a');
  sym(c, () => {                                              // 다리
    shape(c, k => { k.moveTo(7, -58); k.lineTo(33, -60); k.lineTo(36, -12); k.lineTo(10, -10); }, flesh);
    shape(c, k => { k.moveTo(8, -14); k.lineTo(39, -16); k.lineTo(43, 1); k.lineTo(7, 2); }, '#2f343a');
  });
  sym(c, () => {                                              // 굵은 팔 + 건틀릿
    shape(c, k => { k.moveTo(44, -104); k.lineTo(70, -98); k.lineTo(65, -50); k.lineTo(41, -55); }, flesh);
    shape(c, k => { k.moveTo(41, -56); k.lineTo(66, -51); k.lineTo(63, -26); k.lineTo(38, -30); }, armor);
  });
  shape(c, k => {                                             // 몸통
    k.moveTo(-38, -118); k.lineTo(38, -118);
    k.lineTo(30, -78); k.lineTo(33, -54); k.lineTo(-33, -54); k.lineTo(-30, -78);
  }, flesh);
  shape(c, k => { k.moveTo(-34, -114); k.lineTo(34, -114); k.lineTo(27, -80); k.lineTo(-27, -80); }, armor);
  c.strokeStyle = '#22262c'; c.lineWidth = 2;                 // 갑옷 패널
  for (const y of [-104, -92]) { c.beginPath(); c.moveTo(-29, y); c.lineTo(29, y); c.stroke(); }
  c.fillStyle = '#1b1f24';                                    // 리벳
  for (const x of [-22, 0, 22]) for (const y of [-109, -86]) {
    c.beginPath(); c.arc(x, y, 2.6, 0, Math.PI * 2); c.fill();
  }
  c.strokeStyle = '#d4553c'; c.lineWidth = 3;                 // 배의 상처
  for (let i = 0; i < 3; i++) {
    c.beginPath(); c.moveTo(-15 + i * 10, -74); c.lineTo(-7 + i * 10, -58); c.stroke();
  }
  sym(c, () => shape(c, k => {                                // 견갑 — 몸통보다 밖으로
    k.moveTo(26, -124); k.lineTo(62, -122); k.lineTo(72, -100); k.lineTo(30, -102);
  }, steel));
  shape(c, k => { k.moveTo(-10, -126); k.lineTo(10, -126); k.lineTo(9, -114); k.lineTo(-9, -114); }, flesh);
  sym(c, () => shape(c, k => {                                // 위로 솟는 뿔
    k.moveTo(13, -152); k.bezierCurveTo(26, -164, 40, -172, 46, -166);
    k.bezierCurveTo(36, -160, 26, -150, 21, -142);
  }, '#ddd2bb'));
  shape(c, k => {                                             // 머리
    k.moveTo(-22, -156); k.lineTo(22, -156); k.lineTo(17, -124); k.lineTo(-17, -124);
  }, vgrad(c, -156, -122, '#b0553a', '#5f2917'));
  shape(c, k => { k.moveTo(-17, -140); k.lineTo(17, -140); k.lineTo(16, -131); k.lineTo(-16, -131); },
        'rgba(0,0,0,.38)', null, 0);
  sym(c, () => glow(c, 9, -145, 5, '#ff7a2a'));
  c.fillStyle = '#efe7d6';
  for (let i = -12; i <= 7; i += 7) {
    c.beginPath(); c.moveTo(i, -130); c.lineTo(i + 5, -130); c.lineTo(i + 2, -123); c.fill();
  }
});

// 군주: 보스. 왕관 뿔, 어깨 가시, 가슴에서 타는 코어.
const bossTex = makeSprite(226, 206, c => {
  const robe = vgrad(c, -150, -4, '#4a2b52', '#1d1224');
  const armor = vgrad(c, -160, -60, '#3d3149', '#201a29');
  const bone = '#d5c9b6';
  shape(c, k => {                                             // 망토
    k.moveTo(-74, -4); k.lineTo(-52, -132); k.lineTo(52, -132); k.lineTo(74, -4);
  }, robe);
  c.strokeStyle = '#180f20'; c.lineWidth = 2;                 // 주름
  for (let i = -2; i <= 2; i++) {
    c.beginPath(); c.moveTo(i * 20, -126); c.lineTo(i * 26, -8); c.stroke();
  }
  sym(c, () => shape(c, k => {                                // 팔
    k.moveTo(52, -128); k.lineTo(78, -122); k.lineTo(72, -52); k.lineTo(48, -58);
  }, armor));
  shape(c, k => {                                             // 몸통 갑옷
    k.moveTo(-42, -156); k.lineTo(42, -156); k.lineTo(34, -66); k.lineTo(-34, -66);
  }, armor);
  c.strokeStyle = '#6b4f7a'; c.lineWidth = 3;                 // 코어 테두리
  c.beginPath(); c.arc(0, -116, 24, 0, Math.PI * 2); c.stroke();
  glow(c, 0, -116, 14, '#c86bff');
  sym(c, () => {                                              // 어깨판 + 가시
    shape(c, k => { k.moveTo(30, -162); k.lineTo(76, -152); k.lineTo(82, -122); k.lineTo(34, -128); }, '#463857');
    for (let i = 0; i < 3; i++) {
      shape(c, k => {
        k.moveTo(38 + i * 15, -160); k.lineTo(44 + i * 15, -186); k.lineTo(50 + i * 15, -156);
      }, bone);
    }
  });
  shape(c, k => { k.moveTo(-12, -166); k.lineTo(12, -166); k.lineTo(11, -152); k.lineTo(-11, -152); }, armor);
  sym(c, () => {                                              // 왕관처럼 뻗는 뿔
    shape(c, k => { k.moveTo(10, -190); k.lineTo(20, -206); k.lineTo(26, -184); }, bone);
    shape(c, k => { k.moveTo(26, -186); k.lineTo(46, -200); k.lineTo(40, -172); }, bone);
  });
  shape(c, k => {                                             // 머리 — 크게 잡아야 얼굴이 읽힌다
    k.moveTo(-28, -194); k.lineTo(28, -194); k.lineTo(22, -152); k.lineTo(-22, -152);
  }, vgrad(c, -194, -150, '#553466', '#2a1936'));
  shape(c, k => { k.moveTo(-22, -178); k.lineTo(22, -178); k.lineTo(21, -166); k.lineTo(-21, -166); },
        'rgba(0,0,0,.4)', null, 0);
  sym(c, () => glow(c, 12, -172, 5.5, '#c86bff'));
  glow(c, 0, -186, 5, '#f0c8ff');                             // 이마의 세 번째 눈
  c.fillStyle = bone;
  for (let i = -14; i <= 9; i += 8) {
    c.beginPath(); c.moveTo(i, -162); c.lineTo(i + 6, -162); c.lineTo(i + 3, -153); c.fill();
  }
});

// 같은 모양의 검은 실루엣. 거리 음영을 스프라이트 모양대로 덮는 데 쓴다.
// 이게 없으면 벽만 어두워지고 몬스터는 밝게 남아 배경에서 붕 뜬다.
function makeShade(tex) {
  const t = document.createElement('canvas');
  t.width = tex.width; t.height = tex.height;
  const c = t.getContext('2d');
  c.drawImage(tex, 0, 0);
  c.globalCompositeOperation = 'source-in';
  c.fillStyle = '#000';
  c.fillRect(0, 0, t.width, t.height);
  return t;
}


// 같은 모양의 검은 실루엣. 거리 음영을 스프라이트 모양대로 덮는 데 쓴다.
// 이게 없으면 벽만 어두워지고 몬스터는 밝게 남아 배경에서 붕 뜬다.
function makeShade(tex) {
  const t = document.createElement('canvas');
  t.width = tex.width; t.height = tex.height;
  const c = t.getContext('2d');
  c.drawImage(tex, 0, 0);
  c.globalCompositeOperation = 'source-in';
  c.fillStyle = '#000';
  c.fillRect(0, 0, t.width, t.height);
  return t;
}

// 처치 보상 아이템. 바닥에 떨어져 위아래로 까딱인다.
const medkitTex = makeSprite(72, 56, c => {
  shape(c, k => { k.moveTo(-30, -4); k.lineTo(30, -4); k.lineTo(30, -40); k.lineTo(-30, -40); },
        vgrad(c, -40, -4, '#e04b4b', '#8d1f1f'));
  shape(c, k => { k.moveTo(-30, -34); k.lineTo(30, -34); k.lineTo(30, -40); k.lineTo(-30, -40); },
        '#f4f0e8', null, 0);
  c.fillStyle = '#f7f3ec';                                   // 흰 십자
  c.fillRect(-5, -32, 10, 24);
  c.fillRect(-15, -25, 30, 10);
  c.strokeStyle = '#5c1414'; c.lineWidth = 2;
  c.strokeRect(-30, -40, 60, 36);
});

const ammoTex = makeSprite(72, 52, c => {
  shape(c, k => { k.moveTo(-28, -4); k.lineTo(28, -4); k.lineTo(28, -32); k.lineTo(-28, -32); },
        vgrad(c, -32, -4, '#7a6a3a', '#3d3419'));
  shape(c, k => { k.moveTo(-28, -32); k.lineTo(28, -32); k.lineTo(22, -38); k.lineTo(-22, -38); },
        '#5d5128');
  for (let i = -2; i <= 2; i++) {                            // 튀어나온 탄피
    shape(c, k => { k.moveTo(i * 11 - 3, -36); k.lineTo(i * 11 + 3, -36); k.lineTo(i * 11 + 3, -46);
                    k.lineTo(i * 11, -50); k.lineTo(i * 11 - 3, -46); }, '#e8c352', '#6a5312', 2);
  }
  c.strokeStyle = '#241d0c'; c.lineWidth = 2;
  c.strokeRect(-28, -32, 56, 28);
  c.fillStyle = '#241d0c'; c.fillRect(-28, -18, 56, 3);
});


// 슬라임: 물컹한 잡몹. 안이 비쳐 보이도록 반투명으로 겹쳐 칠한다.
const slimeTex = makeSprite(130, 108, c => {
  const body = vgrad(c, -96, 0, '#5fd08a', '#1d6b3f');
  shape(c, k => {
    k.moveTo(-58, -2);
    k.bezierCurveTo(-62, -70, -30, -100, 0, -100);
    k.bezierCurveTo(30, -100, 62, -70, 58, -2);
  }, body);
  c.save();                                            // 안쪽이 비치는 느낌
  c.globalAlpha = 0.35;
  shape(c, k => {
    k.moveTo(-34, -6); k.bezierCurveTo(-36, -56, -18, -76, 0, -76);
    k.bezierCurveTo(18, -76, 36, -56, 34, -6);
  }, '#a8f0c4', null, 0);
  c.restore();
  shape(c, k => { k.ellipse(-20, -74, 12, 8, -0.5, 0, Math.PI * 2); }, 'rgba(255,255,255,.5)', null, 0);
  sym(c, () => glow(c, 17, -58, 6, '#0d3b22'));        // 눈
  c.fillStyle = '#0d3b22';                             // 입
  c.beginPath(); c.ellipse(0, -36, 13, 8, 0, 0, Math.PI); c.fill();
});

// 해골: 마른 뼈다귀. 갈비뼈와 텅 빈 눈구멍이 실루엣을 만든다.
const skeletonTex = makeSprite(112, 164, c => {
  const bone2 = vgrad(c, -150, -10, '#efe7d4', '#9b917c');
  sym(c, () => {                                       // 다리
    shape(c, k => { k.moveTo(4, -52); k.lineTo(18, -54); k.lineTo(21, -6); k.lineTo(7, -4); }, bone2);
    shape(c, k => { k.moveTo(5, -8); k.lineTo(26, -10); k.lineTo(28, 1); k.lineTo(4, 2); }, '#8a8271');
  });
  shape(c, k => { k.moveTo(-24, -104); k.lineTo(24, -104); k.lineTo(16, -50); k.lineTo(-16, -50); },
        'rgba(20,18,14,.55)', null, 0);                // 몸통 안쪽 그늘
  sym(c, () => {                                       // 갈비뼈
    for (let i = 0; i < 4; i++)
      shape(c, k => { k.moveTo(2, -100 + i * 12); k.lineTo(23, -96 + i * 12);
                      k.lineTo(23, -90 + i * 12); k.lineTo(2, -94 + i * 12); }, bone2, '#5f5a4a', 1.5);
  });
  shape(c, k => { k.moveTo(-9, -108); k.lineTo(9, -108); k.lineTo(7, -98); k.lineTo(-7, -98); }, bone2);
  sym(c, () => shape(c, k => {                         // 팔
    k.moveTo(24, -100); k.lineTo(35, -98); k.lineTo(31, -52); k.lineTo(21, -54);
  }, bone2));
  shape(c, k => {                                      // 두개골
    k.moveTo(-22, -152); k.lineTo(22, -152); k.lineTo(20, -122); k.lineTo(12, -110);
    k.lineTo(-12, -110); k.lineTo(-20, -122);
  }, bone2);
  sym(c, () => shape(c, k => { k.ellipse(11, -138, 7, 8, 0, 0, Math.PI * 2); }, '#15120e', null, 0));
  sym(c, () => glow(c, 11, -138, 3.5, '#ff6a3d'));     // 눈구멍 속 불씨
  c.fillStyle = '#15120e';
  for (let i = -8; i <= 5; i += 6) c.fillRect(i, -118, 4, 7);
});

// 골렘: 돌덩이 중간보스. 팔이 몸통보다 크다.
const golemTex = makeSprite(190, 176, c => {
  // 그라데이션 범위가 머리(-166)까지 덮지 않으면 위쪽이 밝은 채로 남아 돌이 아니라 나무처럼 보인다
  const rock = vgrad(c, -176, 0, '#7b776f', '#33312d');
  const rock2 = vgrad(c, -176, 0, '#6a665e', '#2a2825');
  sym(c, () => shape(c, k => {                         // 다리
    k.moveTo(10, -56); k.lineTo(44, -60); k.lineTo(48, -4); k.lineTo(12, -2);
  }, rock2));
  shape(c, k => {                                      // 몸통
    k.moveTo(-44, -132); k.lineTo(44, -132); k.lineTo(36, -52); k.lineTo(-36, -52);
  }, rock);
  c.strokeStyle = '#2b2926'; c.lineWidth = 2.5;        // 갈라진 금
  c.beginPath(); c.moveTo(-14, -128); c.lineTo(-4, -100); c.lineTo(-18, -84); c.lineTo(-8, -58); c.stroke();
  c.beginPath(); c.moveTo(20, -122); c.lineTo(10, -96); c.lineTo(24, -76); c.stroke();
  glow(c, 0, -96, 11, '#ff8a3d');                      // 가슴의 용암
  sym(c, () => {                                       // 큰 팔
    shape(c, k => { k.moveTo(40, -134); k.lineTo(84, -126); k.lineTo(80, -46); k.lineTo(38, -54); }, rock);
    shape(c, k => { k.moveTo(38, -56); k.lineTo(82, -48); k.lineTo(78, -8); k.lineTo(36, -14); }, rock2);
  });
  shape(c, k => { k.moveTo(-26, -166); k.lineTo(26, -166); k.lineTo(20, -130); k.lineTo(-20, -130); }, rock);
  sym(c, () => glow(c, 11, -152, 5, '#ffb03d'));
  c.strokeStyle = '#2b2926'; c.lineWidth = 2;
  c.beginPath(); c.moveTo(-14, -136); c.lineTo(14, -136); c.stroke();
});

// 용: 보스. 펼친 날개로 폭을 벌어 압도적으로 보이게 한다.
const dragonTex = makeSprite(260, 196, c => {
  const scale = vgrad(c, -170, -10, '#3f7d5a', '#12351f');
  const wing = vgrad(c, -180, -40, '#2c5c46', '#0e2618');
  sym(c, () => {                                       // 날개
    shape(c, k => {
      k.moveTo(34, -150); k.lineTo(126, -178); k.lineTo(112, -128);
      k.lineTo(124, -104); k.lineTo(96, -96); k.lineTo(86, -68); k.lineTo(40, -84);
    }, wing);
    c.strokeStyle = '#0b1f13'; c.lineWidth = 2;
    for (const [x, y] of [[112, -128], [96, -96]]) {
      c.beginPath(); c.moveTo(38, -140); c.lineTo(x, y); c.stroke();
    }
  });
  sym(c, () => shape(c, k => {                         // 다리
    k.moveTo(12, -58); k.lineTo(40, -62); k.lineTo(44, -4); k.lineTo(14, -2);
  }, scale));
  shape(c, k => {                                      // 몸통
    k.moveTo(-38, -142); k.lineTo(38, -142); k.lineTo(30, -54); k.lineTo(-30, -54);
  }, scale);
  for (let i = 0; i < 4; i++)                          // 배 비늘
    shape(c, k => { k.moveTo(-22, -128 + i * 20); k.lineTo(22, -128 + i * 20);
                    k.lineTo(18, -114 + i * 20); k.lineTo(-18, -114 + i * 20); },
          'rgba(220,230,180,.22)', null, 0);
  sym(c, () => shape(c, k => {                         // 뿔
    k.moveTo(12, -176); k.lineTo(30, -196); k.lineTo(28, -168);
  }, '#d8cfae'));
  shape(c, k => {                                      // 머리
    k.moveTo(-26, -184); k.lineTo(26, -184); k.lineTo(30, -156); k.lineTo(-30, -156);
  }, scale);
  shape(c, k => {                                      // 주둥이
    k.moveTo(-16, -160); k.lineTo(16, -160); k.lineTo(12, -140); k.lineTo(-12, -140);
  }, vgrad(c, -160, -138, '#4a8f68', '#1b4227'));
  c.fillStyle = '#f2ead2';
  for (let i = -10; i <= 6; i += 7) {
    c.beginPath(); c.moveTo(i, -142); c.lineTo(i + 5, -142); c.lineTo(i + 2, -134); c.fill();
  }
  sym(c, () => glow(c, 14, -172, 5, '#ffd23d'));
});

const ENEMY_TEX = {
  imp: gruntTex, slime: slimeTex, skeleton: skeletonTex,
  brute: bruteTex, golem: golemTex,
  overlord: bossTex, dragon: dragonTex,
};
const ENEMY_SHADE = Object.fromEntries(
  Object.entries(ENEMY_TEX).map(([k, t]) => [k, makeShade(t)]));

// 같은 스프라이트를 색만 돌려 다른 몬스터처럼 보이게 한다. 매 프레임 필터를 걸면
// 비싸므로 (종류, 색) 조합마다 한 번만 구워 둔다.
const tintCache = new Map();
function tinted(type, hue) {
  if (!hue) return ENEMY_TEX[type];
  const key = type + '@' + hue;
  let t = tintCache.get(key);
  if (t) return t;
  const src = ENEMY_TEX[type];
  t = document.createElement('canvas');
  t.width = src.width; t.height = src.height;
  const c = t.getContext('2d');
  c.filter = `hue-rotate(${hue}deg) saturate(1.15)`;
  c.drawImage(src, 0, 0);
  tintCache.set(key, t);
  return t;
}


/* ---------- 세이브 ---------- */
const KEY = 'abyss-delver-save-v1';

function load() {
  try {
    return C.normalizeSave(JSON.parse(localStorage.getItem(KEY)));
  } catch {
    return C.newSave();          // 저장 못 읽어도 게임은 떠야 한다
  }
}

let saveTimer = 0;
function save(now = false) {
  s.lastSeen = Date.now();
  const write = () => {
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {}
  };
  if (now) { clearTimeout(saveTimer); write(); return; }
  clearTimeout(saveTimer);
  saveTimer = setTimeout(write, 800);      // 연타로 저장이 쏟아지지 않게
}

const s = load();
let seq = 0;

/* ---------- 전투 ---------- */
let mon = C.monsterAt(s.stage, s.killsInStage);
let hp = mon.maxHp;
let shakeT = 0, hitT = 0, knock = 0, flash = 0;
let tickAcc = 0, tickT = 0;        // 자동 피해를 모았다가 주기로 띄운다
const bits = [];                   // 타격 불꽃과 죽을 때 흩어지는 조각
let death = null;                  // 죽는 연출이 도는 동안의 상태

function nextMonster() {
  mon = C.monsterAt(s.stage, s.killsInStage);
  hp = mon.maxHp;
}

function damage(amount, crit) {
  if (death) return;                       // 죽는 중에는 더 때릴 수 없다
  hp -= amount;
  hitT = 0.12;
  knock = crit ? 14 : 8;                   // 맞으면 뒤로 밀린다
  shakeT = Math.max(shakeT, crit ? 0.18 : 0.09);
  spark(crit ? 16 : 8, crit);
  floatText(amount, crit);
  if (hp <= 0) kill();
}

// 타격 불꽃. 몸통 근처에서 위로 튄다.
function spark(n, crit) {
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
    const v = 90 + Math.random() * 170;
    bits.push({
      kind: 'spark',
      x: 0.5 + (Math.random() - 0.5) * 0.22,
      y: 0.45 + (Math.random() - 0.5) * 0.26,
      vx: Math.cos(a) * v, vy: Math.sin(a) * v,
      life: 0.42 + Math.random() * 0.2, t: 0,
      r: (crit ? 3.4 : 2.4) + Math.random() * 1.6,
      color: crit ? '#ffb347' : '#ffe08a',
    });
  }
}

// 죽을 때 스프라이트를 격자로 잘라 조각마다 날려 보낸다.
function shatter() {
  const cols = 7, rows = 8;                  // 잘게 쪼개야 부서진 것처럼 보인다
  const tex = tinted(mon.type, mon.hue);
  for (let cx = 0; cx < cols; cx++) for (let cy = 0; cy < rows; cy++) {
    const nx = (cx + 0.5) / cols - 0.5, ny = (cy + 0.5) / rows - 0.5;
    bits.push({
      kind: 'piece', cx, cy, cols, rows,
      dx: 0, dy: 0, rot: 0,
      vx: nx * (520 + Math.random() * 420) + (Math.random() - 0.5) * 160,
      vy: -260 - Math.random() * 320 + ny * 220,
      vr: (Math.random() - 0.5) * 16,
      life: 0.7 + Math.random() * 0.25, t: 0,
      tex,
    });
  }
}

function kill() {
  hp = 0;
  const wasKind = mon.kind;
  const killsBefore = s.totalKills;
  const goldBefore = s.gold;
  shatter();
  spark(wasKind === 'boss' ? 44 : wasKind === 'brute' ? 30 : 22, true);
  death = { t: 0 };                        // 연출이 끝나면 다음 몬스터가 나온다
  const res = C.applyKill(s, mon);
  shakeT = wasKind === 'boss' ? 0.6 : 0.35;
  flash = wasKind === 'boss' ? 0.35 : wasKind === 'brute' ? 0.18 : 0;

  flyReward('gold', s.gold - goldBefore, 'goldv');
  flyReward('xp', mon.xp, 'xpbar');
  if (Math.random() < C.dropChance(s.upgrades.luck)) {
    const item = C.rollItem(s.stage, Math.random, seq++);
    s.bag.push(item);
    s.gearFound++;
    const cur = s.equipped[item.slot];
    if (!cur || item.power > cur.power) {          // 더 좋으면 알아서 끼워 준다
      C.equip(s, item.id);
      toast(`${C.rarityOf(item.rarity).name} ${C.SLOTS[item.slot].name} 장착`);
    } else {
      toast(`${C.rarityOf(item.rarity).name} ${C.SLOTS[item.slot].name} 획득`);
    }
    if (panelTab !== 'up') renderPanel();
  }
  refreshBadges();
  if (res.levels) levelUpCard();
  if (wasKind === 'boss') banner('보스 격파', C.TYPE_NAMES[mon.type] + ' 를 쓰러뜨렸다', 'boss');
  else if (res.staged) banner(`스테이지 ${s.stage}`, '더 깊이 내려간다');

  const mile = C.milestoneReached(killsBefore, s.totalKills);
  if (mile) setTimeout(() => banner(mile.name, `${fmt(mile.kills)}마리 처치`, 'mile'), 900);

  save();
  if (panelTab === 'up') renderPanel();          // 골드가 늘면 살 수 있는 게 바뀐다
}

// 탭하면 추가 타격. 방치형이라 안 눌러도 되지만 누르면 빨라진다.
ui('arena').addEventListener('pointerdown', e => {
  e.preventDefault();
  if (death) return;
  const st = C.stats(s);
  const crit = Math.random() < st.crit;
  damage(st.tap * (crit ? st.critMult : 1), crit);
});

function floatText(amount, crit) {
  if (!s.settings.dmgNumbers) return;
  const el = document.createElement('div');
  el.className = 'dmg' + (crit ? ' crit' : '');
  el.textContent = fmt(amount);
  el.style.left = (28 + Math.random() * 44) + '%';
  el.style.top = (18 + Math.random() * 18) + '%';
  ui('float').appendChild(el);
  setTimeout(() => el.remove(), 850);
}

// 처치 보상이 몬스터 자리에서 위쪽 지표로 날아간다. 어디로 들어가는지 보이면
// 같은 숫자라도 벌었다는 느낌이 훨씬 확실하다.
function flyReward(kind, amount, targetId) {
  const arena = ui('arena'), target = ui(targetId);
  const a = arena.getBoundingClientRect(), t = target.getBoundingClientRect();
  const el = document.createElement('div');
  el.className = 'fly ' + kind;
  el.textContent = (kind === 'gold' ? '+' : '+') + fmt(amount);
  el.style.left = (46 + Math.random() * 8) + '%';
  el.style.top = '46%';
  ui('float').appendChild(el);
  requestAnimationFrame(() => {
    el.style.transform =
      `translate(${t.left + t.width / 2 - a.left - a.width * 0.5}px, ${t.top - a.top - a.height * 0.46}px) scale(.8)`;
    el.style.opacity = '0';
  });
  setTimeout(() => el.remove(), 620);
}

let bannerTimer = 0;
function banner(big, sub, cls = '') {
  const el = ui('banner');
  el.querySelector('.big').textContent = big;
  el.querySelector('.sub').textContent = sub || '';
  el.className = cls + ' show';
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => { el.className = cls; }, 1500);
}

let lvupTimer = 0;
function levelUpCard() {
  const st = C.stats(s);
  ui('lvup').querySelector('h3').textContent = `레벨 ${s.level} 달성`;
  ui('lu-atk').textContent = fmt(st.atk);
  ui('lu-dps').textContent = fmt(st.dps);
  ui('lu-crit').textContent = (st.crit * 100).toFixed(1) + '%';
  ui('lvup').classList.add('show');
  clearTimeout(lvupTimer);
  lvupTimer = setTimeout(() => ui('lvup').classList.remove('show'), 2200);
}

let toastTimer = 0;
function toast(text) {
  const el = ui('toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1300);
}

/* ---------- 그리기 ---------- */
function resize() {
  const r = cv.getBoundingClientRect();
  if (!r.width || !r.height) return;
  const dpr = Math.min(2, devicePixelRatio || 1);
  cv.width = Math.round(r.width * dpr);
  cv.height = Math.round(r.height * dpr);
}
new ResizeObserver(resize).observe(cv);
resize();

function draw(dt) {
  const W = cv.width, H = cv.height;
  if (!W || !H) return;
  shakeT = Math.max(0, shakeT - dt);
  hitT = Math.max(0, hitT - dt);

  g.clearRect(0, 0, W, H);
  const floor = H * 0.86;

  const sky = g.createLinearGradient(0, 0, 0, floor);
  sky.addColorStop(0, '#171b24');
  sky.addColorStop(1, '#23222b');
  g.fillStyle = sky; g.fillRect(0, 0, W, floor);
  g.fillStyle = '#14161c'; g.fillRect(0, floor, W, H - floor);

  // 스테이지마다 색이 도는 원. 진행 중이라는 신호로 배경을 조금 바꾼다.
  const hue = (s.stage * 23) % 360;
  g.save();
  g.globalAlpha = 0.13;
  g.fillStyle = `hsl(${hue} 45% 42%)`;
  g.beginPath(); g.ellipse(W / 2, floor, W * 0.44, H * 0.30, 0, Math.PI, Math.PI * 2); g.fill();
  g.restore();

  const tex = tinted(mon.type, mon.hue);
  const shade = ENEMY_SHADE[mon.type];
  // 발은 바닥선에 붙이므로 키가 floor 를 넘으면 머리가 잘린다. 그 안에서만 키운다.
  const room = floor - H * 0.03;
  const h = Math.min(room, H * (mon.kind === 'boss' ? 0.82 : mon.kind === 'brute' ? 0.70 : 0.55));
  const w = h * (tex.width / tex.height);
  const shakeX = (shakeT > 0 && s.settings.shake) ? (Math.random() - 0.5) * H * 0.05 : 0;
  const x = W / 2 - w / 2 + shakeX;
  const y = floor - h - knock * (H / 600);          // 맞으면 살짝 떠오른다
  knock *= 0.82;

  if (!death) {
    g.drawImage(tex, x, y, w, h);
    if (hitT > 0) {                          // 맞으면 실루엣이 하얗게 번쩍
      g.save();
      g.globalAlpha = Math.min(0.8, hitT * 6);
      g.globalCompositeOperation = 'lighter';
      g.drawImage(shade, x, y, w, h);
      g.restore();
    }
  }

  drawBits(dt, W, H, floor, w, h);

  if (flash > 0) {                          // 큰 놈을 잡으면 화면이 번쩍한다
    flash = Math.max(0, flash - dt * 1.6);
    g.fillStyle = `rgba(255,225,150,${(flash * 0.5).toFixed(3)})`;
    g.fillRect(0, 0, W, H);
  }

  if (death) {
    death.t += dt;
    if (death.t > 0.55) { death = null; nextMonster(); }
  }
}

// 불꽃과 조각을 함께 굴린다. 조각은 죽은 몬스터의 스프라이트를 잘라 쓴다.
function drawBits(dt, W, H, floor, mw, mh) {
  const G = 900;                                    // 중력
  for (let i = bits.length - 1; i >= 0; i--) {
    const b = bits[i];
    b.t += dt;
    if (b.t >= b.life) { bits.splice(i, 1); continue; }
    const k = 1 - b.t / b.life;

    if (b.kind === 'spark') {
      b.vy += G * dt * 0.5;
      b.x += b.vx * dt / W;
      b.y += b.vy * dt / H;
      g.globalAlpha = k;
      g.fillStyle = b.color;
      g.beginPath();
      g.arc(b.x * W, b.y * H, b.r * k + 0.6, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 1;
    } else {
      b.vy += G * dt;
      b.dx += b.vx * dt;
      b.dy += b.vy * dt;
      b.rot += b.vr * dt;
      const pw = mw / b.cols, ph = mh / b.rows;
      const px = W / 2 - mw / 2 + b.cx * pw + b.dx;
      const py = floor - mh + b.cy * ph + b.dy;
      const sc = 0.45 + k * 0.55;            // 날아가면서 작아진다
      g.save();
      g.globalAlpha = Math.min(1, k * 1.8);
      g.translate(px + pw / 2, py + ph / 2);
      g.rotate(b.rot);
      g.scale(sc, sc);
      g.drawImage(b.tex,
        b.tex.width / b.cols * b.cx, b.tex.height / b.rows * b.cy,
        b.tex.width / b.cols, b.tex.height / b.rows,
        -pw / 2, -ph / 2, pw + 0.5, ph + 0.5);
      g.restore();
    }
  }
  g.globalAlpha = 1;
}

/* ---------- 화면 갱신 ---------- */
// 받을 게 있으면 탭과 더보기에 표시한다. 방치형은 화면을 안 보고 있을 때가 많다.
function refreshBadges() {
  const n = C.claimableCount(s);
  const qb = ui('questbadge'), mb = ui('morebadge');
  qb.hidden = !n; qb.textContent = n;
  mb.hidden = !n; mb.textContent = n;
}

function renderTop() {
  const st = C.stats(s);
  ui('stagev').textContent = s.stage + '-' + (s.killsInStage + 1);
  ui('goldv').textContent = fmt(s.gold);
  ui('dpsv').textContent = fmt(st.dps);
  ui('lvv').textContent = s.level;
  const need = C.xpToLevel(s.level);
  ui('xpv').textContent = fmt(s.xp) + ' / ' + fmt(need);
  ui('xpbar').firstElementChild.style.width = Math.min(100, s.xp / need * 100) + '%';

  ui('monname').textContent = C.TYPE_NAMES[mon.type] +
    (mon.kind === 'boss' ? ' — 보스' : mon.kind === 'brute' ? ' — 정예' : '');
  ui('monhpv').textContent = fmt(Math.max(0, hp)) + ' / ' + fmt(mon.maxHp);
  ui('hpbar').className = 'track ' + mon.kind;
  ui('hpbar').firstElementChild.style.width = Math.max(0, hp / mon.maxHp * 100) + '%';
}

/* ---------- 탭 패널 ---------- */
let panelTab = 'up';
const TABS = { up: 't-up', gear: 't-gear', bag: 't-bag', quest: 't-quest' };
for (const [key, id] of Object.entries(TABS)) {
  ui(id).addEventListener('click', () => {
    panelTab = key;
    for (const [k, i] of Object.entries(TABS)) ui(i).setAttribute('aria-selected', String(k === key));
    renderPanel();
  });
}

const rarityTag = it => {
  const r = C.rarityOf(it.rarity);
  return `<span class="tag" style="color:${r.tint}">${r.name}</span>`;
};

function renderPanel() {
  const el = ui('panel');
  if (panelTab === 'up') {
    const st = C.stats(s);
    const nowOf = {
      atk: () => `지금 공격력 ${fmt(st.atk)}`,
      rate: () => `지금 초당 ${st.rate.toFixed(2)}회${st.rate >= C.RATE_CAP ? ' (상한)' : ''}`,
      crit: () => `지금 ${(st.crit * 100).toFixed(1)}%${st.crit >= 0.75 ? ' (상한)' : ''}`,
      luck: () => `지금 드롭률 ${(C.dropChance(s.upgrades.luck) * 100).toFixed(1)}%`,
    };
    el.innerHTML = Object.values(C.UPGRADES).map(u => {
      const owned = s.upgrades[u.key];
      const cost = C.upgradeCost(u.key, owned);
      const effect = u.kind === 'mult'
        ? `단계마다 +${Math.round(u.per * 100)}%`
        : u.key === 'crit' ? `단계마다 치명타 +${(u.per * 100).toFixed(1)}%`
                           : `단계마다 드롭률 상승`;
      return `<div class="row">
        <div class="grow"><div class="name">${u.name} <span class="sub">Lv ${owned}</span></div>
          <div class="sub">${effect} · ${nowOf[u.key]()}</div></div>
        <button class="buy" data-up="${u.key}" ${s.gold < cost ? 'disabled' : ''}>
          강화 <span class="cost">${fmt(cost)}G</span></button>
      </div>`;
    }).join('');
  } else if (panelTab === 'gear') {
    el.innerHTML = C.SLOT_KEYS.map(k => {
      const it = s.equipped[k], slot = C.SLOTS[k];
      if (!it) return `<div class="row"><span class="slotname">${slot.name}</span>
        <div class="grow"><div class="sub">비어 있음 — ${slot.desc}</div></div></div>`;
      const r = C.rarityOf(it.rarity);
      return `<div class="row"><span class="slotname">${slot.name}</span>
        <div class="grow">
          <div class="name">${rarityTag(it)} ${slot.label} +${it.power}%</div>
          <div class="sub">${slot.desc} · ${r.name}은 ${r.desc} · ${it.stage}층에서 주움</div>
        </div></div>`;
    }).join('');
  } else if (panelTab === 'quest') {
    el.innerHTML = C.questState(s).map(q => {
      if (q.allDone) return `<div class="row"><div class="grow">
        <div class="name">${q.name}</div>
        <div class="sub">모든 단계를 끝냈다</div></div></div>`;
      return `<div class="row">
        <div class="grow">
          <div class="name">${q.name} <span class="sub">${q.tier + 1}단계</span></div>
          <div class="sub">${q.desc} · ${fmt(q.cur)} / ${fmt(q.goal)}${q.unit}</div>
          <div class="qbar ${q.claimable ? 'full' : ''}"><i style="width:${(q.ratio * 100).toFixed(1)}%"></i></div>
          <div class="sub">보상 <span class="cost">${fmt(q.reward.gold)}G</span> · 경험치 ${fmt(q.reward.xp)}</div>
        </div>
        <button class="claim" data-quest="${q.key}" ${q.claimable ? '' : 'disabled'}>
          ${q.claimable ? '받기' : '진행 중'}</button>
      </div>`;
    }).join('');
  } else {
    if (!s.bag.length) { el.innerHTML = `<div class="empty">가방이 비어 있다.<br>몬스터를 잡으면 장비가 나온다.</div>`; return; }
    const sorted = [...s.bag].sort((a, b) => b.power - a.power);
    el.innerHTML = sorted.map(it => {
      const slot = C.SLOTS[it.slot];
      const pv = C.previewEquip(s, it);
      const pct = (pv.ratio * 100);
      const what = pv.field === 'goldMult' ? '골드 획득' : '초당 피해';
      const gain = pv.ratio > 0.0005
        ? `<span class="gain">끼면 ${what} +${pct.toFixed(pct < 10 ? 1 : 0)}%</span>`
        : `<span class="gain down">지금 낀 것보다 약하다</span>`;
      return `<div class="row">
        <div class="grow">
          <div class="name">${rarityTag(it)} ${slot.name} +${it.power}%</div>
          <div class="sub">${slot.label} · ${pv.curPower ? `착용 중 +${pv.curPower}%` : '빈 슬롯'} · ${it.stage}층</div>
          <div>${gain}</div>
        </div>
        <button data-eq="${it.id}" ${pv.better ? '' : 'disabled'}>장착</button>
        <button class="sell" data-sell="${it.id}">팔기 <span class="cost">${fmt(C.sellValue(it))}G</span></button>
      </div>`;
    }).join('');
  }
}

ui('panel').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.up) {
    if (C.buyUpgrade(s, b.dataset.up)) { save(); renderPanel(); }
  } else if (b.dataset.eq) {
    if (C.equip(s, b.dataset.eq)) { save(); renderPanel(); toast('장착했다'); }
  } else if (b.dataset.quest) {
    const got = C.claimQuest(s, b.dataset.quest);
    if (got) {
      banner(`${got.name} ${got.tier + 1}단계 완료`, `${fmt(got.reward.gold)}G · 경험치 ${fmt(got.reward.xp)}`, 'mile');
      if (got.levels) levelUpCard();
      save(); renderPanel(); refreshBadges();
    }
  } else if (b.dataset.sell) {
    const v = C.sell(s, b.dataset.sell);
    if (v) { save(); renderPanel(); toast(`${fmt(v)} 골드에 팔았다`); }
  }
});

/* ---------- 더보기 시트 ---------- */
// 설정·랭킹처럼 자주 안 쓰는 것들. 랭킹은 서버가 붙어야 열리므로 자리만 잡아 둔다.
const SHEET_VIEWS = {
  menu: { title: '더보기', render: renderMenu },
  settings: { title: '설정', render: renderSettings },
  ranking: { title: '랭킹', render: renderRanking },
  record: { title: '기록', render: renderRecord },
  about: { title: '정보', render: renderAbout },
};

let sheetView = 'menu';

function openSheet(view = 'menu') {
  sheetView = view;
  ui('sheettitle').textContent = SHEET_VIEWS[view].title;
  ui('sheetbody').innerHTML = SHEET_VIEWS[view].render();
  ui('sheet').hidden = false;
}
function closeSheet() { ui('sheet').hidden = true; }

function renderMenu() {
  const n = C.claimableCount(s);
  return `<div class="menu">
    <button data-view="settings">설정 <span class="hint">피해 숫자 · 화면 흔들림</span></button>
    <button data-view="record">기록 <span class="hint">${fmt(s.totalKills)}마리 · 최고 ${s.bestStage}층</span></button>
    <button data-view="ranking">랭킹 <span class="hint">서버 연결 전</span></button>
    <button data-view="about">정보 <span class="hint">어비스 딜버</span></button>
    ${n ? `<button data-quest-jump="1">받을 보상 ${n}개 <span class="hint">퀘스트로</span></button>` : ''}
  </div>`;
}

function toggleRow(key, label, note) {
  const on = s.settings[key];
  return `<div class="opt">
    <span class="lb">${label}<small>${note}</small></span>
    <button class="sw" role="switch" aria-checked="${on}" data-toggle="${key}"><i></i></button>
  </div>`;
}

function renderSettings() {
  return `<div class="sec">
      <h4>화면</h4>
      ${toggleRow('dmgNumbers', '피해 숫자', '때릴 때 숫자가 떠오른다')}
      ${toggleRow('shake', '화면 흔들림', '큰 타격에 화면이 흔들린다')}
    </div>
    <div class="sec">
      <h4>저장</h4>
      <div class="opt"><span class="lb">이 기기에 저장됨<small>서버 저장은 아직 없다. 브라우저 기록을 지우면 진행도 사라진다</small></span></div>
      <div class="menu"><button class="danger" data-reset="1">진행 초기화</button></div>
    </div>`;
}

function renderRanking() {
  return `<div class="locked">
    랭킹은 서버가 붙어야 열린다.<br>
    지금은 진행도가 이 기기에만 저장되어 있어<br>
    다른 사람과 견줄 수가 없다.<br><br>
    <span style="color:#8b93a5">로그인과 서버 저장이 들어오면<br>최고 층수로 순위를 매길 자리다.</span>
  </div>`;
}

function renderRecord() {
  const st = C.stats(s);
  const done = C.MILESTONES.filter(m => s.totalKills >= m.kills);
  const next = C.MILESTONES.find(m => s.totalKills < m.kills);
  return `<div class="sec">
      <h4>진행</h4>
      <div class="stat"><span>최고 층수</span><span>${s.bestStage}층</span></div>
      <div class="stat"><span>총 처치</span><span>${fmt(s.totalKills)}마리</span></div>
      <div class="stat"><span>주운 장비</span><span>${fmt(s.gearFound)}개</span></div>
      <div class="stat"><span>레벨</span><span>${s.level}</span></div>
    </div>
    <div class="sec">
      <h4>전투력</h4>
      <div class="stat"><span>공격력</span><span>${fmt(st.atk)}</span></div>
      <div class="stat"><span>초당 피해</span><span>${fmt(st.dps)}</span></div>
      <div class="stat"><span>초당 타격</span><span>${st.rate.toFixed(2)}회</span></div>
      <div class="stat"><span>치명타</span><span>${(st.crit * 100).toFixed(1)}%</span></div>
      <div class="stat"><span>골드 획득</span><span>+${((st.goldMult - 1) * 100).toFixed(0)}%</span></div>
    </div>
    <div class="sec">
      <h4>칭호</h4>
      ${done.length
        ? done.map(m => `<div class="stat"><span>${m.name}</span><span>${fmt(m.kills)}마리</span></div>`).join('')
        : '<div class="locked">아직 없다</div>'}
      ${next ? `<div class="stat" style="opacity:.55"><span>${next.name}</span>
                 <span>${fmt(s.totalKills)} / ${fmt(next.kills)}</span></div>` : ''}
    </div>`;
}

function renderAbout() {
  return `<div class="sec">
    <div class="stat"><span>이름</span><span>어비스 딜버</span></div>
    <div class="stat"><span>몬스터</span><span>${C.ALL_TYPES.length}종</span></div>
    <div class="stat"><span>저장</span><span>이 기기</span></div>
  </div>
  <div class="locked">
    이미지·사운드 파일 없이 도형 코드로만 그린다.<br>
    수치와 규칙은 화면과 분리돼 있어<br>
    나중에 서버가 그대로 가져다 쓸 수 있다.
  </div>`;
}

ui('more').addEventListener('click', () => openSheet('menu'));
ui('sheetclose').addEventListener('click', () => {
  if (sheetView === 'menu') closeSheet(); else openSheet('menu');   // 하위 화면에서는 뒤로
});
ui('sheet').addEventListener('click', e => { if (e.target === ui('sheet')) closeSheet(); });

ui('sheetbody').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.view) return openSheet(b.dataset.view);
  if (b.dataset.questJump) {
    closeSheet();
    ui('t-quest').click();
    return;
  }
  if (b.dataset.toggle) {
    const k = b.dataset.toggle;
    s.settings[k] = !s.settings[k];
    b.setAttribute('aria-checked', String(s.settings[k]));
    save();
    return;
  }
  if (b.dataset.reset) {
    if (b.dataset.armed) {                       // 한 번 더 눌러야 지워진다
      try { localStorage.removeItem(KEY); } catch {}
      location.reload();
      return;
    }
    b.dataset.armed = '1';
    b.textContent = '정말 지운다 — 한 번 더';
  }
});

/* ---------- 오프라인 보상 ---------- */
(function offline() {
  const gain = C.offlineGain(s);
  if (!gain.kills) return;
  s.gold += gain.gold;
  s.xp += gain.xp;
  while (s.xp >= C.xpToLevel(s.level)) { s.xp -= C.xpToLevel(s.level); s.level++; }
  s.totalKills += gain.kills;
  ui('awaytime').textContent = `${fmtDuration(gain.sec)} 동안 ${fmt(gain.kills)}마리를 잡았다`;
  ui('offgold').textContent = fmt(gain.gold);
  ui('offxp').textContent = fmt(gain.xp);
  ui('modal').hidden = false;
  save(true);
})();
ui('offok').addEventListener('click', () => { ui('modal').hidden = true; });

/* ---------- 루프 ---------- */
let last = performance.now();
function loop(t) {
  const dt = Math.min(0.25, (t - last) / 1000);
  last = t;
  const st = C.stats(s);
  const auto = death ? 0 : st.dps * dt;   // 죽는 연출 중에는 멈춘다
  hp -= auto;                             // 자동 전투
  tickAcc += auto;
  tickT += dt;
  const period = 1 / Math.min(6, Math.max(1, st.rate));   // 공격 속도만큼 자주 뜬다
  if (tickT >= period) {
    if (tickAcc >= 1) { floatText(tickAcc, false); hitT = Math.max(hitT, 0.08); }
    tickAcc = 0; tickT = 0;
  }
  if (hp <= 0 && !death) kill();
  draw(dt);
  renderTop();
  requestAnimationFrame(loop);
}
renderPanel();
refreshBadges();
requestAnimationFrame(loop);

// 탭을 닫거나 숨길 때는 즉시 저장한다. 안 그러면 마지막 몇 초가 날아간다.
addEventListener('visibilitychange', () => { if (document.hidden) save(true); });
addEventListener('pagehide', () => save(true));

window.GAME = { get save() { return s; }, get mon() { return mon; }, get hp() { return hp; },
                set hp(v) { hp = v; }, get bits() { return bits; },
                fmt, kill, renderPanel, KEY, ENEMY_TEX, tinted };
})();
