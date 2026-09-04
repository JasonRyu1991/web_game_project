// 픽셀 스프라이트. 전부 PNG 애셋이다 — 격자로 손코딩하던 몬스터·장비·플레이어를 모두 걷어냈다.
// window.ASSET_SRC 는 아티팩트 빌드가 data URI 로 채운다. 비어 있으면 파드에서 파일로 읽는다.

const MOB_KEYS = ['slime', 'rat', 'boar', 'bear', 'unicorn', 'sasquatch', 'zombie', 'veteran', 'senator', 'pooh'];
const FX_KEYS = ['meteor', 'rock', 'slash', 'spark', 'flame', 'flame2', 'ring', 'ember', 'smoke'];
const BG_KEYS = ['day', 'dawn', 'night'];

const GEAR_NAME = {
  weapon: ['구리 검', '철 검', '강철 검', '비취 검', '룬 검', '화염 검', '서리 검', '흑철 검', '황금 검', '성운 검'],
  helmet: ['가죽 두건', '사슬 두건', '철 투구', '십자 투구', '날개 투구', '악마 투구', '마도사 모자', '흑기사 투구', '왕관', '용머리 투구'],
  armor: ['가죽 갑옷', '천 갑옷', '사슬 갑옷', '판금 갑옷', '은기사 갑옷', '붉은 로브', '청 로브', '흑철 갑옷', '신성 갑옷', '용린 갑옷'],
};

// 5·6·7·9·10 등급만 빛난다. 전부 빛나면 등급 차이가 안 보인다.
const WEAPON_GLOW = [null, null, null, null, '#4da3ff', '#ff8a3d', '#8fd4ff', null, '#ffd166', '#c9a0ff'];

/* ---------- 로딩 ---------- */
const _img = {};

function load(key, path) {
  if (typeof Image === 'undefined') return;   // node 에서 require 될 때
  const src = (typeof window !== 'undefined' && window.ASSET_SRC) || {};
  const im = new Image();
  im.src = src[key] || path;
  _img[key] = im;
}

for (const k of MOB_KEYS) load(k, `mob/${k}.png`);
for (const k of FX_KEYS) load('fx_' + k, `fx/${k}.png`);
for (const k of BG_KEYS) load('bg_' + k, `bg/${k}.png`);
load('male', 'char/male.png');
load('female', 'char/female.png');
for (let g = 1; g <= 10; g++) {
  const n = String(g).padStart(2, '0');
  load('weapon' + g, `gear/weapon${n}.png`);
  load('helmet' + g, `gear/helmet${n}.png`);
  load('armor' + g, `gear/armor${n}.png`);
}

// 로딩이 끝나기 전에 그리면 크기가 0 이라 좌표가 어긋난다. 그 프레임은 건너뛴다.
const ready = im => !!im && im.complete && im.naturalWidth > 0;
const sprite = key => {
  const im = _img[key];
  return ready(im) ? { cv: im, w: im.naturalWidth, h: im.naturalHeight } : null;
};

const dims = key => sprite(key) || { w: 1, h: 1 };

/* ---------- 그리기 ---------- */
// 바닥(발밑) 기준으로 그린다. 횡스크롤은 발이 지면에 붙어야 해서 중심 기준이면 계속 어긋난다.
function drawSprite(ctx, key, cx, footY, drawW, drawH, opts = {}) {
  const s = sprite(key);
  if (!s) return;
  const x = cx - drawW / 2, y = footY - drawH;
  ctx.save();
  ctx.imageSmoothingEnabled = false;      // 이게 켜져 있으면 픽셀아트가 뭉갠다
  if (opts.alpha != null) ctx.globalAlpha = opts.alpha;
  // 발끝을 축으로 기울인다. 공격 동작에서 몸이 따라 움직이게 하는 용도다.
  if (opts.tilt) { ctx.translate(cx, footY); ctx.rotate(opts.tilt); ctx.translate(-cx, -footY); }
  // 발끝을 축으로 눌렀다 늘렸다 한다. 정지 그림에 걸음의 탄성을 주는 용도다(몬스터 등).
  if (opts.sx || opts.sy) {
    ctx.translate(cx, footY); ctx.scale(opts.sx || 1, opts.sy || 1); ctx.translate(-cx, -footY);
  }
  if (opts.flip) { ctx.translate(cx * 2, 0); ctx.scale(-1, 1); }
  ctx.drawImage(s.cv, 0, 0, s.w, s.h, x, y, drawW, drawH);
  if (opts.flash) {                        // 피격 실루엣
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = `rgba(255,255,255,${opts.flash})`;
    ctx.fillRect(x, y, drawW, drawH);
  }
  ctx.restore();
}

const helmetSprite = grade => sprite('helmet' + grade);
const weaponSprite = grade => sprite('weapon' + grade);

// 손을 축으로 회전시켜 그린다. angle 은 라디안, 0 이 위로 세운 상태.
// 검 길이는 캐릭터 키(unit*14)에 비례시킨다 — 원본 PNG 가 세로로 길어서 배율을 그대로 쓰면 칼이 사람만 해진다.
function drawWeapon(ctx, grade, handX, handY, angle, unit, flip) {
  const s = weaponSprite(grade);
  if (!s) return;
  const h = unit * 14 * 0.72, w = s.w * (h / s.h);
  const glow = WEAPON_GLOW[grade - 1];
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.translate(handX, handY);
  ctx.rotate(flip ? -angle : angle);
  if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = 10; }
  ctx.drawImage(s.cv, 0, 0, s.w, s.h, -w / 2, -h + h * 0.12, w, h);  // 자루 끝이 손에 오도록
  ctx.restore();
}

// 인벤토리 목록용 아이콘. 이미 로드된 이미지의 주소를 그대로 넘긴다.
const gearThumb = (slot, grade) => {
  const im = _img[slot + grade];
  return im ? im.src : '';
};

if (typeof window !== 'undefined') {
  window.Sprites = { MOB_KEYS, FX_KEYS, BG_KEYS, GEAR_NAME, WEAPON_GLOW,
                     dims, sprite, drawSprite, drawWeapon, helmetSprite, weaponSprite, gearThumb };
}
if (typeof module !== 'undefined' && module.exports) module.exports = { MOB_KEYS, FX_KEYS, BG_KEYS, GEAR_NAME, WEAPON_GLOW };
