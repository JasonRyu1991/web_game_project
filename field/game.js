// 횡스크롤 협력 방치형 — 화면·입력·저장. 수치 판정은 전부 core.js 가 한다.
// 여기 있는 계산은 전부 "예측"이다. 서버가 붙으면 이 파일의 판정은 서버 응답으로 대체된다.

const C = window.Core;
const SP = window.Sprites;

/* ---------- 저장소 ---------- */
// DB 가 있다는 가정. 실제 저장은 채널 파드 → Cloud SQL 로 간다.
// 지금은 localStorage 로 흉내만 내되, 인터페이스를 async 로 맞춰 두어
// 나중에 fetch 로 바꿀 때 호출부를 안 고치게 한다.
// ponytail: localStorage 어댑터. 서버 붙으면 load/save 본문만 fetch 로 교체.
const Store = {
  key: null,                     // 계정마다 다른 칸을 쓴다
  use(id) { this.key = 'field_save_v1:' + id; },
  async load() {
    try { return JSON.parse(localStorage.getItem(this.key)) || null; } catch { return null; }
  },
  async save(data) {
    data.savedAt = Date.now();
    try { localStorage.setItem(this.key, JSON.stringify(data)); } catch {}
  },
};

/* ---------- 월드 ---------- */
const WORLD_W = 2600;          // 맵은 1개. 좌우로만 이어진다.
const GROUND_H = 96;           // 화면 아래에서 지면까지
const SPAWN_MAX = 14;          // 화면 밖 포함 동시 존재 몬스터 수
const SPAWN_EVERY = 1.6;       // 초
const AGGRO = 240;             // 몬스터가 쫓아오기 시작하는 거리
const PX = 3.2;                // 스프라이트 확대 배율 기준
const SWING_T = 0.26;          // 칼 휘두르는 동작 길이(초)
// 베는 동작 2종을 번갈아 쓴다. 한 종류만 있으면 몇 초만 봐도 반복이 눈에 띈다.
// from/to 는 손을 축으로 한 칼 각도(라디안, 0 이 위로 세운 상태).
const SWINGS = [
  { name: '내려베기', from: -1.35, to: 1.45, lunge: 3.5 },
  { name: '올려베기', from: 1.30, to: -1.05, lunge: 2.0 },
];
const REST_ANGLE = -0.5;       // 평상시 칼을 뒤로 세운 각도
const easeOut = t => 1 - Math.pow(1 - t, 3);
const swingAngle = (sw, t) => sw.from + (sw.to - sw.from) * easeOut(C.clamp(t, 0, 1));

const cv = document.getElementById('game');
const ctx = cv.getContext('2d');

const state = {
  t: 0, last: 0, running: false,
  cam: 0,
  save: null,
  me: null,
  players: [],
  monsters: [],
  floats: [],          // 데미지·보상 숫자
  fx: [],              // 스킬 이펙트
  shake: null,
  account: null,
  chat: [],
  channel: { id: 1, kills: 0 },   // kills = 채널 전체 누적 (소환 게이지)
  summonReady: { senator: false, pooh: false },
  seq: 0,
  god: false,
  lastInput: 0,
  toast: null,
  banner: null,
};

const now = () => state.t;
const rnd = (a, b) => a + Math.random() * (b - a);

/* ---------- 플레이어 ---------- */
function makePlayer(name, isMe, level, id) {
  const st = C.playerStats(level, {});
  return {
    // 자기 자신을 'me' 로 두면 클라이언트마다 같은 키가 되어, 서버가 기여도를 합칠 때
    // 여러 사람이 한 사람으로 뭉개진다. 계정 id 를 그대로 쓴다.
    id: id || C.newId(isMe ? 'u' : 'bot'),
    name, isMe, level, exp: 0,
    x: rnd(200, WORLD_W - 200), vx: 0, face: 1,
    hp: st.maxHp, maxHp: st.maxHp,
    atkCd: 0, hurtCd: 0, lastHurt: -99, dead: 0, swing: 0, swingN: 0, sw: SWINGS[0], cds: {},
    equip: { weapon: C.starterWeapon(), helmet: null, armor: null },
    auto: true, bob: Math.random() * 6,
  };
}

function stats(p) {
  return C.playerStats(p.level, p.equip);
}

function refreshMax(p) {
  const st = stats(p);
  const ratio = p.maxHp ? p.hp / p.maxHp : 1;
  p.maxHp = st.maxHp;
  p.hp = Math.min(p.maxHp, Math.round(p.maxHp * ratio));
}

// 채널 안 최고 레벨. 레어/유니크 등장 판정 기준이다 (개인이 아니라 맵 기준).
const channelLevel = () => Math.max(...state.players.map(p => p.level));

/* ---------- 몬스터 ---------- */
function spawnMonster(type) {
  const def = C.MONSTERS[type];
  const boss = def.tier === 'midboss' || def.tier === 'boss';
  // 보스는 화면 한가운데, 잡몹은 플레이어에게서 좀 떨어진 곳에 나온다.
  const x = boss ? C.clamp(state.me.x + rnd(-120, 120), 80, WORLD_W - 80)
                 : C.clamp(state.me.x + (Math.random() < .5 ? -1 : 1) * rnd(320, 900), 60, WORLD_W - 60);
  const m = {
    id: C.newId('mob'), type, def,
    x, vx: 0, face: -1,
    hp: def.hp, maxHp: def.hp,
    w: def.w * (boss ? 1.25 : 1), h: def.h * (boss ? 1.25 : 1),
    flash: 0, dmg: {}, boss,
    tie: type === 'senator' ? (Math.random() < .5 ? 'red' : 'blue') : null,
    wander: rnd(-1, 1),
  };
  state.monsters.push(m);
  if (boss) banner(`${def.name} 등장!`, '#ff6b3d');
  return m;
}

function maintainSpawns(dt) {
  state._spawnT = (state._spawnT || 0) + dt;
  const normal = state.monsters.filter(m => !m.boss).length;
  if (state._spawnT >= SPAWN_EVERY && normal < SPAWN_MAX) {
    state._spawnT = 0;
    spawnMonster(C.pickSpawn(channelLevel()));
  }
}

/* ---------- 전투 ---------- */
function hitMonster(m, p, dmg) {
  m.hp -= dmg;
  m.flash = 0.18;
  m.dmg[p.id] = (m.dmg[p.id] || 0) + dmg;
  float(m.x, dmg, p.isMe ? '#ffd166' : '#9fb3c8', p.isMe ? 15 : 12);
  if (m.hp <= 0) killMonster(m);
}

function killMonster(m) {
  state.monsters = state.monsters.filter(x => x !== m);
  const shares = C.contribution(m.dmg);
  const lv = state.me.level;
  const expPool = C.monsterExp(m.type, lv);
  const goldPool = C.monsterGold(m.type, lv);
  const expCut = C.splitReward(expPool, shares);
  const goldCut = C.splitReward(goldPool, shares);

  state.channel.kills++;
  checkSummon();

  for (const p of state.players) {
    const gain = expCut[p.id];
    if (!gain) continue;
    const res = C.gainExp(p.level, p.exp, gain);
    if (res.gained) {
      const before = C.skillsAt(p.level).length;
      p.level = res.level;
      if (p.isMe) {
        const got = C.skillsAt(p.level).slice(before);
        for (const sk of got) { toast(`스킬 습득 — ${sk.name}: ${sk.desc}`, '#ffd166'); banner(sk.name + ' 습득', '#ffd166'); }
      }
      refreshMax(p);
      p.hp = p.maxHp;
      if (p.isMe) {
        banner(`LEVEL ${p.level}`, '#7dd3a0');
        float(p.x, 'LEVEL UP', '#7dd3a0', 20);
      }
    }
    p.exp = res.exp;
    if (p.isMe) {
      state.save.gold += goldCut[p.id] || 0;
      state.save.kills++;
      state.save.level = p.level; state.save.exp = p.exp;
      float(m.x + 14, '+' + (goldCut[p.id] || 0) + 'G', '#ffd166', 13);
      // 아이템은 기여한 사람에게만 굴린다.
      const it = C.rollItem(m.type, p.level);
      if (it) pickUp(it);
      if (m.boss) state.save.stats.bossKills++;
    }
  }
  persist();
}

function checkSummon() {
  const k = state.channel.kills;
  state.summonReady.senator = k >= C.SUMMON_KILLS.senator;
  state.summonReady.pooh = k >= C.SUMMON_KILLS.pooh;
}

function summon(type) {
  const cost = C.SUMMON_KILLS[type];
  if (state.channel.kills < cost) return;
  if (state.monsters.some(m => m.type === type)) return;   // 중복 소환 방지
  state.channel.kills -= cost;
  checkSummon();
  spawnMonster(type);
  say('시스템', `${C.MONSTERS[type].name}을(를) 소환했다.`);
}

