// 1bit.kr - 렌더링 + 게임 루프. engine.js 의 순수 로직을 사용한다.
(() => {
const { MAP, MAP_W, MAP_H, SPAWN, WEAPONS, MAX_HP, ENEMIES, pickEnemyKind,
        ITEMS, PICKUP_RANGE, rollDrops,
        tileAt, isWall, castRay, tryMove, hasLineOfSight,
        reachableCells, normAngle, reload } = window.ENGINE;

const cv = document.getElementById('view'), g = cv.getContext('2d');
const ui = id => document.getElementById(id);
const FOV = Math.PI * 75 / 180;     // 기준 화면비(640x400)에서의 수평 시야각
const BASE_AR = 640 / 400;
const MOVE_SPEED = 3.2, TURN_SPEED = 2.2;
const MOUSE_SENS = 0.0022;          // 좌우 회전 (라디안/px)
const PITCH_SENS = 1.1;             // 상하 (화면 px/px)
const LOOK_TURN = 2.8;              // 조준 스틱을 끝까지 밀었을 때 좌우 속도 (라디안/초)
const LOOK_PITCH = 460;             // 조준 스틱 상하 속도 (화면 px/초)
// 손가락 조준은 마우스만큼 정밀하지 않다. 터치일 때만 조준선 근처 적으로 살짝 끌어 준다.
const ASSIST_ANGLE = 0.17;          // 보정이 걸리는 각도 (약 ±10도)
const ASSIST_PULL = 2.4;            // 끌어당기는 세기 (초당 비율)
const ASSIST_HITBOX = 1.6;          // 터치일 때 피격 반경 배수
const OPEN = reachableCells();

/* ---------- 화면 크기 ---------- */
// 내부 렌더 폭 = 레이캐스트 컬럼 수. 표시 크기와 분리해 두면 큰 화면에서도 비용이 안 는다.
const RENDER_W_MAX = 640;
let depth = new Float32Array(1);
let scale = 1;                      // HUD·총 그림은 640x400 기준으로 그려져 있다
let rect = { left: 0, top: 0, width: 1, height: 1 };

function resize() {
  rect = cv.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const w = Math.max(160, Math.min(RENDER_W_MAX, Math.round(rect.width)));
  cv.width = w;
  cv.height = Math.max(120, Math.round(w * rect.height / rect.width));
  depth = new Float32Array(cv.width);
  scale = Math.min(cv.width / 640, cv.height / 400);
}
resize();
new ResizeObserver(resize).observe(cv);
addEventListener('orientationchange', () => setTimeout(resize, 200));

// 캔버스 좌표계로 변환할 때 쓰는 배율 (CSS px → 내부 px)
const k = () => cv.width / rect.width;

// 수평 시야각은 화면비를 따라간다. 고정하면 세로 화면에서 벽이 납작해지고
// 위아래가 천장·바닥으로 텅 빈다. 수직 시야각 쪽을 붙박이로 두는 게 맞다.
// 다만 세로로 긴 화면에서 계산대로 두면 20도까지 좁아져 게임이 안 된다. 45~90도로 묶는다.
const V_FOV = 2 * Math.atan(Math.tan(FOV / 2) / BASE_AR);   // 붙박이 수직 시야각
const FOV_MIN = Math.PI * 45 / 180, FOV_MAX = Math.PI * 90 / 180;
const fov = () => Math.min(FOV_MAX, Math.max(FOV_MIN,
  2 * Math.atan(Math.tan(V_FOV / 2) * (cv.width / cv.height))));

// 투영 거리. 벽과 스프라이트 크기가 모두 여기서 나와야 시야각을 바꿔도
// 확대·축소가 같이 따라온다. 화면 높이로 나누면 시야각과 어긋난다.
const projDist = () => (cv.width / 2) / Math.tan(fov() / 2);

/* ---------- 벽 텍스처 (절차 생성, 이미지 파일 없음) ---------- */
const TEX = 64;
function makeTexture(paint) {
  const t = document.createElement('canvas');
  t.width = t.height = TEX;
  paint(t.getContext('2d'));
  return t;
}
const brickTex = makeTexture(c => {
  c.fillStyle = '#4a3226'; c.fillRect(0, 0, TEX, TEX);        // 줄눈(모르타르)
  for (let row = 0; row < 8; row++) {
    const off = (row % 2) * 16;                                // 한 줄씩 어긋나게
    for (let col = -1; col < 3; col++) {
      const x = col * 32 + off + 2, y = row * 8 + 2;
      const v = 150 + ((row * 7 + col * 13) % 5) * 9;          // 벽돌마다 미세한 색차
      c.fillStyle = `rgb(${v},${v * 0.58 | 0},${v * 0.38 | 0})`;
      c.fillRect(x, y, 28, 4);
      c.fillStyle = 'rgba(255,255,255,0.12)';                  // 윗면 하이라이트
      c.fillRect(x, y, 28, 1);
      c.fillStyle = 'rgba(0,0,0,0.22)';                        // 아랫면 그림자
      c.fillRect(x, y + 3, 28, 1);
    }
  }
});
const metalTex = makeTexture(c => {
  c.fillStyle = '#4b5058'; c.fillRect(0, 0, TEX, TEX);
  for (let i = 0; i < TEX; i += 4) {                           // 세로 패널 라인
    c.fillStyle = i % 16 === 0 ? '#333940' : '#565c66';
    c.fillRect(i, 0, 2, TEX);
  }
  c.fillStyle = '#2b3036';                                     // 리벳
  for (let y = 6; y < TEX; y += 16) for (let x = 6; x < TEX; x += 16) {
    c.beginPath(); c.arc(x, y, 2, 0, Math.PI * 2); c.fill();
  }
});
const texFor = tile => (tile === '=' ? metalTex : brickTex);

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

const ENEMY_TEX = { grunt: gruntTex, brute: bruteTex, boss: bossTex };
const ITEM_TEX = { medkit: medkitTex, ammo: ammoTex };
const ENEMY_SHADE = {
  grunt: makeShade(gruntTex), brute: makeShade(bruteTex), boss: makeShade(bossTex),
};
const ITEM_SHADE = { medkit: makeShade(medkitTex), ammo: makeShade(ammoTex) };

/* ---------- 상태 ---------- */
let p, enemies, items, wave, score, over;
const seenMap = new Uint8Array(MAP_W * MAP_H);   // 미니맵 안개: 0=미방문 1=방문

function newWeapon(def) {
  return { def, mag: def.mag, reserve: def.reserve, reloading: 0 };
}

function spawnEnemy() {
  // 도달 가능한 칸 중 플레이어와 충분히 떨어진 곳
  const far = OPEN.filter(c => Math.hypot(c.x - p.x, c.y - p.y) > 8);
  const c = (far.length ? far : OPEN)[Math.random() * (far.length || OPEN.length) | 0];
  const def = ENEMIES[pickEnemyKind()];
  return { x: c.x, y: c.y, def, hp: def.hp, hurt: 0, cool: 0, alive: true };
}

function reset() {
  p = {
    x: SPAWN.x, y: SPAWN.y, a: 0, pitch: 0, hp: 100,
    guns: { ak: newWeapon(WEAPONS.ak), revolver: newWeapon(WEAPONS.revolver) },
    cur: 'ak', cool: 0, flash: 0, pain: 0, shake: 0, kick: 0,
  };
  wave = 1; score = 0; over = false;
  items = [];
  seenMap.fill(0);
  enemies = Array.from({ length: 3 }, spawnEnemy);
  ui('over').hidden = true;
  hud();
}

const gun = () => p.guns[p.cur];

/* ---------- 입력: 키보드 ---------- */
const keys = {};
addEventListener('keydown', e => {
  keys[e.code] = 1;
  if (e.code === 'KeyR') startReload();
  if (e.code === 'Digit1') switchTo('ak');
  if (e.code === 'Digit2') switchTo('revolver');
  if (e.code === 'Enter' && over) reset();
});
addEventListener('keyup', e => keys[e.code] = 0);

let holding = false, fired = false;

// 상하는 지평선을 위아래로 미는 방식. 화면 높이의 ±60% 로 제한한다.
const clampPitch = v => Math.max(-cv.height * 0.6, Math.min(cv.height * 0.6, v));

function look(dx, dy) {
  p.a += dx * MOUSE_SENS;
  p.pitch = clampPitch(p.pitch - dy * PITCH_SENS);
}

/* ---------- 입력: 터치 (화면 조이스틱) ---------- */
// 왼쪽 스틱 = 이동, 오른쪽 스틱 = 조준. 조준은 민 방향으로 계속 도는 속도식이라
// 드래그와 달리 손가락을 다시 집어올릴 필요가 없다.
const st = {
  move: { el: null, id: null, x: 0, y: 0 },
  look: { el: null, id: null, x: 0, y: 0 },
};
let firePtr = null;

function showTouchUI() {
  if (document.body.classList.contains('touch')) return;
  document.body.classList.add('touch');
  ui('pad').hidden = false;
}
// 손가락으로 조작하는 기기면 처음부터 띄운다. 눌러야 나타나면 있는 줄 모른다.
if (matchMedia('(pointer: coarse)').matches) showTouchUI();

function moveStick(s, cx, cy) {
  const r = s.el.getBoundingClientRect();
  const R = r.width / 2;
  let dx = (cx - (r.left + R)) / R, dy = (cy - (r.top + R)) / R;
  const len = Math.hypot(dx, dy);
  if (len > 1) { dx /= len; dy /= len; }        // 테두리 밖은 최대치로 고정
  s.x = dx; s.y = dy;
  s.el.firstElementChild.style.transform =
    `translate(${(dx * R * 0.58).toFixed(1)}px, ${(dy * R * 0.58).toFixed(1)}px)`;
}

function releaseStick(s) {
  s.id = null; s.x = 0; s.y = 0;
  s.el.firstElementChild.style.transform = 'translate(0,0)';
}

for (const [name, id] of [['move', 's-move'], ['look', 's-look']]) {
  const s = st[name];
  s.el = ui(id);
  s.el.addEventListener('pointerdown', e => {
    e.preventDefault();
    showTouchUI();
    s.id = e.pointerId;
    try { s.el.setPointerCapture(e.pointerId); } catch {}
    moveStick(s, e.clientX, e.clientY);
  });
}

// 스틱과 발사 버튼은 document 에서 끝낸다. 손가락이 요소 밖으로 나가도 놓친 채
// 눌린 상태로 남지 않는다.
addEventListener('pointermove', e => {
  for (const s of [st.move, st.look]) if (s.id === e.pointerId) moveStick(s, e.clientX, e.clientY);
});
function endPointer(e) {
  for (const s of [st.move, st.look]) if (s.id === e.pointerId) releaseStick(s);
  if (e.pointerId === firePtr) { firePtr = null; holding = false; }
}
addEventListener('pointerup', endPointer);
addEventListener('pointercancel', endPointer);

// 캔버스 터치 자체는 조작에 쓰지 않는다. 조작판을 띄우는 신호로만 받는다.
cv.addEventListener('pointerdown', e => {
  if (e.pointerType === 'touch') { e.preventDefault(); showTouchUI(); return; }
  mouseDown(e);
});
cv.addEventListener('pointermove', e => { if (e.pointerType !== 'touch') mouseMove(e); });
cv.addEventListener('pointerup', e => { if (e.pointerType !== 'touch') mouseUp(e); });

/* ---------- 입력: 마우스 (포인터 잠금) ---------- */
let lastX = null, lastY = null;      // 잠금 실패 시 쓰는 직전 커서 위치
const locked = () => document.pointerLockElement === cv;

function mouseDown(e) {
  if (e.button !== 0) return;
  if (!locked()) {
    lastX = lastY = null;
    Promise.resolve(cv.requestPointerLock()).catch(() => {});  // 실패해도 폴백으로 조준됨
    return;                                                    // 잠그는 클릭으로는 쏘지 않음
  }
  holding = true; fired = false;
}
function mouseUp(e) { if (e.button === 0) holding = false; }

function mouseMove(e) {
  if (locked()) { look(e.movementX, e.movementY); lastX = lastY = null; return; }
  // 폴백: 포인터 잠금이 거부되는 환경에서도 커서 이동량으로 조준한다.
  // ponytail: 커서가 화면 끝에 닿으면 더 못 돈다. 잠금이 걸리는 게 정상 경로.
  if (lastX !== null) look((e.clientX - lastX) * k(), (e.clientY - lastY) * k());
  lastX = e.clientX; lastY = e.clientY;
}
// 캔버스 밖에서 버튼을 놓아도 연사가 멈추도록. 이동은 캔버스 리스너만 쓴다
// (잠금 중에는 이벤트가 잠금 대상으로 오므로 document 에서 또 받으면 두 번 돈다)
addEventListener('mouseup', mouseUp);

/* ---------- 입력: 화면 버튼 ---------- */
// pointerdown 만 여기서 받고 해제는 document(endPointer)에 맡긴다. 버튼에서
// 캡처하면 iOS 가 길게 누르기를 취소로 처리할 때 연사가 한 발에서 끊긴다.
function bind(id, down) {
  ui(id).addEventListener('pointerdown', e => { e.preventDefault(); showTouchUI(); down(e); });
}
bind('b-fire', e => { firePtr = e.pointerId; holding = true; fired = false; });
bind('b-reload', startReload);
bind('b-swap', () => switchTo(p.cur === 'ak' ? 'revolver' : 'ak'));
ui('over').addEventListener('pointerdown', () => { if (over) reset(); });
// 길게 누를 때 뜨는 선택·확대 메뉴가 발사를 끊는다
ui('pad').addEventListener('contextmenu', e => e.preventDefault());

/* ---------- 액션 ---------- */
function switchTo(name) {
  if (over || p.cur === name) return;
  p.cur = name;
  p.cool = Math.max(p.cool, 0.25);   // 교체 딜레이
  hud();
}

function startReload() {
  const w = gun();
  if (over || w.reloading > 0 || w.mag >= w.def.mag || w.reserve <= 0) return;
  w.reloading = w.def.reloadSec;
  hud();
}

function fire() {
  const w = gun();
  if (over || p.cool > 0 || w.reloading > 0) return;
  if (w.mag <= 0) return startReload();               // 빈 탄창이면 자동 장전

  w.mag--;
  p.cool = w.def.cool;
  p.flash = 0.05;
  p.shake = w.def.recoil * 0.4;
  p.kick = w.def.recoil;
  p.pitch += w.def.recoil * 0.5;                       // 반동으로 총구가 들림

  const aim = p.a + (Math.random() - 0.5) * w.def.spread;
  const wallDist = castRay(p.x, p.y, aim).dist;
  let best = null;
  for (const e of enemies) {
    if (!e.alive) continue;
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    if (d > wallDist) continue;                                   // 벽 뒤
    const off = Math.abs(normAngle(Math.atan2(e.y - p.y, e.x - p.x) - aim));
    const rad = e.def.radius * (document.body.classList.contains('touch') ? ASSIST_HITBOX : 1);
    if (off > Math.atan2(rad, d)) continue;                       // 조준선 밖
    if (!best || d < best.d) best = { e, d };                     // 제일 가까운 놈만
  }
  hud();
  if (!best) return;
  best.e.hp -= w.def.dmg;
  best.e.hurt = 0.15;
  if (best.e.hp <= 0) {
    best.e.alive = false;
    score += best.e.def.score;
    dropLoot(best.e);
    hud();
  }
}

function dropLoot(e) {
  for (const key of rollDrops(e.def.key)) {
    // 여러 개가 겹쳐 떨어지면 하나만 주운 것처럼 보이므로 조금씩 흩는다
    const a = Math.random() * Math.PI * 2, r = items.length ? 0.28 : 0;
    items.push({ key, x: e.x + Math.cos(a) * r, y: e.y + Math.sin(a) * r, t: 0 });
  }
}

let toastTimer = 0;
function toast(text) {
  const el = ui('toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1400);
}

// 밟고 지나가면 줍는다. 체력이 가득이면 구급상자는 남겨 둔다.
function pickUp() {
  const got = [];                                  // 한 번에 여럿 주울 수 있다. 안내는 합쳐서 한 줄로.
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (Math.hypot(it.x - p.x, it.y - p.y) > PICKUP_RANGE) continue;
    const def = ITEMS[it.key];
    if (it.key === 'medkit') {
      if (p.hp >= MAX_HP) continue;                // 가득이면 그냥 둔다
      const before = p.hp;
      p.hp = Math.min(MAX_HP, p.hp + def.heal);
      got.push(`체력 +${p.hp - before}`);
    } else {
      p.guns.ak.reserve += def.ak;
      p.guns.revolver.reserve += def.revolver;
      got.push(`탄약 +${def.ak}`);
    }
    items.splice(i, 1);
  }
  if (got.length) { toast(got.join('  ·  ')); hud(); }
}

// 터치 조준은 스틱이라 정밀하지 않다. 조준선 근처에 적이 있으면 부드럽게 끌어 준다.
// 마우스에는 걸지 않는다 — 정밀하게 겨눌 수 있는데 손대면 오히려 방해다.
function aimAssist(dt) {
  if (!document.body.classList.contains('touch')) return;
  let best = null;
  for (const e of enemies) {
    if (!e.alive) continue;
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    if (d > 14 || !hasLineOfSight(p.x, p.y, e.x, e.y)) continue;
    const off = normAngle(Math.atan2(e.y - p.y, e.x - p.x) - p.a);
    if (Math.abs(off) > ASSIST_ANGLE) continue;
    if (!best || Math.abs(off) < Math.abs(best.off)) best = { off };
  }
  if (best) p.a += best.off * Math.min(1, ASSIST_PULL * dt);
}

/* ---------- 업데이트 ---------- */
function markSeen() {
  // 시야가 닿는 주변 칸을 방문 처리. 미니맵 안개가 이걸로 걷힌다.
  const R = 6, cx = p.x | 0, cy = p.y | 0;
  for (let y = Math.max(0, cy - R); y <= Math.min(MAP_H - 1, cy + R); y++)
    for (let x = Math.max(0, cx - R); x <= Math.min(MAP_W - 1, cx + R); x++) {
      const i = y * MAP_W + x;
      if (seenMap[i]) continue;
      if (hasLineOfSight(p.x, p.y, x + 0.5, y + 0.5)) seenMap[i] = 1;
    }
}

function update(dt) {
  if (over) return;

  const w = gun();
  if (w.reloading > 0 && (w.reloading -= dt) <= 0) {
    Object.assign(w, reload(w.mag, w.reserve, w.def.mag));
    w.reloading = 0; hud();
  }
  p.cool -= dt; p.flash -= dt; p.pain -= dt;
  p.shake *= 0.85; p.kick *= 0.82;
  p.pitch *= 0.94;                                    // 반동이 서서히 가라앉음

  if (holding && (w.def.auto || !fired)) { fire(); fired = true; }

  // 이동: W/S 전후진, A/D 좌우 스트레이프, 화살표로도 회전 가능, 터치는 좌측 스틱
  if (keys.ArrowLeft)  p.a -= TURN_SPEED * dt;
  if (keys.ArrowRight) p.a += TURN_SPEED * dt;
  if (keys.ArrowUp)    p.pitch += 200 * dt;
  if (keys.ArrowDown)  p.pitch -= 200 * dt;
  if (st.look.x || st.look.y) {                       // 조준 스틱은 민 만큼 계속 돈다
    p.a += st.look.x * LOOK_TURN * dt;
    p.pitch = clampPitch(p.pitch - st.look.y * LOOK_PITCH * dt);
  }
  const fwd = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0) - st.move.y;
  const str = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0) + st.move.x;
  if (fwd || str) {
    // 대각선이 더 빠르면 안 된다. 스틱을 살짝만 밀었을 때는 그만큼 느리게 (len<1 유지).
    const s = MOVE_SPEED * dt / Math.max(1, Math.hypot(fwd, str));
    const dx = (Math.cos(p.a) * fwd - Math.sin(p.a) * str) * s;
    const dy = (Math.sin(p.a) * fwd + Math.cos(p.a) * str) * s;
    Object.assign(p, tryMove(p.x, p.y, dx, dy));
  }
  aimAssist(dt);
  markSeen();
  for (const it of items) it.t += dt;                  // 까딱이는 위상
  pickUp();

  for (const e of enemies) {
    if (!e.alive) continue;
    e.hurt -= dt; e.cool -= dt;
    const d = Math.hypot(p.x - e.x, p.y - e.y);
    if (!hasLineOfSight(e.x, e.y, p.x, p.y)) continue;   // 안 보이면 가만히
    if (d > 0.6 + e.def.radius) {
      const s = e.def.speed * dt / d;
      Object.assign(e, tryMove(e.x, e.y, (p.x - e.x) * s, (p.y - e.y) * s));
    } else if (e.cool <= 0) {
      e.cool = e.def.cool; p.hp -= e.def.dmg;
      p.pain = 0.25; p.shake = 4 + e.def.dmg * 0.3; hud();
      if (p.hp <= 0) {
        p.hp = 0; over = true;
        holding = false;
        ui('final').textContent = score;
        ui('over').hidden = false;
        document.exitPointerLock();
      }
    }
  }

  if (enemies.every(e => !e.alive)) {                  // 웨이브 클리어
    wave++;
    score += 250;
    p.guns.ak.reserve += 60;
    p.guns.revolver.reserve += 16;
    enemies = Array.from({ length: 2 + wave }, spawnEnemy);
    hud();
  }
}

