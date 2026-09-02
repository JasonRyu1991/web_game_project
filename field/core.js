// 횡스크롤 협력 방치형 코어 — 수치와 규칙만. DOM 을 모른다.
// 채널 파드(Node)가 그대로 require 해서 권위 계산을 맡을 수 있게 순수 함수로 둔다.
// 클라이언트는 여기 있는 값을 "예측"만 하고, 최종 판정은 서버가 이 파일로 다시 계산한다.

const LEVEL_MAX = 100;
const CHANNEL_CAP = 5;               // 채널당 최대 유저 수 (= 파드 1개 정원)

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ---------- 성장 곡선 ---------- */
// 30 레벨까지는 5분 안에 닿고, 그 뒤로 급격히 어려워진다.
// 두 구간을 다른 식으로 쓰면 경계에서 값이 튄다. 하나의 멱함수에 30 이후로만
// 곱해지는 가중치(XP_HARD)를 얹어 연속성을 지킨다.
const XP_BASE = 8;             // 시뮬레이션으로 잡은 값 — 30 레벨 도달 시간이 여기 달렸다 (약 4.5분)
const XP_POW = 1.35;
const XP_KNEE = 30;            // 이 레벨부터 벽이 선다
const XP_HARD = 1.08;          // 30 이후 레벨당 추가 배수 (100 레벨까지 약 16시간)
const xpToLevel = lv =>
  Math.floor(XP_BASE * Math.pow(lv, XP_POW) * Math.pow(XP_HARD, Math.max(0, lv - XP_KNEE)));

// 몬스터 경험치는 요구치의 5분의 1 속도로만 따라 오른다.
// 벽(XP_HARD)은 일부러 빼고 기본 곡선만 따라간다 — 넣으면 30 이후가 어려워지지 않는다.
// lv^(1.35 × 0.2) = lv^0.27 이라 lv1 에 10 주던 몬스터가 lv2 에 12 (스펙 그대로).
const EXP_CATCHUP = 0.2;
const mobExpMult = lv => Math.pow(lv, XP_POW * EXP_CATCHUP);

/* ---------- 스킬 ---------- */
// 20 레벨마다 하나씩. 전부 자동 발동이고 쿨타임만 다르다.
// base/per 는 사거리(px)와 레벨당 증가폭. kind 'map' 은 사거리 무한(맵 전체).
const SKILLS = [
  { key: 'qi',      lv: 20,  name: '어검술',   desc: '검기를 날려 앞을 관통한다',        cd: 5,  mult: 2.4, kind: 'line', base: 170, per: 5 },
  { key: 'rain',    lv: 40,  name: '만검강림', desc: '무기를 비처럼 떨어뜨린다',          cd: 10, mult: 3.6, kind: 'area', base: 200, per: 6 },
  { key: 'volcano', lv: 60,  name: '화산검',   desc: '검을 꽂아 화산을 터뜨린다',        cd: 15, mult: 6.0, kind: 'area', base: 240, per: 7 },
  { key: 'cleave',  lv: 80,  name: '천지참',   desc: '맵 전체를 가르는 참격',            cd: 20, mult: 9.0, kind: 'map' },
  { key: 'meteor',  lv: 100, name: '유성우',   desc: '맵 전체에 운석을 떨어뜨린다',      cd: 60, mult: 22,  kind: 'map' },
];

const skillsAt = lv => SKILLS.filter(s => lv >= s.lv);
// 사거리는 배운 뒤로도 레벨이 오를수록 넓어진다.
const skillRange = (s, lv) => s.kind === 'map' ? Infinity : s.base + Math.max(0, lv - s.lv) * s.per;
const skillDamage = (s, atk) => Math.max(1, Math.round(atk * s.mult));