function damagePlayer(p, raw) {
  if (p.dead > 0) return;
  if (p.isMe && state.god) return;
  const dmg = C.mitigate(raw, stats(p).def);
  p.hp -= dmg;
  p.lastHurt = now();
  float(p.x, dmg, '#ff6b6b', p.isMe ? 15 : 12);
  if (p.hp <= 0) {
    p.hp = 0;
    p.dead = C.PLAYER.respawn;
    if (p.isMe) { state.save.stats.deaths++; banner('쓰러졌다', '#ff6b6b'); }
  }
}

/* ---------- 아이템 ---------- */
function pickUp(it) {
  const cur = state.save.equip[it.slot];
  state.save.bag.push(it);
  if (state.save.bag.length > 80) state.save.bag.shift();
  const better = !cur || it.power > cur.power;
  if (better) equip(it);                       // 더 좋으면 자동 착용 (방치형이니까)
  if (!$('bagModal').hidden) renderBag();
  const nm = SP.GEAR_NAME[it.slot][it.grade - 1];
  toast(`${nm} (${it.grade}등급) · ${C.SLOTS[it.slot].label} +${it.power}` + (better ? ' 착용!' : ' 보관'), C.GRADE_TINTS[it.grade - 1]);
}

function equip(it) {
  state.save.equip[it.slot] = it;
  if (!state.save.equip.weapon) {
    state.save.equip.weapon = C.starterWeapon();
    state.save.bag.push(state.save.equip.weapon);
  }
  state.me.equip = state.save.equip;
  refreshMax(state.me);
  renderGear();
  persist();
}

/* ---------- 스킬 ---------- */
// 전부 자동 발동. 쿨타임이 돌고 사거리 안에 대상이 있으면 그때 나간다.
// 대상이 없으면 쿨타임을 소모하지 않는다 — 허공에 쓰고 기다리면 답답하다.
function skillTargets(p, s) {
  const range = C.skillRange(s, p.level);
  if (range === Infinity) return state.monsters.slice();
  if (s.kind === 'line') {
    return state.monsters.filter(m => {
      const d = (m.x - p.x) * p.face;          // 바라보는 쪽만
      return d >= -20 && d <= range;
    });
  }
  return state.monsters.filter(m => Math.abs(m.x - p.x) <= range);
}

function castSkills(p, dt) {
  if (!p.isMe) return;                          // 동료까지 쏘면 화면이 난장판이 된다
  for (const s of C.skillsAt(p.level)) {
    const left = (p.cds[s.key] || 0) - dt;
    if (left > 0) { p.cds[s.key] = left; continue; }
    p.cds[s.key] = 0;
    const targets = skillTargets(p, s);
    if (!targets.length) continue;
    p.cds[s.key] = s.cd;
    fire(p, s, targets);
  }
}

function fire(p, s, targets) {
  const dmg = C.skillDamage(s, stats(p).atk);
  const range = C.skillRange(s, p.level);
  const view = [state.cam, state.cam + state.vw];

  if (s.key === 'qi')      fx({ k: 'qi', x: p.x, dir: p.face, range, life: .45, max: .45 });
  if (s.key === 'rain')    fx({ k: 'rain', x: p.x, r: range, life: 1.0, max: 1.0,
                                drops: Array.from({ length: 16 }, (_, i) => ({
                                  dx: (Math.random() * 2 - 1) * range, d: i * .045, g: 3 + (i % 7) })) });
  if (s.key === 'volcano') fx({ k: 'vol', x: p.x, r: range, life: 1.2, max: 1.2,
                                vents: Array.from({ length: 9 }, (_, i) => ({
                                  dx: (Math.random() * 2 - 1) * range, d: Math.random() * .3 })) });
  if (s.key === 'cleave') { fx({ k: 'cleave', life: .75, max: .75, x: p.x }); shake(9, .5); }
  if (s.key === 'meteor') { fx({ k: 'meteor', life: 2.2, max: 2.2,
                                spots: Array.from({ length: 14 }, (_, i) => ({
                                  x: view[0] + Math.random() * (view[1] - view[0]), d: i * .12 })) });
                            shake(14, 1.6); }

  for (const m of targets) hitMonster(m, p, dmg);
  banner(s.name, '#ffd166');
}

const fx = o => state.fx.push(o);
const shake = (mag, t) => { state.shake = { mag, t, max: t }; };

/* ---------- 연출 ---------- */
function float(x, text, color, size) {
  state.floats.push({ x: x + rnd(-10, 10), y: 0, life: 1, text, color, size: size || 13 });
}
function toast(text, color) { state.toast = { text, color, life: 2.6 }; }
function banner(text, color) { state.banner = { text, color, life: 1.6 }; }

/* ---------- 입력 ---------- */
const keys = {};
// 이동키가 a·d 라서 preventDefault 를 걸면 글자가 씹힌다.
// 채팅창만 예외로 뒀더니 로그인·회원가입 칸에서 'a','d' 를 못 쳤다(=admin 입력 불가).
// 예외를 특정 요소가 아니라 "글자를 입력받는 요소 전부"로 잡아야 같은 버그가 안 난다.
const isTyping = el => !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);

addEventListener('keydown', e => {
  if (isTyping(document.activeElement)) return;
  if (!state.me) return;                       // 로그인 전에는 게임 조작이 없다
  if (['ArrowLeft', 'ArrowRight', 'a', 'd'].includes(e.key)) { keys[e.key] = true; state.lastInput = now(); e.preventDefault(); }
  if (e.key === 'Enter') chatInput.focus();
});
addEventListener('keyup', e => { keys[e.key] = false; });

// 모바일용 좌우 패드. 조작은 이동뿐이라 버튼 2개면 충분하다.
function bindPad(id, key) {
  const el = document.getElementById(id);
  const on = e => { keys[key] = true; state.lastInput = now(); e.preventDefault(); };
  const off = () => { keys[key] = false; };
  el.addEventListener('pointerdown', on);
  el.addEventListener('pointerup', off);
  el.addEventListener('pointerleave', off);
  el.addEventListener('pointercancel', off);
}

/* ---------- 갱신 ---------- */
function update(dt) {
  state.t += dt;

  // 5 초 이상 입력이 없으면 자동 이동으로 전환한다.
  const manual = now() - state.lastInput < C.PLAYER.idleAfter;
  state.me.auto = !manual;

  for (const p of state.players) {
    if (p.dead > 0) {
      p.dead -= dt;
      if (p.dead <= 0) { p.hp = p.maxHp; p.x = rnd(200, WORLD_W - 200); }
      continue;
    }

    // 이동
    let dir = 0;
    if (p.isMe && manual) {
      if (keys.ArrowLeft || keys.a) dir = -1;
      if (keys.ArrowRight || keys.d) dir = 1;
    } else {
      // 자동: 가장 가까운 몬스터 쪽으로 가되 사거리 안에 들면 멈춘다.
      const tgt = nearestMonster(p.x);
      if (tgt) {
        const d = tgt.x - p.x;
        if (Math.abs(d) > C.PLAYER.range * 0.8) dir = Math.sign(d);
      }
    }
    p.x = C.clamp(p.x + dir * C.PLAYER.moveSpeed * dt, 40, WORLD_W - 40);
    if (dir) p.face = dir;
    p.bob += dt * (dir ? 9 : 3);

    // 자동 공격
    p.atkCd -= dt;
    if (p.atkCd <= 0) {
      const tgt = nearestMonster(p.x, C.PLAYER.range);
      if (tgt) {
        p.atkCd = 1 / C.PLAYER.atkSpeed;
        p.face = Math.sign(tgt.x - p.x) || p.face;
        p.swing = SWING_T;
        p.sw = SWINGS[p.swingN++ % SWINGS.length];
        hitMonster(tgt, p, stats(p).atk);
      }
    }

    if (p.swing > 0) p.swing = Math.max(0, p.swing - dt);
    castSkills(p, dt);

    // 회복
    if (now() - p.lastHurt > C.PLAYER.regenDelay && p.hp < p.maxHp) {
      p.hp = Math.min(p.maxHp, p.hp + p.maxHp * C.PLAYER.regenRate * dt);
    }
  }

  // 몬스터
  for (const m of state.monsters) {
    m.flash = Math.max(0, m.flash - dt);
    const tgt = nearestPlayer(m.x);
    let dir = 0;
    if (tgt && Math.abs(tgt.x - m.x) < AGGRO) dir = Math.sign(tgt.x - m.x);
    else { m.wander += rnd(-1, 1) * dt; dir = Math.sign(Math.sin(m.wander)); }
    m.x = C.clamp(m.x + dir * m.def.speed * dt, 30, WORLD_W - 30);
    if (dir) m.face = dir;

    // 접촉 피해
    m.hitCd = (m.hitCd || 0) - dt;
    if (tgt && m.hitCd <= 0 && Math.abs(tgt.x - m.x) < (m.w + 20) / 2) {
      m.hitCd = C.PLAYER.hitCooldown;
      damagePlayer(tgt, m.def.atk);
    }
  }

  maintainSpawns(dt);

  // 연출 수명
  state.fx = state.fx.filter(f => (f.life -= dt) > 0);
  if (state.shake && (state.shake.t -= dt) <= 0) state.shake = null;
  state.floats = state.floats.filter(f => (f.life -= dt * 0.9) > 0);
  state.floats.forEach(f => f.y += dt * 34);
  if (state.toast && (state.toast.life -= dt) <= 0) state.toast = null;
  if (state.banner && (state.banner.life -= dt) <= 0) state.banner = null;

  state.save.stats.playSec += dt;
  state.cam = C.clamp(state.me.x - state.vw / 2, 0, WORLD_W - state.vw);
}