/* ---------- 렌더 ---------- */
function render() {
  const W = cv.width, H = cv.height;
  const shake = (Math.random() - 0.5) * p.shake;
  const horizon = H / 2 + p.pitch + shake;

  g.fillStyle = '#23252f'; g.fillRect(0, 0, W, Math.max(0, horizon));            // 천장
  g.fillStyle = '#161310'; g.fillRect(0, Math.max(0, horizon), W, H - horizon);  // 바닥

  const F = fov(), D = projDist();
  for (let x = 0; x < W; x++) {
    const a = p.a - F / 2 + F * x / W;
    const { dist, side, wallX, tile } = castRay(p.x, p.y, a);
    const corrected = Math.max(0.05, dist * Math.cos(a - p.a));   // 어안 보정
    depth[x] = corrected;

    const h = D / corrected;
    const top = horizon - h / 2;
    const tex = texFor(tile);
    g.drawImage(tex, (wallX * TEX) | 0, 0, 1, TEX, x, top, 1, h);

    // ponytail: 컬럼마다 반투명 사각형으로 음영을 덮는다. 640컬럼 × 2드로우.
    // 느려지면 음영 단계별 텍스처를 미리 구워두는 쪽으로 올리면 됨.
    const dark = 1 - Math.max(0.1, 1 - corrected / 14) * (side ? 0.7 : 1);
    g.fillStyle = `rgba(0,0,0,${dark.toFixed(3)})`;
    g.fillRect(x, top, 1, h);
  }

  // 적과 떨어진 아이템을 함께 정렬한다. 따로 그리면 앞뒤가 어긋난다.
  const vis = [];
  for (const e of enemies) if (e.alive) vis.push({ e, d: Math.hypot(e.x - p.x, e.y - p.y) });
  for (const it of items) vis.push({ it, d: Math.hypot(it.x - p.x, it.y - p.y) });
  vis.sort((a, b) => b.d - a.d);

  for (const v of vis) {
    const d = v.d;
    const wx = v.e ? v.e.x : v.it.x, wy = v.e ? v.e.y : v.it.y;
    const off = normAngle(Math.atan2(wy - p.y, wx - p.x) - p.a);
    if (Math.abs(off) > F / 2 + 0.4) continue;
    const sx = W / 2 + (off / F) * W;
    const wallH = D / d;                              // 그 거리에서 벽 한 칸 높이
    const dark = Math.min(0.82, 1 - Math.max(0.1, 1 - d / 14));   // 벽과 같은 감쇠

    let tex, shade, sh, top, a = 1;
    if (v.e) {
      const e = v.e;
      tex = ENEMY_TEX[e.def.key]; shade = ENEMY_SHADE[e.def.key];
      sh = wallH * e.def.scale;
      top = horizon + wallH / 2 - sh;                 // 발을 바닥선에 붙인다
      a = e.hurt > 0 ? 0.55 : 1;
    } else {
      tex = ITEM_TEX[v.it.key]; shade = ITEM_SHADE[v.it.key];
      // 발밑까지 오면 화면을 가린다. 작게 두고 바닥에 붙인다.
      sh = wallH * 0.19;
      const bob = Math.sin(v.it.t * 3) * wallH * 0.022;  // 바닥에서 까딱인다
      top = horizon + wallH / 2 - sh - wallH * 0.02 + bob;
    }
    const sw = sh * (tex.width / tex.height);

    // 세로로 잘라 조각마다 깊이를 본다. 통째로 검사하면 벽 모서리에 걸친
    // 큰 몬스터가 벽을 뚫고 통째로 보인다.
    const N = 16, stepX = sw / N, stepU = tex.width / N;
    for (let i = 0; i < N; i++) {
      const x0 = sx - sw / 2 + stepX * i;
      const col = Math.round(x0 + stepX / 2);
      if (col < 0 || col >= W || depth[col] < d) continue;
      g.globalAlpha = a;
      g.drawImage(tex, stepU * i, 0, stepU, tex.height, x0, top, stepX + 0.6, sh);
      g.globalAlpha = a * dark;
      g.drawImage(shade, stepU * i, 0, stepU, shade.height, x0, top, stepX + 0.6, sh);
    }
    g.globalAlpha = 1;

    if (v.e && v.e.def.bar) healthBar(v.e, sx, top, sw);
  }

  if (p.flash > 0) { g.fillStyle = 'rgba(255,220,120,0.28)'; g.fillRect(0, 0, W, H); }
  drawGun(W, H);
  crosshair(W, H);
  if (p.pain > 0) { g.fillStyle = `rgba(180,0,0,${p.pain})`; g.fillRect(0, 0, W, H); }
  minimap(W, H);
}