/* ---------- 몬스터 ---------- */
// atk 는 접촉 피해다. 1 번(슬라임) → 10 번(푸) 로 갈수록 세진다.
// minLv 는 "맵에 있는 유저 중 최고 레벨" 기준이다. 채널 단위로 판정하므로
// 고렙이 한 명 들어오면 저렙도 레어를 같이 본다 — 협력을 유도하는 쪽이 맞다.
const MONSTERS = {
  slime:     { name: '슬라임',    tier: 'basic',   minLv: 1,  weight: 30, hp: 24,    atk: 4,   exp: 10,    gold: 5,    speed: 22, w: 26, h: 22 },
  rat:       { name: '쥐',        tier: 'basic',   minLv: 1,  weight: 26, hp: 32,    atk: 6,   exp: 13,    gold: 7,    speed: 38, w: 28, h: 18 },
  boar:      { name: '멧돼지',    tier: 'basic',   minLv: 3,  weight: 18, hp: 60,    atk: 11,  exp: 22,    gold: 12,   speed: 44, w: 38, h: 26 },
  bear:      { name: '곰',        tier: 'basic',   minLv: 6,  weight: 12, hp: 120,   atk: 20,  exp: 40,    gold: 22,   speed: 30, w: 40, h: 42 },
  unicorn:   { name: '유니콘',    tier: 'rare',    minLv: 10, weight: 5,  hp: 320,   atk: 34,  exp: 120,   gold: 80,   speed: 52, w: 42, h: 40 },
  sasquatch: { name: '새스쿼치',  tier: 'rare',    minLv: 10, weight: 4,  hp: 460,   atk: 44,  exp: 160,   gold: 105,  speed: 34, w: 42, h: 48 },
  zombie:    { name: '좀비',      tier: 'rare',    minLv: 10, weight: 5,  hp: 380,   atk: 52,  exp: 145,   gold: 95,   speed: 18, w: 30, h: 40 },
  veteran:   { name: '퇴역군인',  tier: 'unique',  minLv: 20, weight: 3,  hp: 1500,  atk: 90,  exp: 600,   gold: 420,  speed: 40, w: 34, h: 42 },
  senator:   { name: '국회의원',  tier: 'midboss', minLv: 1,  weight: 0,  hp: 6000,  atk: 130, exp: 2600,  gold: 1800, speed: 26, w: 34, h: 44 },
  pooh:      { name: '곰돌이 푸', tier: 'boss',    minLv: 1,  weight: 0,  hp: 24000, atk: 190, exp: 11000, gold: 7000, speed: 22, w: 48, h: 50 },
};

// 소환 버튼이 열리는 누적 처치 수. 채널 전체가 같이 채운다 (협력의 이유).
const SUMMON_KILLS = { senator: 100, pooh: 300 };

const MONSTER_KEYS = Object.keys(MONSTERS);

// 자연 스폰 후보. weight 0 인 소환 보스는 빠진다.
function spawnTable(channelLevel) {
  return MONSTER_KEYS.filter(k => MONSTERS[k].weight > 0 && MONSTERS[k].minLv <= channelLevel);
}

function pickSpawn(channelLevel, rng = Math.random) {
  const pool = spawnTable(channelLevel);
  const total = pool.reduce((s, k) => s + MONSTERS[k].weight, 0);
  let r = rng() * total;
  for (const k of pool) if ((r -= MONSTERS[k].weight) < 0) return k;
  return pool[0];
}

const monsterExp  = (type, lv) => Math.max(1, Math.round(MONSTERS[type].exp  * mobExpMult(lv)));
const monsterGold = (type, lv) => Math.max(1, Math.round(MONSTERS[type].gold * mobExpMult(lv)));

/* ---------- 장비 ---------- */
// 무기는 공격력, 투구·갑옷은 방어력. 슬롯당 1~10 등급.
const SLOTS = {
  weapon: { key: 'weapon', name: '무기', stat: 'atk', label: '공격력' },
  helmet: { key: 'helmet', name: '투구', stat: 'def', label: '방어력' },
  armor:  { key: 'armor',  name: '갑옷', stat: 'def', label: '방어력' },
};
const SLOT_KEYS = Object.keys(SLOTS);

const GRADE_MAX = 10;
const GRADE_NAMES = ['조악한', '낡은', '평범한', '쓸만한', '정교한', '희귀한', '영웅의', '전설의', '신화의', '초월의'];
const GRADE_TINTS = ['#8b949e', '#a1a1aa', '#7dd3a0', '#4da3ff', '#7c8cff', '#c86bff', '#ff7ab8', '#ffb02e', '#ff6b3d', '#ff2e63'];