function nearestMonster(x, within) {
  let best = null, bd = Infinity;
  for (const m of state.monsters) {
    const d = Math.abs(m.x - x);
    if (d < bd) { bd = d; best = m; }
  }
  return (within == null || bd <= within) ? best : null;
}
function nearestPlayer(x) {
  let best = null, bd = Infinity;
  for (const p of state.players) {
    if (p.dead > 0) continue;
    const d = Math.abs(p.x - x);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

/* ---------- 렌더 ---------- */
/* ---------- 배경 ---------- */
// 시차 네 겹. 한 장짜리 배경을 통째로 밀면 원경과 근경이 같은 속도로 움직여서
// 아무리 잘 그려도 종이처럼 보인다. 겹마다 속도를 다르게 줘야 숲처럼 읽힌다.
// 겹은 화면 크기가 바뀔 때만 다시 굽는다.
let layers = null, fgTile = null, motes = [];

// 같은 자리에 늘 같은 나무가 서 있어야 한다. Math.random 을 쓰면 리사이즈마다 숲이 바뀐다.
function seeded(seed) {
  let x = seed >>> 0;
  return () => (x = (x * 1664525 + 1013904223) >>> 0) / 4294967296;
}

function layerCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
  return [c, c.getContext('2d')];
}

// 잎 뭉치. 원 하나로 그리면 사탕처럼 보여서 작은 원을 겹쳐 덩어리를 만든다.
function canopy(g, x, y, r, dark, mid, light) {
  const blobs = [[0, 0, 1], [-.62, .16, .74], [.62, .16, .74], [-.3, -.5, .66], [.34, -.46, .62], [0, .42, .7]];
  g.fillStyle = dark;
  for (const [dx, dy, k] of blobs) { g.beginPath(); g.arc(x + dx * r, y + dy * r + r * .07, r * k, 0, 7); g.fill(); }
  g.fillStyle = mid;
  for (const [dx, dy, k] of blobs) { g.beginPath(); g.arc(x + dx * r, y + dy * r - r * .06, r * k * .82, 0, 7); g.fill(); }
  g.fillStyle = light;
  g.beginPath(); g.arc(x - r * .3, y - r * .42, r * .42, 0, 7); g.fill();
  g.beginPath(); g.arc(x + r * .22, y - r * .3, r * .26, 0, 7); g.fill();
}

function ridge(g, w, baseY, amp, step, seed, fill) {
  const r = seeded(seed);
  g.fillStyle = fill;
  g.beginPath(); g.moveTo(0, baseY);
  for (let x = 0; x <= w + step; x += step) {
    const peak = baseY - amp * (0.45 + r() * 0.55);
    g.lineTo(x - step / 2, peak);
    g.lineTo(x, baseY - amp * 0.16 * r());
  }
  g.lineTo(w, baseY); g.lineTo(w, baseY + 400); g.lineTo(0, baseY + 400); g.closePath(); g.fill();
}

function buildLayers(vw, vh) {
  const gy = vh - GROUND_H;

  /* 하늘 — 화면 고정 */
  const [sky, sg] = layerCanvas(vw, vh);
  const grad = sg.createLinearGradient(0, 0, 0, gy);
  grad.addColorStop(0, '#4fa8d8');
  grad.addColorStop(.55, '#8fd0ea');
  grad.addColorStop(1, '#dff0f2');          // 지평선은 옅게 — 대기 원근
  sg.fillStyle = grad; sg.fillRect(0, 0, vw, vh);
  const sun = sg.createRadialGradient(vw * .78, vh * .12, 8, vw * .78, vh * .12, vh * .55);
  sun.addColorStop(0, 'rgba(255,246,214,.85)');
  sun.addColorStop(.35, 'rgba(255,238,190,.22)');
  sun.addColorStop(1, 'rgba(255,238,190,0)');
  sg.fillStyle = sun; sg.fillRect(0, 0, vw, vh);

  const mk = (speed, draw) => {
    const w = WORLD_W * speed + vw + 80;
    const [c, g] = layerCanvas(w, vh);
    draw(g, w, gy);
    return { cv: c, speed };
  };

  /* 원경 — 산맥 두 겹, 안개에 잠긴다 */
  const far = mk(.10, (g, w, gy) => {
    ridge(g, w, gy - 34, 250, 300, 7, '#8fb3c9');
    ridge(g, w, gy - 12, 180, 220, 19, '#7aa0ba');
    const haze = g.createLinearGradient(0, gy - 260, 0, gy);
    haze.addColorStop(0, 'rgba(223,240,242,0)');
    haze.addColorStop(1, 'rgba(223,240,242,.78)');
    g.fillStyle = haze; g.fillRect(0, gy - 260, w, 260);
  });

  /* 중경 — 언덕과 먼 나무 실루엣 */
  const mid = mk(.26, (g, w, gy) => {
    ridge(g, w, gy + 2, 120, 190, 41, '#5f8f66');
    const r = seeded(101);
    for (let x = -40; x < w; x += 34 + r() * 26) {
      const h = 74 + r() * 46;
      g.fillStyle = '#3f6f4c';
      g.fillRect(x, gy - h * .34, 5, h * .34);
      canopy(g, x + 2, gy - h * .48, h * .3, '#3a6b48', '#487a54', '#54885d');
    }
    const haze = g.createLinearGradient(0, gy - 150, 0, gy);
    haze.addColorStop(0, 'rgba(210,234,238,0)');
    haze.addColorStop(1, 'rgba(210,234,238,.42)');
    g.fillStyle = haze; g.fillRect(0, gy - 150, w, 150);
  });

  /* 근경 — 굵은 나무. 여기부터 색이 진해지고 하이라이트가 붙는다 */
  const near = mk(.52, (g, w, gy) => {
    const r = seeded(2027);
    for (let x = -60; x < w; x += 96 + r() * 90) {
      const h = 150 + r() * 120, tw = 12 + r() * 7;
      g.fillStyle = '#4a3524'; g.fillRect(x, gy - h * .42, tw, h * .42);
      g.fillStyle = '#5d452e'; g.fillRect(x, gy - h * .42, tw * .38, h * .42);
      g.fillStyle = '#3a2a1c';
      g.beginPath(); g.ellipse(x + tw / 2, gy, tw * 1.5, 4, 0, 0, 7); g.fill();
      canopy(g, x + tw / 2, gy - h * .62, h * .3, '#255d3a', '#2f7548', '#3f8f58');
    }
  });

  /* 최전경 — 풀숲. 캐릭터 앞에 깔려 깊이를 만든다 */
  const [ft, fg] = layerCanvas(300, 44);
  const fr = seeded(555);
  for (let i = 0; i < 90; i++) {
    const x = fr() * 300, h = 12 + fr() * 26;
    fg.strokeStyle = ['#2c5f31', '#356e38', '#3f7d40'][i % 3];
    fg.lineWidth = 2 + fr() * 2; fg.lineCap = 'round';
    fg.beginPath(); fg.moveTo(x, 44);
    fg.quadraticCurveTo(x + (fr() - .5) * 12, 44 - h * .6, x + (fr() - .5) * 22, 44 - h);
    fg.stroke();
  }
  fgTile = ft;

  // 떠다니는 홀씨 — 정지 화면이 죽어 보이지 않게
  motes = Array.from({ length: 26 }, () => ({
    x: Math.random() * vw, y: Math.random() * (vh - GROUND_H),
    r: .8 + Math.random() * 1.8, s: 4 + Math.random() * 12, p: Math.random() * 7,
  }));

  return { sky, list: [far, mid, near], h: vh };
}

// 지면 — 잔디 띠, 흙, 잔돌. 세로로 층을 나눠야 납작해 보이지 않는다.
function drawGround(gy, w, h) {
  ctx.fillStyle = '#6aa03f'; ctx.fillRect(0, gy - 3, w, 8);
  ctx.fillStyle = '#4f7a35'; ctx.fillRect(0, gy + 5, w, 9);
  ctx.fillStyle = '#3f5a2a'; ctx.fillRect(0, gy + 14, w, 5);
  const soil = ctx.createLinearGradient(0, gy + 19, 0, h);
  soil.addColorStop(0, '#4a3524'); soil.addColorStop(1, '#2e2116');
  ctx.fillStyle = soil; ctx.fillRect(0, gy + 19, w, h - gy);
  // 잔돌은 카메라를 따라 흐르되 월드 좌표에 고정돼야 미끄러져 보이지 않는다
  const r = seeded(88);
  ctx.fillStyle = 'rgba(0,0,0,.22)';
  for (let i = 0; i < 90; i++) {
    const wx = r() * WORLD_W, y = gy + 26 + r() * (h - gy - 30);
    const x = wx - state.cam;
    if (x < -8 || x > w + 8) continue;
    ctx.fillRect(x, y, 2 + r() * 4, 2 + r() * 2);
  }
}

function render() {
  const w = state.vw, h = state.vh, gy = h - GROUND_H;
  if (!layers || layers.h !== h) layers = buildLayers(w, h);

  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(layers.sky, 0, 0);
  for (const L of layers.list) ctx.drawImage(L.cv, -state.cam * L.speed, 0);

  // 홀씨
  ctx.fillStyle = 'rgba(255,255,240,.55)';
  for (const m of motes) {
    const y = m.y + Math.sin(state.t * .6 + m.p) * 9;
    const x = (m.x - state.cam * .3 + state.t * m.s) % (w + 40) - 20;
    ctx.beginPath(); ctx.arc(x, y, m.r, 0, 7); ctx.fill();
  }

  drawGround(gy, w, h);

  ctx.save();
  let sx = 0, sy = 0;
  if (state.shake) {
    const k = state.shake.mag * (state.shake.t / state.shake.max);
    sx = (Math.random() * 2 - 1) * k; sy = (Math.random() * 2 - 1) * k;
  }
  ctx.translate(-state.cam + sx, sy);

  for (const f of state.fx) if (f.k === 'vol') drawFx(f, gy);   // 지면 균열은 몬스터 밑에
  for (const m of state.monsters) drawMonster(m, gy);
  for (const p of state.players) drawPlayer(p, gy);

  for (const f of state.fx) if (f.k !== 'vol') drawFx(f, gy);

  // 떠오르는 숫자
  for (const f of state.floats) {
    ctx.globalAlpha = Math.min(1, f.life);
    ctx.fillStyle = f.color;
    ctx.font = `bold ${f.size}px ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(f.text, f.x, gy - 70 - f.y);
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // 최전경 풀숲 — 캐릭터보다 앞에 깔아 깊이를 만든다
  if (fgTile) {
    const off = -(state.cam * 1.12) % 300;
    for (let x = off - 300; x < w + 300; x += 300) ctx.drawImage(fgTile, x, gy - 26);
  }

  // 비네트 — 가장자리를 눌러 화면 중앙으로 시선을 모은다
  const vig = ctx.createRadialGradient(w / 2, h * .45, h * .35, w / 2, h * .45, h * .95);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(6,12,6,.34)');
  ctx.fillStyle = vig; ctx.fillRect(0, 0, w, h);

  if (state.banner) {
    ctx.globalAlpha = Math.min(1, state.banner.life);
    ctx.fillStyle = state.banner.color;
    ctx.font = 'bold 34px ui-sans-serif, system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(state.banner.text, w / 2, 88);
    ctx.globalAlpha = 1;
  }
}

function drawPlayer(p, gy) {
  if (p.dead > 0) return;
  // 격자가 22x28 로 커졌다. 화면상 키(dh)는 그대로 두고 한 칸 크기를 역산해야 픽셀이 정사각형으로 남는다.
  const d = SP.dims('player');
  const dh = 14 * PX;
  const unit = dh / d.h;
  const dw = d.w * unit;
  const wUnit = dh / 14;                 // 무기는 예전 배율을 유지한다 (칼이 너무 작아 보이지 않게)
  const hop = Math.abs(Math.sin(p.bob)) * 3;
  const flip = p.face < 0;
  const eq = p.equip || {};
  // 휘두르는 동안 몸이 앞으로 살짝 나간다. 팔만 움직이면 때리는 느낌이 안 난다.
  const sw = p.sw || SWINGS[0];
  const t = p.swing > 0 ? 1 - p.swing / SWING_T : null;
  const lunge = t == null ? 0 : Math.sin(t * Math.PI) * sw.lunge * (flip ? -1 : 1);
  const px = p.x + lunge, foot = gy - hop;

  // 갑옷 = 몸통(b)·트림(B) 색 교체
  const armorPal = eq.armor ? SP.ARMOR_PAL[eq.armor.grade - 1] : undefined;
  SP.drawSprite(ctx, 'player', px, foot, dw, dh, { flip, pal: armorPal });

  // 투구 = 머리 위 덧그리기. 투구 격자는 12칸 기준이라 캐릭터 폭에 맞춰 따로 배율을 잡는다.
  if (eq.helmet) {
    const hs = SP.helmetSprite(eq.helmet.grade);
    const hw = dw * 0.86, hh = hs.h * (hw / hs.w);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    if (flip) { ctx.translate(px * 2, 0); ctx.scale(-1, 1); }
    ctx.drawImage(hs.cv, 0, 0, hs.w, hs.h, px - hw / 2, foot - dh - hh * 0.18, hw, hh);
    ctx.restore();
  }

  // 무기 = 손을 축으로 회전. 평상시는 뒤로 세우고, 때릴 때 베어 낸다.
  const hx = px + (flip ? -1 : 1) * 6.5 * unit;   // 손 위치(격자 좌표 기준)
  const hy = foot - 10.5 * unit;
  const ang = t == null ? REST_ANGLE : swingAngle(sw, t);

  // 궤적은 무기가 없어도 그린다 (맨손이어도 때리는 게 보여야 한다).
  if (t != null) {
    const trail = swingAngle(sw, Math.max(0, t - 0.34));
    slashArc(hx, hy, wUnit, flip, trail, ang, Math.sin(t * Math.PI),
             eq.weapon ? SP.WEAPON_GLOW[eq.weapon.grade - 1] : null, wUnit);
  }
  if (eq.weapon) SP.drawWeapon(ctx, eq.weapon.grade, hx, hy, ang, wUnit, flip);
  // 이름 + 체력
  ctx.textAlign = 'center';
  ctx.font = 'bold 11px ui-sans-serif, system-ui';
  ctx.fillStyle = p.isMe ? '#f2c14e' : '#dfe7ef';
  const lift = p.isMe ? 0 : 15 + (state.players.indexOf(p) % 3) * 13;
  ctx.fillText(`${p.name} Lv.${p.level}`, p.x, gy - dh - 18 - lift);
  bar(p.x - 22, gy - dh - 14 - lift, 44, 5, p.hp / p.maxHp, '#7ac74f');
}

/* ---------- 스킬 이펙트 ---------- */
// 이미지 없이 캔버스 도형만 쓴다. 세련되게 보이는 건 색 수가 아니라
// ① 가산 합성(lighter)으로 빛이 겹칠 것 ② 그라데이션으로 심지-외곽을 나눌 것
// ③ 잔해·불티 같은 작은 입자를 곁들일 것 — 이 셋이다.
const ease = {
  out: t => 1 - Math.pow(1 - t, 3),
  in: t => t * t,
  pop: t => Math.sin(Math.min(1, t) * Math.PI),
};

function glow(fn) {                       // 빛나는 것들은 전부 가산 합성으로
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  fn();
  ctx.restore();
}

function radial(x, y, r, inner, outer) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(1, r));
  g.addColorStop(0, inner);
  g.addColorStop(.45, outer);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  return g;
}

function drawFx(f, gy) {
  const t = 1 - f.life / f.max;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  /* 어검술 — 검기 초승달이 잔상을 끌고 날아간다 */
  if (f.k === 'qi') {
    const y = gy - 48;
    glow(() => {
      for (let i = 5; i >= 0; i--) {
        const tt = Math.max(0, ease.out(t) - i * .055);
        const x = f.x + f.dir * f.range * tt;
        const a = (1 - t) * (1 - i * .17);
        if (a <= 0) continue;
        const r = 30 - i * 1.6;
        ctx.globalAlpha = a * .5;
        ctx.fillStyle = radial(x, y, r * 1.7, 'rgba(180,225,255,.55)', 'rgba(90,170,255,.16)');
        ctx.fillRect(x - r * 1.7, y - r * 1.7, r * 3.4, r * 3.4);
        // 초승달: 바깥 호를 그리고 안쪽 호로 파낸다
        ctx.globalAlpha = a;
        ctx.strokeStyle = i ? 'rgba(150,210,255,.9)' : '#ffffff';
        ctx.lineWidth = (9 - i) * .9;
        const a0 = -1.15, a1 = 1.15;
        ctx.beginPath();
        ctx.arc(x, y, r, f.dir > 0 ? a0 : Math.PI - a1, f.dir > 0 ? a1 : Math.PI + a1, f.dir < 0);
        ctx.stroke();
      }
      // 앞끝 불티
      const hx = f.x + f.dir * f.range * ease.out(t);
      ctx.globalAlpha = 1 - t;
      ctx.fillStyle = '#dff2ff';
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * 7 + t * 9;
        ctx.fillRect(hx + Math.cos(a) * 22 - 1, y + Math.sin(a) * 26 - 1, 2.5, 2.5);
      }
    });
  }

  /* 만검강림 — 진짜 무기 스프라이트가 꽂힌다 */
  if (f.k === 'rain') {
    for (const d of f.drops) {
      const tt = (t - d.d) / (1 - d.d);
      if (tt <= 0) continue;
      const x = f.x + d.dx;
      const k = Math.min(1, tt / .55);
      const y = gy - 330 * (1 - ease.in(k));
      if (k < 1) {
        const sp = SP.weaponSprite(d.g);
        const u = 2.4, w = sp.w * u, h = sp.h * u;
        glow(() => {                        // 낙하 잔상
          ctx.globalAlpha = .5;
          ctx.strokeStyle = 'rgba(255,220,150,.7)'; ctx.lineWidth = 4;
          ctx.beginPath(); ctx.moveTo(x, y - h - 70); ctx.lineTo(x, y - h * .4); ctx.stroke();
        });
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        ctx.translate(x, y);
        ctx.rotate(Math.PI);                // 날이 아래를 향하게
        ctx.drawImage(sp.cv, 0, 0, sp.w, sp.h, -w / 2, 0, w, h);
        ctx.restore();
      } else {
        const e = (tt - .55) / .45;
        glow(() => {
          ctx.globalAlpha = 1 - e;
          ctx.fillStyle = radial(x, gy, 46, 'rgba(255,230,160,.75)', 'rgba(255,160,60,.25)');
          ctx.fillRect(x - 46, gy - 46, 92, 92);
          ctx.strokeStyle = '#ffe9b0'; ctx.lineWidth = 3 * (1 - e);
          ctx.beginPath(); ctx.ellipse(x, gy + 2, 14 + 54 * e, (14 + 54 * e) * .3, 0, 0, 7); ctx.stroke();
        });
        ctx.globalAlpha = (1 - e) * .8;     // 꽂힌 채로 남는 칼자루
        ctx.fillStyle = '#c9a86a';
        ctx.fillRect(x - 2, gy - 20, 4, 20);
      }
    }
  }

  /* 화산검 — 균열이 벌어지고 용암 기둥이 솟는다 */
  if (f.k === 'vol') {
    const open = Math.min(1, t * 2.4);
    // 균열 바닥 발광
    glow(() => {
      ctx.globalAlpha = ease.pop(t) * .9;
      ctx.fillStyle = radial(f.x, gy, f.r * open, 'rgba(255,150,60,.5)', 'rgba(200,50,20,.18)');
      ctx.fillRect(f.x - f.r, gy - f.r * .6, f.r * 2, f.r * 1.2);
    });
    ctx.globalAlpha = Math.min(1, (1 - t) * 1.8);
    ctx.strokeStyle = '#3a1a10'; ctx.lineWidth = 6;
    ctx.beginPath();
    for (let i = -6; i <= 6; i++) {
      const x = f.x + f.r * (i / 6) * open;
      i === -6 ? ctx.moveTo(x, gy + 4) : ctx.lineTo(x, gy + 4 + (i % 2 ? 5 : -5));
    }
    ctx.stroke();
    ctx.strokeStyle = '#ff7a2e'; ctx.lineWidth = 2.5; ctx.stroke();

    for (const v of f.vents) {
      const tt = (t - v.d) / (1 - v.d);
      if (tt <= 0) continue;
      const x = f.x + v.dx, h = 150 * ease.pop(Math.min(1, tt));
      glow(() => {
        const g = ctx.createLinearGradient(0, gy, 0, gy - h);
        g.addColorStop(0, 'rgba(255,255,220,.95)');
        g.addColorStop(.28, 'rgba(255,190,80,.85)');
        g.addColorStop(.68, 'rgba(240,90,40,.5)');
        g.addColorStop(1, 'rgba(160,30,20,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(x - 16, gy + 3);
        ctx.quadraticCurveTo(x - 5, gy - h * .6, x, gy - h);
        ctx.quadraticCurveTo(x + 5, gy - h * .6, x + 16, gy + 3);
        ctx.fill();
      });
      // 불티와 연기
      for (let i = 0; i < 5; i++) {
        const p = (tt * 1.4 + i * .19) % 1;
        const ey = gy - h * p - 12, ex = x + Math.sin(p * 9 + i) * (10 + p * 22);
        ctx.globalAlpha = (1 - p) * (1 - t);
        ctx.fillStyle = p < .5 ? '#ffd166' : '#ff8a3d';
        ctx.fillRect(ex, ey, 3, 3);
      }
      ctx.globalAlpha = (1 - t) * .2;
      ctx.fillStyle = '#6b5040';
      ctx.beginPath(); ctx.arc(x, gy - h - 14, 12 + tt * 20, 0, 7); ctx.fill();
    }
  }

  /* 천지참 — 화면을 가르는 참격. 모으고, 베고, 여파를 남긴다 */
  if (f.k === 'cleave') {
    const L = state.cam, w = state.vw, mid = gy - 96;
    if (t < .28) {                                   // 모으기
      const k = t / .28;
      glow(() => {
        ctx.globalAlpha = k;
        ctx.fillStyle = radial(f.x, gy - 40, 90 * k, 'rgba(255,246,214,.8)', 'rgba(255,190,80,.25)');
        ctx.fillRect(f.x - 90, gy - 130, 180, 180);
      });
      ctx.globalAlpha = k * .45;
      ctx.fillStyle = '#05080a'; ctx.fillRect(L, 0, w, state.vh);
    } else {
      const k = (t - .28) / .72;
      glow(() => {
        for (const [off, col, lw] of [[-7, 'rgba(255,180,90,.55)', 30], [7, 'rgba(120,200,255,.5)', 26], [0, '#ffffff', 16]]) {
          ctx.globalAlpha = (1 - k) * .95;
          ctx.strokeStyle = col;
          ctx.lineWidth = lw * (1 - k * .75) + 3;
          ctx.beginPath();
          ctx.moveTo(L - 60, mid + 150 - 240 * k + off);
          ctx.quadraticCurveTo(L + w / 2, mid - 130 + off, L + w + 60, mid + 150 - 240 * k + off);
          ctx.stroke();
        }
        for (let i = 0; i < 5; i++) {              // 여파 선
          ctx.globalAlpha = (1 - k) * .3;
          ctx.strokeStyle = '#ffe9b0'; ctx.lineWidth = 1.5;
          const y = mid - 40 + i * 26 + k * 60;
          ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(L + w, y); ctx.stroke();
        }
      });
      ctx.globalAlpha = (1 - k) * .5;
      ctx.fillStyle = '#fff6d8'; ctx.fillRect(L, 0, w, state.vh);
    }
  }

  /* 유성우 — 떨어지고, 터지고, 그을음이 남는다 */
  if (f.k === 'meteor') {
    for (const sp of f.spots) {
      const d = sp.d / f.max;
      const tt = (t - d) / (1 - d);
      if (tt <= 0) continue;
      if (tt < .58) {
        const k = ease.in(tt / .58);
        const x = sp.x - 240 * (1 - k), y = -80 + (gy + 80) * k;
        glow(() => {
          for (let i = 8; i >= 0; i--) {          // 꼬리: 뒤로 갈수록 작고 흐리게
            const p = i / 8;
            const tx = x - 150 * p, ty = y - 150 * p;
            ctx.globalAlpha = (1 - p) * .55;
            ctx.fillStyle = radial(tx, ty, 20 * (1 - p * .7), 'rgba(255,210,120,.8)', 'rgba(255,110,40,.2)');
            ctx.fillRect(tx - 22, ty - 22, 44, 44);
          }
          ctx.globalAlpha = 1;
          ctx.fillStyle = radial(x, y, 26, '#fff6d8', 'rgba(255,140,50,.55)');
          ctx.fillRect(x - 28, y - 28, 56, 56);
        });
        ctx.fillStyle = '#3a2418';                 // 운석 알맹이
        ctx.beginPath(); ctx.arc(x, y, 7, 0, 7); ctx.fill();
      } else {
        const k = (tt - .58) / .42;
        glow(() => {
          ctx.globalAlpha = 1 - k;
          const r = 24 + 110 * ease.out(k);
          ctx.fillStyle = radial(sp.x, gy - 10, r, 'rgba(255,246,214,.9)', 'rgba(255,120,40,.35)');
          ctx.fillRect(sp.x - r, gy - 10 - r, r * 2, r * 2);
          ctx.strokeStyle = '#ffd9a0'; ctx.lineWidth = 5 * (1 - k);
          ctx.beginPath(); ctx.ellipse(sp.x, gy + 2, 30 + 150 * k, (30 + 150 * k) * .28, 0, 0, 7); ctx.stroke();
        });
        for (let i = 0; i < 8; i++) {              // 튀는 파편
          const a = (i / 8) * Math.PI - Math.PI;
          const dd = k * 90;
          ctx.globalAlpha = (1 - k) * .8;
          ctx.fillStyle = i % 2 ? '#ff9f45' : '#6b5040';
          ctx.fillRect(sp.x + Math.cos(a) * dd, gy + Math.sin(a) * dd * .5 - k * 30, 3, 3);
        }
        ctx.globalAlpha = (1 - k) * .5;            // 그을음
        ctx.fillStyle = '#1e1408';
        ctx.beginPath(); ctx.ellipse(sp.x, gy + 6, 34, 8, 0, 0, 7); ctx.fill();
      }
    }
  }
  ctx.restore();
}

// 베는 궤적. 칼만 돌리면 동작이 안 읽혀서 잔상을 같이 그린다.
// 칼 각도 0 은 "위로 세움"이고 캔버스 각도 0 은 +x 방향이라 -90도 만큼 돌려서 맞춘다.
function slashArc(hx, hy, unit, flip, a0, a1, strength, glow, wUnit) {
  if (strength <= 0.02) return;
  const r = (wUnit || unit) * 7.5, H = Math.PI / 2;
  ctx.save();
  ctx.translate(hx, hy);
  if (flip) ctx.scale(-1, 1);
  ctx.globalAlpha = 0.6 * strength;
  ctx.lineCap = 'round';
  if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = 12; }
  // 바깥쪽 굵은 호 + 안쪽 가는 호. 두 겹이라야 속도감이 난다.
  ctx.strokeStyle = glow || '#ffffff';
  ctx.lineWidth = 3.5;
  ctx.beginPath(); ctx.arc(0, 0, r, a0 - H, a1 - H, a1 < a0); ctx.stroke();
  ctx.globalAlpha = 0.35 * strength;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(0, 0, r * 0.72, a0 - H, a1 - H, a1 < a0); ctx.stroke();
  ctx.restore();
}

function drawMonster(m, gy) {
  // 종마다 격자 비율이 달라서, 높이만 정하고 폭은 원본 비율로 뽑는다.
  const d = SP.dims(m.type);
  const dh = m.h * 1.5, dw = d.w * (dh / d.h);
  const pal = m.tie ? { T: SP.SENATOR_TIES[m.tie] } : null;
  SP.drawSprite(ctx, m.type, m.x, gy, dw, dh, { flip: m.face > 0, pal, flash: m.flash > 0 ? m.flash * 3 : 0 });
  // 몬스터 체력바 — 항상 보이게 (스펙 요구)
  const bw = Math.max(40, dw);
  bar(m.x - bw / 2, gy - dh - 12, bw, m.boss ? 8 : 5, m.hp / m.maxHp, m.boss ? '#ff4d4d' : '#ef7d7d');
  ctx.textAlign = 'center';
  ctx.font = `${m.boss ? 'bold 12' : '10'}px ui-sans-serif, system-ui`;
  ctx.fillStyle = m.boss ? '#ffd166' : '#e8eef5';
  ctx.fillText(`${m.def.name} ${Math.max(0, Math.ceil(m.hp))}`, m.x, gy - dh - 16);
}

function bar(x, y, w, h, ratio, color) {
  ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = '#1b2430'; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color; ctx.fillRect(x, y, w * C.clamp(ratio, 0, 1), h);
}

/* ---------- HUD ---------- */
const $ = id => document.getElementById(id);
function renderHud() {
  const p = state.me, st = stats(p);
  $('hudName').textContent = p.name;
  $('hudLevel').textContent = 'Lv.' + p.level;
  $('hpFill').style.width = (p.hp / p.maxHp * 100) + '%';
  $('hpText').textContent = `${Math.ceil(p.hp)} / ${p.maxHp}`;
  const need = p.level >= C.LEVEL_MAX ? 0 : C.xpToLevel(p.level);
  $('xpFill').style.width = (need ? p.exp / need * 100 : 100) + '%';
  $('xpText').textContent = need ? `${Math.floor(p.exp)} / ${need}` : 'MAX';
  $('hudGold').textContent = state.save.gold.toLocaleString();
  $('hudAtk').textContent = st.atk;
  $('hudDef').textContent = st.def;
  $('hudKills').textContent = state.save.kills.toLocaleString();
  $('bagCount').textContent = state.save.bag.length;
  $('hudMode').textContent = p.auto ? '자동' : '수동';
  $('hudMode').className = 'mode ' + (p.auto ? 'auto' : 'manual');

  $('chKills').textContent = state.channel.kills;
  const mt = C.channelMetrics(state.players);
  $('chMembers').textContent = `${mt.active_players} / ${C.CHANNEL_CAP}`;
  gauge('gSenator', state.channel.kills, C.SUMMON_KILLS.senator);
  gauge('gPooh', state.channel.kills, C.SUMMON_KILLS.pooh);
  $('btnSenator').disabled = !state.summonReady.senator;
  $('btnPooh').disabled = !state.summonReady.pooh;

  // 기여도 — 보스가 살아 있을 때만
  const boss = state.monsters.find(m => m.boss);
  const box = $('contrib');
  if (!boss) { box.style.display = 'none'; }
  else {
    box.style.display = 'block';
    const shares = C.contribution(boss.dmg);
    $('contribTitle').textContent = `${boss.def.name} 기여도`;
    $('contribList').innerHTML = state.players.map(pl => {
      const s = Math.round((shares[pl.id] || 0) * 100);
      return `<div class="crow"><span>${pl.name}</span><div class="cbar"><i style="width:${s}%"></i></div><b>${s}%</b></div>`;
    }).join('');
  }

  const t = $('toast');
  if (state.toast) { t.style.display = 'block'; t.textContent = state.toast.text; t.style.borderColor = state.toast.color; }
  else t.style.display = 'none';
}

function gauge(id, cur, max) {
  $(id).style.width = Math.min(100, cur / max * 100) + '%';
}

function renderGear() {
  $('gear').innerHTML = C.SLOT_KEYS.map(k => {
    const it = state.save.equip[k];
    const tint = it ? C.GRADE_TINTS[it.grade - 1] : '#39424f';
    return `<div class="slot${it ? '' : ' empty'}" style="border-color:${tint}">
      <div class="sname">${C.SLOTS[k].name}</div>
      <div class="sval" style="color:${tint}">${it ? SP.GEAR_NAME[k][it.grade - 1] : '없음'}</div>
      <div class="sstat">${it ? 'T' + it.grade + ' · ' + C.SLOTS[k].label + ' +' + it.power : '-'}</div>
    </div>`;
  }).join('');
}

/* ---------- 스킬 바 ---------- */
function renderSkillbar() {
  const owned = C.skillsAt(state.me.level);
  const bar = $('skillbar');
  if (owned.length !== bar.childElementCount) {
    bar.innerHTML = owned.map(s =>
      `<div class="sk" data-k="${s.key}" title="${s.name} — ${s.desc}">
         <div class="skn">${s.name}</div><div class="cool"></div><div class="cds"></div>
       </div>`).join('');
  }
  for (const s of owned) {
    const el = bar.querySelector(`[data-k="${s.key}"]`);
    if (!el) continue;
    const left = state.me.cds[s.key] || 0;
    el.querySelector('.cool').style.height = (left / s.cd * 100) + '%';
    el.querySelector('.cds').textContent = left > 0 ? Math.ceil(left) : '';
    el.querySelector('.skn').style.opacity = left > 0 ? .28 : 1;   // 숫자와 글자가 겹쳐 읽히던 것
    el.classList.toggle('ready', left <= 0);
  }
}

/* ---------- 메뉴 ---------- */
function renderMenu() {
  const acc = state.account, sv = state.save, isAdmin = acc.role === 'admin';
  $('menuWho').textContent = `${sv.name} · ${acc.id}${isAdmin ? ' · 관리자' : ''}`;
  const dur = sec => `${Math.floor(sec / 3600)}시간 ${Math.floor(sec % 3600 / 60)}분`;

  const info = `<div class="msec"><h5>캐릭터</h5>
    <div class="kv"><span>이름</span><b>${sv.name}</b></div>
    <div class="kv"><span>레벨</span><b>${sv.level} / ${C.LEVEL_MAX}</b></div>
    <div class="kv"><span>누적 처치</span><b>${sv.kills.toLocaleString()}</b></div>
    <div class="kv"><span>보스 처치</span><b>${sv.stats.bossKills}</b></div>
    <div class="kv"><span>사망</span><b>${sv.stats.deaths}</b></div>
    <div class="kv"><span>플레이 시간</span><b>${dur(sv.stats.playSec)}</b></div>
    <div class="kv"><span>골드</span><b>${sv.gold.toLocaleString()}</b></div></div>`;

  const skills = `<div class="msec"><h5>스킬</h5>${C.SKILLS.map(s => {
    const on = sv.level >= s.lv;
    const r = Math.round(C.skillRange(s, sv.level));
    const range = s.kind === 'map' ? '맵 전체' : s.kind === 'line' ? `전방 ${r}` : `반경 ${r}`;
    return `<div class="skrow${on ? '' : ' locked'}">
      <span class="lv">Lv.${s.lv}</span><span class="nm">${s.name}</span>
      <span class="st">${on ? `쿨 ${s.cd}초 · ${range}` : '미습득'}</span></div>`;
  }).join('')}</div>`;

  const admin = isAdmin ? `<div class="msec"><h5>관리자 — 레벨</h5>
      <div class="lvctl">
        <button data-lv="-10">−10</button><button data-lv="-1">−1</button>
        <div class="lvnow">${sv.level}<small>현재 레벨</small></div>
        <button data-lv="1">+1</button><button data-lv="10">+10</button>
      </div>
      <div class="btnrow">${[1, 20, 40, 60, 80, 100].map(n =>
        `<button data-lvset="${n}">${n === 1 ? '처음' : 'Lv.' + n}</button>`).join('')}</div>
      <div class="bempty">바로가기는 스킬이 열리는 레벨이다</div></div>

    <div class="msec"><h5>관리자 — 처치 수</h5>
      <div class="kv"><span>채널 누적 (소환 게이지)</span><b>${state.channel.kills}</b></div>
      <div class="btnrow">
        <button data-ck="100">채널 +100</button><button data-ck="300">채널 +300</button>
        <button data-ck="1000">채널 +1000</button><button data-ck="reset">채널 0</button>
      </div>
      <div class="kv" style="margin-top:8px"><span>개인 누적</span><b>${sv.kills.toLocaleString()}</b></div>
      <div class="btnrow">
        <button data-pk="100">개인 +100</button><button data-pk="1000">개인 +1000</button>
        <button data-pk="reset">개인 0</button>
      </div></div>

    <div class="msec"><h5>관리자 — 장비 · 재화</h5>
      <div class="kv"><span>가방</span><b>${sv.bag.length}종</b></div>
      <div class="btnrow">
        <button id="admGear">전 등급 장비 지급</button>
        <button id="admGold">골드 +10만</button>
        <button id="admBagClear">가방 비우기</button>
      </div></div>

    <div class="msec"><h5>관리자 — 몬스터 소환</h5>
      <div class="btnrow">${C.MONSTER_KEYS.map(k =>
        `<button data-mob="${k}">${C.MONSTERS[k].name}</button>`).join('')}</div>
      <div class="btnrow" style="margin-top:6px">
        <button id="admClear">필드 정리</button>
      </div></div>

    <div class="msec"><h5>관리자 — 상태</h5>
      <div class="btnrow">
        <button id="admGod">무적 ${state.god ? '끄기' : '켜기'}</button>
        <button id="admCool">스킬 쿨 초기화</button>
        <button id="admHeal">체력 회복</button>
      </div>
      <div class="btnrow" style="margin-top:6px">
        <button id="admAdd">동료 추가</button>
        <button id="admDrop">동료 내보내기</button>
      </div></div>

    <div class="msec"><h5>접속자 현황</h5>
      <table class="roster"><tr><th>캐릭터</th><th>계정</th><th>권한</th><th>레벨</th><th>처치</th></tr>
      ${Auth.roster().map(r => `<tr>
        <td class="${r.id === acc.id ? 'me' : ''}">${r.name}</td><td>${r.id}</td><td>${r.role}</td>
        <td>${r.level || '-'}</td><td>${(r.kills || 0).toLocaleString()}</td></tr>`).join('')}</table>
      <div class="kv" style="margin-top:8px"><span>이 채널 접속자</span><b>${state.players.length} / ${C.CHANNEL_CAP}</b></div>
      ${state.players.map(pl => `<div class="kv"><span>${pl.name}</span><b>Lv.${pl.level}</b></div>`).join('')}
    </div>` : '';

  const acts = `<div class="msec"><h5>계정</h5>
    <div class="kv"><span>캐릭터 이름</span><b>${sv.name}</b></div>
    <div class="kv"><span>아이디</span><b>${acc.id}</b></div>
    <div class="kv"><span>가입</span><b>${new Date(acc.createdAt).toLocaleDateString('ko-KR')}</b></div>
    <div class="btnrow" style="margin-top:9px">
      <button id="mLogout">로그아웃</button>
      <button id="mReset" class="danger">진행도 초기화</button>
      ${isAdmin ? '' : '<button id="mDelete" class="danger">캐릭터 삭제</button>'}
    </div>
    ${isAdmin ? '<div class="bempty">관리 계정은 삭제할 수 없다</div>' : ''}</div>`;

  $('menuBody').innerHTML = info + skills + admin + acts;

  $('menuBody').querySelectorAll('[data-lv]').forEach(b =>
    b.onclick = () => setLevel(state.me.level + Number(b.dataset.lv)));
  $('menuBody').querySelectorAll('[data-lvset]').forEach(b =>
    b.onclick = () => setLevel(Number(b.dataset.lvset)));
  bindAdmin();

  $('menuBody').querySelector('#mLogout').onclick = () => { persist(); Auth.logout(); location.reload(); };
  $('menuBody').querySelector('#mReset').onclick = () => {
    if (!confirm('이 캐릭터의 진행도를 지운다. 계정은 남는다.')) return;
    localStorage.removeItem(Store.key); location.reload();
  };
  const d = $('menuBody').querySelector('#mDelete');
  if (d) d.onclick = () => {
    if (!confirm(`계정 ${acc.id} 과 캐릭터를 함께 지운다. 되돌릴 수 없다.`)) return;
    Auth.remove(acc.id); location.reload();
  };
}

function bindAdmin() {
  const q = sel => $('menuBody').querySelector(sel);
  const each = (sel, fn) => $('menuBody').querySelectorAll(sel).forEach(fn);
  const after = () => { persist(); renderMenu(); };

  each('[data-ck]', b => b.onclick = () => {
    state.channel.kills = b.dataset.ck === 'reset' ? 0 : state.channel.kills + Number(b.dataset.ck);
    checkSummon(); after();
  });
  each('[data-pk]', b => b.onclick = () => {
    state.save.kills = b.dataset.pk === 'reset' ? 0 : state.save.kills + Number(b.dataset.pk);
    after();
  });
  each('[data-mob]', b => b.onclick = () => { spawnMonster(b.dataset.mob); menuOpen(false); });

  const on = (sel, fn) => { const el = q(sel); if (el) el.onclick = fn; };
  on('#admGear', () => {
    grantAllGear(true);
    toast(`전 등급 장비 ${C.SLOT_KEYS.length * C.GRADE_MAX}종을 넣었다`, '#ff2e63');
    after(); if (!$('bagModal').hidden) renderBag();
  });
  on('#admGold', () => { state.save.gold += 100000; after(); });
  on('#admBagClear', () => { state.save.bag = []; after(); if (!$('bagModal').hidden) renderBag(); });
  on('#admClear', () => { state.monsters = []; after(); });
  on('#admGod', () => { state.god = !state.god; toast(state.god ? '무적' : '무적 해제', '#ff2e63'); after(); });
  on('#admCool', () => { state.me.cds = {}; renderSkillbar(); });
  on('#admHeal', () => { state.me.hp = state.me.maxHp; state.me.dead = 0; });
  on('#admAdd', () => {
    if (state.players.length >= C.CHANNEL_CAP) { toast('채널 정원이 찼다', '#ff2e63'); return; }
    state.players.push(makePlayer('동료' + state.players.length, false, state.me.level, 'bot_' + state.seq++));
    after();
  });
  on('#admDrop', () => {
    const i = state.players.findIndex(p => !p.isMe);
    if (i >= 0) state.players.splice(i, 1);
    after();
  });
}

// 종류 3 × 등급 10 = 30개. 등급별 생김새를 한자리에서 비교하려는 용도다.
function grantAllGear(equipBest) {
  for (const slot of C.SLOT_KEYS) {
    for (let grade = 1; grade <= C.GRADE_MAX; grade++) {
      const it = { id: `adm_${slot}_${grade}`, slot, grade,
                   power: C.itemPower(slot, grade), name: SP.GEAR_NAME[slot][grade - 1] };
      if (!state.save.bag.some(x => x.id === it.id)) state.save.bag.push(it);
      if (equipBest && grade === C.GRADE_MAX) equip(it);
    }
  }
}

function setLevel(n) {
  const lv = C.clamp(Math.round(n), 1, C.LEVEL_MAX);
  state.me.level = lv; state.me.exp = 0;
  state.save.level = lv; state.save.exp = 0;
  refreshMax(state.me); state.me.hp = state.me.maxHp;
  persist(); renderMenu(); renderSkillbar();
  banner('Lv.' + lv, '#ff2e63');
}

function menuOpen(v) { $('menuModal').hidden = !v; if (v) renderMenu(); }

/* ---------- 가방 ---------- */
// 획득한 장비의 스펙을 보고 직접 갈아 끼우는 곳.
// 자동 착용은 "더 세면 바로" 규칙이라, 방어력 대신 공격력을 몰아주는 식의 선택은 여기서 한다.
function renderBag() {
  const body = $('bagBody');
  body.innerHTML = C.SLOT_KEYS.map(slot => {
    const cur = state.save.equip[slot];
    const list = state.save.bag
      .filter(i => i.slot === slot)
      .sort((a, b) => b.power - a.power);
    if (cur && !list.some(i => i.id === cur.id)) list.unshift(cur);

    const rows = list.length ? list.map(it => {
      const on = cur && it.id === cur.id;
      const diff = it.power - (cur ? cur.power : 0);
      const tint = C.GRADE_TINTS[it.grade - 1];
      const tag = on ? '<span class="eqd">착용중</span>'
        : `<span class="bdelta ${diff > 0 ? 'up' : diff < 0 ? 'down' : ''}">${diff > 0 ? '+' : ''}${diff}</span>`;
      return `<div class="bitem${on ? ' on' : ''}" style="border-left-color:${tint}" data-id="${it.id}">
        <img class="bimg" alt="" src="${SP.gearThumb(slot, it.grade)}">
        <div class="binfo">
          <div class="bname" style="color:${tint}">${SP.GEAR_NAME[slot][it.grade - 1]}</div>
          <div class="bspec">T${it.grade} · ${C.SLOTS[slot].label} +${it.power}</div>
        </div>${tag}
      </div>`;
    }).join('') : '<div class="bempty">아직 없다</div>';

    return `<div class="bsec"><h5>${C.SLOTS[slot].name}</h5>${rows}</div>`;
  }).join('');

  body.querySelectorAll('.bitem:not(.on)').forEach(el => {
    el.onclick = () => {
      const it = state.save.bag.find(i => i.id === el.dataset.id);
      if (it) { equip(it); renderBag(); }
    };
  });
}

function bagOpen(v) {
  $('bagModal').hidden = !v;
  if (v) renderBag();
}

/* ---------- 채팅 ---------- */
const chatInput = $('chatInput');
function say(who, text) {
  state.chat.push({ who, text });
  if (state.chat.length > 60) state.chat.shift();
  const log = $('chatLog');
  log.innerHTML = state.chat.map(m =>
    `<div><b class="${m.who === '시스템' ? 'sys' : ''}">${m.who}</b> ${escapeHtml(m.text)}</div>`).join('');
  log.scrollTop = log.scrollHeight;
}
const escapeHtml = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

chatInput.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  const v = chatInput.value.trim();
  if (v) say(state.me.name, v);          // 서버 붙으면 여기서 WS 로 채널 전체에 방송한다
  chatInput.value = '';
  chatInput.blur();
});

/* ---------- 저장 ---------- */
let saveT = 0;
function persist() { saveT = 0; Store.save(state.save); }

/* ---------- 루프 ---------- */
function frame(ts) {
  if (!state.last) state.last = ts;
  const dt = Math.min(0.05, (ts - state.last) / 1000);
  state.last = ts;
  update(dt);
  render();
  renderHud();
  renderSkillbar();
  saveT += dt;
  if (saveT > 5) persist();
  requestAnimationFrame(frame);
}

function fit() {
  // CSS 픽셀과 캔버스 픽셀을 1:1 로 두면 레티나에서 이름·체력 숫자가 뭉갠다.
  // 버퍼만 DPR 배로 키우고 좌표계는 논리 픽셀로 유지한다 (스프라이트 배율은 그대로).
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  state.vw = cv.clientWidth;
  state.vh = cv.clientHeight;
  cv.width = Math.round(state.vw * dpr);
  cv.height = Math.round(state.vh * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  layers = null;
}

/* ---------- 로그인 ---------- */
// 로그인과 회원가입은 화면을 따로 쓴다. 한 화면에서 입력칸이 늘었다 줄었다 하면
// 브라우저 자동완성이 엉키고, 회원가입에만 있는 캐릭터 이름이 어디 붙는지도 안 보인다.
function showPanel(which) {
  $('panelLogin').hidden = which !== 'login';
  $('panelSignup').hidden = which !== 'signup';
  $('liErr').textContent = '';
  $('suErr').textContent = '';
  ($(which === 'login' ? 'liId' : 'suName')).focus();
}

async function submitLogin() {
  const r = await Auth.login($('liId').value, $('liPw').value);
  if (r.err) { $('liErr').textContent = r.err; return; }
  startGame(Auth.current());
}

async function submitSignup() {
  const name = $('suName').value, id = $('suId').value, pw = $('suPw').value;
  const r = await Auth.signup(name, id, pw);
  if (r.err) { $('suErr').textContent = r.err; return; }
  await Auth.login(id, pw);          // 가입 직후 또 로그인시키면 번거롭다
  startGame(Auth.current());
}

/* ---------- 부팅 ---------- */
async function boot() {
  await Auth.seed();
  $('liGo').onclick = submitLogin;
  $('suGo').onclick = submitSignup;
  $('goSignup').onclick = () => showPanel('signup');
  $('goLogin').onclick = () => showPanel('login');
  for (const id of ['liId', 'liPw']) $(id).addEventListener('keydown', e => { if (e.key === 'Enter') submitLogin(); });
  for (const id of ['suName', 'suId', 'suPw']) $(id).addEventListener('keydown', e => { if (e.key === 'Enter') submitSignup(); });
  const cur = Auth.current();
  if (cur) startGame(cur); else showPanel('login');
}

async function startGame(acc) {
  state.account = acc;
  Store.use(acc.id);
  $('login').hidden = true;
  $('login').style.display = 'none';
  state.save = (await Store.load()) || C.newSave(acc.name || acc.id);
  if (acc.name && state.save.name !== acc.name) state.save.name = acc.name;
  // 관리 계정은 확인용이라 늘 전 장비를 들고 있어야 한다. 버튼을 눌러야만 생기면 매번 번거롭다.
  state.me = makePlayer(state.save.name, true, state.save.level, acc.id);
  state.me.exp = state.save.exp;
  if (!state.save.equip.weapon) {
    state.save.equip.weapon = C.starterWeapon();
    state.save.bag.push(state.save.equip.weapon);
  }
  state.me.equip = state.save.equip;
  refreshMax(state.me);
  state.me.hp = state.me.maxHp;
  state.players = [state.me];
  if (acc.role === 'admin') grantAllGear(true);

  // 같은 채널의 다른 유저. 서버가 붙으면 이 배열이 WS 로 채워진다.
  // ponytail: 로컬 더미 2명. 기여도·채널 인원 UI 를 지금 검증하려고 둔 것이고, 서버 붙으면 삭제.
  for (const nm of ['동료A', '동료B']) {
    state.players.push(makePlayer(nm, false, Math.max(1, state.save.level + (Math.random() < .5 ? -1 : 1)), 'bot_' + nm));
  }

  fit();
  addEventListener('resize', fit);
  bindPad('padL', 'ArrowLeft');
  bindPad('padR', 'ArrowRight');
  $('btnBag').onclick = () => bagOpen(true);
  $('bagClose').onclick = () => bagOpen(false);
  $('bagModal').onclick = e => { if (e.target.id === 'bagModal') bagOpen(false); };
  addEventListener('keydown', e => { if (e.key === 'Escape' && !isTyping(document.activeElement)) { bagOpen(false); menuOpen(false); } });
  $('btnSenator').onclick = () => summon('senator');
  $('btnPooh').onclick = () => summon('pooh');
  $('btnMenu').onclick = () => menuOpen(true);
  $('menuClose').onclick = () => menuOpen(false);
  $('menuModal').onclick = e => { if (e.target.id === 'menuModal') menuOpen(false); };
  renderGear();
  renderSkillbar();
  checkSummon();
  say('시스템', `${state.save.name} 님, 채널 ${state.channel.id} 입장. 정원 ${C.CHANNEL_CAP}명. 5초간 조작이 없으면 자동 사냥으로 전환된다.`);
  requestAnimationFrame(frame);
}

boot();