// 덩치 큰 놈만. 잡몹은 세 방이면 죽어서 바가 보일 새도 없다.
function healthBar(e, sx, top, sw) {
  const w = Math.max(18, sw * 0.62), h = Math.max(3, w * 0.09);
  const x = sx - w / 2, y = top - h - Math.max(4, h);
  g.fillStyle = '#000a'; g.fillRect(x - 1, y - 1, w + 2, h + 2);
  g.fillStyle = '#2a2a30'; g.fillRect(x, y, w, h);
  g.fillStyle = e.def.tint;
  g.fillRect(x, y, w * Math.max(0, e.hp / e.def.hp), h);
}

function crosshair(W, H) {
  g.save();
  g.translate(W / 2, H / 2); g.scale(scale, scale);
  g.strokeStyle = '#e8e8e8'; g.lineWidth = 1;
  g.beginPath();
  g.moveTo(-8, 0); g.lineTo(-3, 0);
  g.moveTo(3, 0); g.lineTo(8, 0);
  g.moveTo(0, -8); g.lineTo(0, -3);
  g.moveTo(0, 3); g.lineTo(0, 8);
  g.stroke();
  g.restore();
}

// 이모지 총(🔫)은 플랫폼에 따라 물총으로 렌더돼서 직접 그린다. 에셋은 여전히 0장.
function drawGun(W, H) {
  const w = gun();
  const sway = w.reloading > 0 ? Math.abs(Math.sin(w.reloading * 12)) * 30 : 0;

  g.save();
  g.translate(W / 2 + W * 0.09, H + (p.kick + sway) * scale);
  g.scale(scale, scale);

  if (p.cur === 'ak') {
    g.fillStyle = '#6b4a2c'; g.fillRect(-12, -46, 26, 46);      // 개머리/그립
    g.fillStyle = '#3a3a41'; g.fillRect(-40, -66, 78, 20);      // 몸통
    g.fillStyle = '#2b2b31'; g.fillRect(-30, -88, 16, 24);      // 탄창
    g.fillStyle = '#26262b'; g.fillRect(-2, -116, 11, 52);      // 총열
    g.fillStyle = '#6b4a2c'; g.fillRect(-16, -74, 22, 8);       // 핸드가드
  } else {
    g.fillStyle = '#3b2a1e'; g.fillRect(-14, -44, 27, 44);      // 나무 그립
    g.fillStyle = '#5a5a64'; g.fillRect(-20, -62, 40, 18);      // 프레임
    g.fillStyle = '#70707c'; g.beginPath();                     // 실린더
    g.arc(2, -60, 11, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#26262b'; g.fillRect(-4, -92, 10, 32);       // 총열
  }
  if (p.flash > 0) {
    g.fillStyle = '#ffd766';
    g.beginPath();
    g.arc(3, -(p.cur === 'ak' ? 116 : 92), 16, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

function minimap(W, H) {
  // 칸 크기는 폭·높이 양쪽에 맞춘다. 폭만 보면 납작한 가로 화면에서 세로를 다 잡아먹는다.
  const s = Math.max(2, Math.round(Math.min(W / 128, H / 80)));
  const pad = Math.round(8 * scale) + 2;
  const mw = MAP_W * s, mh = MAP_H * s;
  const ox = W - mw - pad, oy = pad;                // 우측 상단 (하단은 터치 버튼 자리)

  g.globalAlpha = 0.8;
  g.fillStyle = '#05060a';                          // 안개 = 아무것도 안 그린 배경
  g.fillRect(ox - 2, oy - 2, mw + 4, mh + 4);
  g.strokeStyle = '#3a3f4a'; g.lineWidth = 1;
  g.strokeRect(ox - 2.5, oy - 2.5, mw + 5, mh + 5);

  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
    if (!seenMap[y * MAP_W + x]) continue;          // 미방문 지역은 안개 그대로
    const t = MAP[y][x];
    g.fillStyle = t === '#' ? '#8a6a4a' : t === '=' ? '#6d7480' : '#1e2129';
    g.fillRect(ox + x * s, oy + y * s, s - 1, s - 1);
  }
  for (const e of enemies) {                        // 적은 지금 보이는 놈만
    if (!e.alive || !hasLineOfSight(p.x, p.y, e.x, e.y)) continue;
    const r = e.def.key === 'grunt' ? 2 : 3;         // 큰 놈은 점도 크게
    g.fillStyle = e.def.tint;
    g.fillRect(ox + e.x * s - r, oy + e.y * s - r, r * 2, r * 2);
  }
  for (const it of items) {                         // 떨어진 보상
    if (!seenMap[(it.y | 0) * MAP_W + (it.x | 0)]) continue;
    g.fillStyle = ITEMS[it.key].tint;
    g.fillRect(ox + it.x * s - 1.5, oy + it.y * s - 1.5, 3, 3);
  }
  g.fillStyle = '#54ff9f';                          // 플레이어 + 시선 방향
  g.fillRect(ox + p.x * s - 2, oy + p.y * s - 2, 4, 4);
  g.strokeStyle = '#54ff9f';
  g.beginPath();
  g.moveTo(ox + p.x * s, oy + p.y * s);
  g.lineTo(ox + (p.x + Math.cos(p.a) * 2.2) * s, oy + (p.y + Math.sin(p.a) * 2.2) * s);
  g.stroke();
  g.globalAlpha = 1;
}

function hud() {
  const w = gun();
  ui('hp').textContent = p.hp;
  const ratio = Math.max(0, p.hp) / MAX_HP;
  ui('hpbar').firstElementChild.style.width = (ratio * 100).toFixed(1) + '%';
  const level = ratio <= 0.25 ? 'crit' : ratio <= 0.5 ? 'warn' : '';
  ui('hpbar').className = level;
  ui('hp').className = level === 'crit' ? 'crit' : '';
  ui('gun').textContent = w.def.name;
  ui('ammo').textContent = w.reloading > 0 ? '장전 중…' : `${w.mag} / ${w.reserve}`;
  ui('ammo').className = w.mag === 0 ? 'low' : '';
  ui('wave').textContent = wave;
  ui('score').textContent = score;
  ui('b-swap').textContent = p.cur === 'ak' ? '리볼버' : 'AK';
}

/* ---------- 루프 ---------- */
let last = performance.now();
function loop(t) {
  update(Math.min(0.05, (t - last) / 1000));
  last = t;
  render();
  requestAnimationFrame(loop);
}
reset();
requestAnimationFrame(loop);

// 디버그용 핸들 (콘솔에서 상태 확인)
window.GAME = { get p() { return p; }, get enemies() { return enemies; }, get items() { return items; },
                fire, reset, seenMap, st, ENEMY_TEX, ITEM_TEX, pickUp };
})();