const SLOT_BASE = { weapon: 5, helmet: 3, armor: 4 };
const GRADE_GROWTH = 1.55;           // 등급당 1.55배. 10등급이 1등급의 약 46배.
const itemPower = (slot, grade) =>
  Math.round(SLOT_BASE[slot] * Math.pow(GRADE_GROWTH, clamp(grade, 1, GRADE_MAX) - 1));

// 몬스터 등급이 높을수록 좋은 게 나오고, 유저 레벨이 20 오를 때마다 바닥이 한 칸 오른다.
const TIER_GRADE = { basic: [1, 3], rare: [3, 6], unique: [5, 8], midboss: [6, 9], boss: [8, 10] };
const TIER_DROP  = { basic: 0.10, rare: 0.30, unique: 0.75, midboss: 1, boss: 1 };

function rollItem(monsterType, playerLv, rng = Math.random) {
  const tier = MONSTERS[monsterType].tier;
  if (rng() > TIER_DROP[tier]) return null;
  const [lo, hi] = TIER_GRADE[tier];
  const bonus = Math.floor(playerLv / 20);
  const grade = clamp(lo + Math.floor(rng() * (hi - lo + 1)) + bonus, 1, GRADE_MAX);
  const slot = SLOT_KEYS[Math.floor(rng() * SLOT_KEYS.length)];
  return {
    id: newId('it'),
    slot, grade,
    power: itemPower(slot, grade),
    name: `${GRADE_NAMES[grade - 1]} ${SLOTS[slot].name}`,
  };
}

/* ---------- 전투 ---------- */
const PLAYER = {
  baseHp: 60, hpPerLv: 14,
  baseAtk: 6, atkPerLv: 1.8,
  atkSpeed: 1.5,        // 초당 공격 횟수
  range: 52,            // 자동 공격 사거리(px)
  moveSpeed: 118,       // px/s
  idleAfter: 5,         // 이만큼(초) 입력이 없으면 자동 이동으로 전환
  regenDelay: 3,        // 피격 후 이만큼 지나면 회복 시작
  regenRate: 0.02,      // 초당 최대 체력의 2%
  respawn: 3,           // 사망 후 부활까지(초)
  hitCooldown: 1,       // 같은 몬스터에게 연속으로 맞는 최소 간격(초)
};

function playerStats(lv, equip = {}) {
  const p = s => (equip[s] ? itemPower(s, equip[s].grade) : 0);
  const atk = Math.round(PLAYER.baseAtk + lv * PLAYER.atkPerLv + p('weapon'));
  return {
    maxHp: Math.round(PLAYER.baseHp + lv * PLAYER.hpPerLv),
    atk,
    def: p('helmet') + p('armor'),
    dps: Math.round(atk * PLAYER.atkSpeed),
  };
}

// 방어력은 감산이 아니라 비율 경감이다. 감산이면 방어력이 몬스터 공격력을 넘는 순간
// 무적이 되어 곡선이 통째로 무너진다.
const mitigate = (raw, def) => Math.max(1, Math.round(raw * 100 / (100 + def)));

/* ---------- 기여도 ---------- */
// 보스 한 마리에 넣은 피해 비율로 보상을 나눈다. 한 명이어도 그대로 성립한다.
function contribution(damageByPlayer) {
  const total = Object.values(damageByPlayer).reduce((s, v) => s + v, 0);
  const out = {};
  for (const [id, dmg] of Object.entries(damageByPlayer)) out[id] = total ? dmg / total : 0;
  return out;
}

// 기여 지분만큼 나누되, 한 대라도 때렸으면 최소 5% 는 보장한다 (막타 독식 방지).
function splitReward(total, shares) {
  const out = {};
  for (const [id, share] of Object.entries(shares)) {
    out[id] = Math.max(1, Math.round(total * Math.max(share, 0.05)));
  }
  return out;
}

/* ---------- 레벨업 ---------- */
// 남는 경험치를 이월하며 여러 레벨이 한 번에 오를 수 있다.
function gainExp(lv, exp, amount) {
  let level = lv, xp = exp + amount, gained = 0;
  while (level < LEVEL_MAX && xp >= xpToLevel(level)) {
    xp -= xpToLevel(level);
    level++; gained++;
  }
  if (level >= LEVEL_MAX) xp = 0;
  return { level, exp: xp, gained };
}

// 맨손이면 공격 모션이 안 보인다. 1등급 무기를 쥐어 주고 시작한다.
const starterWeapon = () => ({
  id: 'starter', slot: 'weapon', grade: 1,
  power: itemPower('weapon', 1), name: '구리 검',
});

/* ---------- 채널 이관 ---------- */
// 이 프로젝트의 알맹이. 채널(파드)이 닫힐 때 접속자를 다른 채널로 넘기는 데 필요한 것만 담는다.
// 세이브(newSave)는 "언젠가 다시 접속했을 때" 복원할 값이고, 이관 페이로드는
// "지금 이 순간 화면이 안 끊기게" 넘길 값이라 담기는 항목이 다르다 — 좌표와 현재 체력이 그것이다.
// preStop 이 이 객체를 redis 에 넣고, 받는 채널이 applyTransfer 로 이어받는다.
const TRANSFER_V = 1;

function transferState(p) {
  return {
    v: TRANSFER_V,
    id: p.id, name: p.name,
    level: p.level, exp: p.exp,
    x: Math.round(p.x), face: p.face,
    hp: Math.round(p.hp), maxHp: p.maxHp,
    equip: p.equip,
    cds: p.cds || {},          // 스킬 쿨타임까지 넘겨야 이관으로 쿨을 초기화하는 악용이 막힌다
    at: Date.now(),
  };
}

function applyTransfer(p, t) {
  if (!t || t.v !== TRANSFER_V) return false;
  Object.assign(p, {
    id: t.id, name: t.name, level: t.level, exp: t.exp,
    x: t.x, face: t.face || 1, hp: t.hp, maxHp: t.maxHp,
    equip: t.equip, cds: t.cds || {},
  });
  return true;
}

/* ---------- 채널 지표 ---------- */
// KEDA 트리거와 pod-deletion-cost 가 같은 값을 봐야 한다.
// 두 군데서 따로 세면 "가장 한가한 파드"의 정의가 어긋나 엉뚱한 채널이 닫힌다.
function channelMetrics(players) {
  const active = players.length;
  return {
    active_players: active,     // /metrics 로 노출 → KEDA ScaledObject 트리거
    deletion_cost: active,      // controller.kubernetes.io/pod-deletion-cost
    full: active >= CHANNEL_CAP,
  };
}

// 여러 채널·클라이언트가 같은 id 를 만들면 기여도와 이관이 섞인다.
let _seq = 0;
const newId = prefix => `${prefix}_${Date.now().toString(36)}_${(_seq++).toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

/* ---------- 세이브 ---------- */
// DB 가 있다는 가정. 이 모양 그대로 한 행(row)으로 저장된다.
function newSave(name = '모험가') {
  return {
    v: 1, name,
    level: 1, exp: 0, gold: 0,
    equip: { weapon: starterWeapon(), helmet: null, armor: null },
    bag: [],
    kills: 0,              // 개인 누적 처치
    stats: { deaths: 0, bossKills: 0, playSec: 0 },
    savedAt: Date.now(),
  };
}

const API = {
  LEVEL_MAX, CHANNEL_CAP, PLAYER, MONSTERS, MONSTER_KEYS, SUMMON_KILLS,
  SLOTS, SLOT_KEYS, GRADE_MAX, GRADE_NAMES, GRADE_TINTS,
  xpToLevel, mobExpMult, SKILLS, skillsAt, skillRange, skillDamage, spawnTable, pickSpawn, monsterExp, monsterGold,
  itemPower, rollItem, starterWeapon, playerStats, mitigate, contribution, splitReward,
  transferState, applyTransfer, channelMetrics, newId,
  gainExp, newSave, clamp,
};

if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.Core = API;
