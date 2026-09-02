// 방치형 코어 — 수치와 규칙만. DOM 을 모른다.
// 나중에 서버(Node)가 그대로 require 해서 권위 계산을 맡을 수 있게 순수 함수로 둔다.

/* ---------- 성장 곡선 ---------- */
// 방치형은 곡선이 전부다. 체력이 지수로 늘면 공격력도 지수로 늘어야 한다.
// 강화 효과를 덧셈으로 두면 2분 만에 벽에 막히므로 아래 stats() 는 전부 곱연산이다.
// 보상 증가율(1.30)을 체력 증가율(1.42)보다 낮게 두어야 뒤로 갈수록 느려진다.
// 두 값이 붙으면 무한 가속하고, 너무 벌리면 금방 벽에 막힌다. 아래 값은 시뮬레이션으로 잡았다
// (1분 3 → 15분 25 → 1시간 42 → 2시간 50 스테이지).
const monsterHp   = s => Math.floor(12 * Math.pow(1.42, s - 1));
const goldReward  = s => Math.floor(5 * Math.pow(1.30, s - 1));
const xpReward    = s => Math.floor(4 * Math.pow(1.28, s - 1));
const xpToLevel   = lv => Math.floor(24 * Math.pow(1.30, lv - 1));

const KILLS_PER_STAGE = 10;          // 이만큼 잡으면 다음 스테이지
const BOSS_EVERY = 5;                // 이 배수 스테이지의 마지막은 보스
const OFFLINE_CAP_SEC = 12 * 3600;   // 오프라인 보상 상한
const OFFLINE_RATE = 0.5;            // 오프라인은 접속 중의 절반만 벌린다

// 스테이지 안에서 몇 번째 몬스터인지로 종류를 정한다. 방치형은 확률보다
// 정해진 리듬이 낫다 — 언제 보스가 오는지 보이면 강화할 목표가 생긴다.
function monsterKindAt(stage, killsInStage) {
  const last = killsInStage === KILLS_PER_STAGE - 1;
  if (last && stage % BOSS_EVERY === 0) return 'boss';
  if (last) return 'brute';
  return 'grunt';
}

const KIND_MULT = { grunt: 1, brute: 3.5, boss: 12 };   // 체력·보상 배수

// 등급마다 생김새가 여러 가지다. 어떤 게 나올지는 스테이지로 정해지므로
// 같은 자리에 가면 늘 같은 몬스터가 나온다 (서버가 검증하기도 쉽다).
const KIND_TYPES = {
  grunt: ['imp', 'slime', 'skeleton'],
  brute: ['brute', 'golem'],
  boss:  ['overlord', 'dragon'],
};

const ALL_TYPES = Object.values(KIND_TYPES).flat();

// 5 스테이지마다 색이 돈다. 같은 생김새라도 다른 놈처럼 보이게 하는 싸구려 수법이지만
// 실제로 잘 먹히고, 스프라이트를 새로 그리는 것보다 훨씬 싸다.
// 다만 한 바퀴 다 돌리면 돌 골렘이 초록이 되는 식으로 정체성이 무너진다. ±36도로 묶는다.
const TINT_BAND = 5;
const TINT_RANGE = 36;
function hueForStage(stage) {
  const band = Math.floor((stage - 1) / TINT_BAND);
  if (!band) return 0;
  return ((band * 53) % (TINT_RANGE * 2 + 1)) - TINT_RANGE;
}

function monsterAt(stage, killsInStage) {
  const kind = monsterKindAt(stage, killsInStage);
  const types = KIND_TYPES[kind];
  const m = KIND_MULT[kind];
  return {
    kind,
    type: types[(stage + killsInStage) % types.length],
    hue: hueForStage(stage),
    maxHp: Math.max(1, Math.floor(monsterHp(stage) * m)),
    gold: Math.max(1, Math.floor(goldReward(stage) * m)),
    xp: Math.max(1, Math.floor(xpReward(stage) * m)),
  };
}

const TYPE_NAMES = {
  imp: '임프', slime: '슬라임', skeleton: '해골',
  brute: '파괴자', golem: '골렘',
  overlord: '군주', dragon: '용',
};

/* ---------- 강화 ---------- */
// growth = 비용 증가율, per = 단계당 효과. 비용이 효과보다 빨리 올라야 무한 성장이 안 된다.
const UPGRADES = {
  atk:  { key: 'atk',  name: '공격력',   base: 12, growth: 1.16, per: 0.08, kind: 'mult' },
  rate: { key: 'rate', name: '공격 속도', base: 30, growth: 1.19, per: 0.045, kind: 'mult' },
  crit: { key: 'crit', name: '치명타',   base: 50, growth: 1.22, per: 0.01, kind: 'add'  },
  luck: { key: 'luck', name: '행운',     base: 70, growth: 1.25, per: 0.05, kind: 'add'  },
};

const RATE_CAP = 8;                  // 초당 공격 횟수 상한

const upgradeCost = (key, owned) =>
  Math.floor(UPGRADES[key].base * Math.pow(UPGRADES[key].growth, owned));

/* ---------- 장비 ---------- */
const RARITIES = [
  { key: 'common', name: '일반', weight: 62, mult: 1.0, tint: '#98a2b3', desc: '흔하게 나온다' },
  { key: 'rare',   name: '희귀', weight: 26, mult: 1.9, tint: '#4da3ff', desc: '네 번에 한 번쯤' },
  { key: 'epic',   name: '영웅', weight: 10, mult: 3.4, tint: '#c86bff', desc: '열 번에 한 번' },
  { key: 'legend', name: '전설', weight: 2,  mult: 6.5, tint: '#ffb02e', desc: '쉰 번에 한 번' },
];

const SLOTS = {
  weapon: { key: 'weapon', name: '무기', stat: 'atk',  label: '공격력',
            desc: '한 대에 들어가는 피해가 는다' },
  glove:  { key: 'glove',  name: '장갑', stat: 'rate', label: '공격 속도',
            desc: '초당 때리는 횟수가 는다' },
  charm:  { key: 'charm',  name: '부적', stat: 'gold', label: '골드 획득',
            desc: '몬스터가 떨구는 골드가 는다' },
};

const SLOT_KEYS = Object.keys(SLOTS);
const RARITY_WEIGHT = RARITIES.reduce((s, r) => s + r.weight, 0);

function rollRarity(rng = Math.random) {
  let r = rng() * RARITY_WEIGHT;
  for (const it of RARITIES) if ((r -= it.weight) < 0) return it.key;
  return RARITIES[0].key;
}

const rarityOf = key => RARITIES.find(r => r.key === key) || RARITIES[0];

// 장비 수치. 스테이지가 오를수록 좋은 게 나오고, 같은 등급 안에서도 편차가 있다.
function rollItem(stage, rng = Math.random, seq = 0) {
  const slot = SLOT_KEYS[Math.min(SLOT_KEYS.length - 1, Math.floor(rng() * SLOT_KEYS.length))];
  const rarity = rollRarity(rng);
  const base = 3 + stage * 1.1;
  const power = Math.max(1, Math.round(base * rarityOf(rarity).mult * (0.85 + rng() * 0.3)));
  return { id: `${Date.now().toString(36)}_${seq}`, slot, rarity, power, stage };
}

// 드롭 확률. 행운 강화가 올릴 수 있고 상한이 있다.
const dropChance = luckOwned =>
  Math.min(0.5, 0.10 + luckOwned * UPGRADES.luck.per * 0.1);

/* ---------- 세이브 ---------- */
function newSave() {
  return {
    v: 1,
    level: 1, xp: 0, gold: 0,
    stage: 1, killsInStage: 0, bestStage: 1, totalKills: 0,
    upgrades: { atk: 0, rate: 0, crit: 0, luck: 0 },
    equipped: { weapon: null, glove: null, charm: null },
    bag: [],
    gearFound: 0,
    quests: { kills: 0, stage: 0, gear: 0 },
    settings: { dmgNumbers: true, shake: true },
    lastSeen: Date.now(),
  };
}

// 저장 파일이 낡거나 망가져도 게임이 뜨도록 빠진 칸을 메운다.
function normalizeSave(raw) {
  const s = newSave();
  if (!raw || typeof raw !== 'object') return s;
  const num = (v, d) => (Number.isFinite(v) && v >= 0 ? v : d);
  s.level = Math.max(1, Math.floor(num(raw.level, 1)));
  s.xp = num(raw.xp, 0);
  s.gold = num(raw.gold, 0);
  s.stage = Math.max(1, Math.floor(num(raw.stage, 1)));
  s.killsInStage = Math.max(0, Math.min(KILLS_PER_STAGE - 1, Math.floor(num(raw.killsInStage, 0))));
  s.bestStage = Math.max(s.stage, Math.floor(num(raw.bestStage, 1)));
  s.totalKills = Math.floor(num(raw.totalKills, 0));
  for (const k of Object.keys(s.upgrades)) s.upgrades[k] = Math.floor(num(raw.upgrades?.[k], 0));
  for (const k of SLOT_KEYS) {
    const it = raw.equipped?.[k];
    s.equipped[k] = it && it.slot === k && Number.isFinite(it.power) ? it : null;
  }
  s.bag = Array.isArray(raw.bag)
    ? raw.bag.filter(i => i && SLOT_KEYS.includes(i.slot) && Number.isFinite(i.power)).slice(0, 60)
    : [];
  s.gearFound = Math.floor(num(raw.gearFound, 0));
  for (const k of QUEST_KEYS) {
    const max = QUEST_LINES[k].goals.length;
    s.quests[k] = Math.max(0, Math.min(max, Math.floor(num(raw.quests?.[k], 0))));
  }
  for (const k of Object.keys(s.settings)) {
    if (typeof raw.settings?.[k] === 'boolean') s.settings[k] = raw.settings[k];
  }
  s.lastSeen = num(raw.lastSeen, Date.now());
  return s;
}

/* ---------- 스탯 ---------- */
// 레벨 + 강화 + 장비를 합친 최종 수치. 화면도 서버도 이 함수 하나만 본다.
// 장비는 퍼센트 보너스다. power 100 이면 그 항목이 두 배가 된다.
function stats(save) {
  const u = save.upgrades, eq = save.equipped;
  const bonus = st => 1 + SLOT_KEYS.reduce(
    (sum, k) => sum + (eq[k] && SLOTS[k].stat === st ? eq[k].power : 0), 0) / 100;

  const atk = 5 * Math.pow(1.06, save.level - 1) * Math.pow(1 + UPGRADES.atk.per, u.atk) * bonus('atk');
  const rate = Math.min(RATE_CAP, Math.pow(1 + UPGRADES.rate.per, u.rate) * bonus('rate'));
  const crit = Math.min(0.75, u.crit * UPGRADES.crit.per);
  const critMult = 2;
  const goldMult = bonus('gold');

  return {
    atk, rate, crit, critMult, goldMult,
    dps: atk * rate * (1 + crit * (critMult - 1)),   // 기대값 기준
    tap: Math.max(1, Math.round(atk * 0.8)),
  };
}

// 이 장비를 끼면 실제로 얼마나 세지는지. 퍼센트 수치만으로는 체감이 안 온다.
// charm 은 피해가 아니라 골드에 붙으므로 따로 알려 준다.
function previewEquip(save, item) {
  const cur = save.equipped[item.slot];
  const before = stats(save);
  const after = stats({ ...save, equipped: { ...save.equipped, [item.slot]: item } });
  const field = SLOTS[item.slot].stat === 'gold' ? 'goldMult' : 'dps';
  return {
    field,
    ratio: before[field] > 0 ? after[field] / before[field] - 1 : 0,
    curPower: cur ? cur.power : 0,
    better: !cur || item.power > cur.power,
  };
}

/* ---------- 기록 ---------- */
// 성취를 남길 자리. 숫자가 커지기만 하는 게임에서 "여기까지 왔다"를 보여 준다.
const MILESTONES = [
  { kills: 10,    name: '첫 사냥' },
  { kills: 50,    name: '사냥꾼' },
  { kills: 200,   name: '베테랑' },
  { kills: 1000,  name: '학살자' },
  { kills: 5000,  name: '심연의 주인' },
  { kills: 25000, name: '전설' },
];

// 이번 처치로 새로 넘긴 이정표가 있으면 돌려준다.
function milestoneReached(before, after) {
  return MILESTONES.find(m => before < m.kills && after >= m.kills) || null;
}

/* ---------- 퀘스트 ---------- */
// 세 갈래가 동시에 굴러간다. 하나를 끝내면 같은 갈래의 다음 단계가 열린다.
// 보상은 자동으로 들어가지 않는다 — 직접 받아야 끝냈다는 느낌이 남는다.
const QUEST_LINES = {
  kills: {
    key: 'kills', name: '사냥', unit: '마리',
    desc: '몬스터를 잡는다',
    goals: [10, 50, 200, 800, 3000, 12000, 50000],
    progress: save => save.totalKills,
  },
  stage: {
    key: 'stage', name: '탐험', unit: '층',
    desc: '더 깊이 내려간다',
    goals: [5, 10, 18, 28, 40, 55, 75],
    progress: save => save.bestStage,
  },
  gear: {
    key: 'gear', name: '수집', unit: '개',
    desc: '장비를 주워 모은다',
    goals: [3, 10, 25, 60, 140, 300, 700],
    progress: save => save.gearFound,
  },
};

const QUEST_KEYS = Object.keys(QUEST_LINES);

// 단계가 오를수록 보상도 커진다. 그 시점 스테이지 보상에 맞춰 줘야 의미가 있다.
function questReward(lineKey, tier, save) {
  const goal = QUEST_LINES[lineKey].goals[tier];
  if (goal === undefined) return null;
  const base = goldReward(Math.max(1, save.bestStage));
  return {
    gold: Math.max(20, Math.floor(base * (6 + tier * 5))),
    xp: Math.max(10, Math.floor(xpReward(Math.max(1, save.bestStage)) * (4 + tier * 3))),
  };
}

// 갈래마다 지금 어느 단계인지, 얼마나 왔는지, 받을 수 있는지.
function questState(save) {
  return QUEST_KEYS.map(key => {
    const line = QUEST_LINES[key];
    const tier = save.quests?.[key] ?? 0;
    const goal = line.goals[tier];
    const cur = line.progress(save);
    if (goal === undefined) {
      return { key, name: line.name, desc: line.desc, unit: line.unit,
               tier, goal: null, cur, ratio: 1, claimable: false, allDone: true, reward: null };
    }
    return {
      key, name: line.name, desc: line.desc, unit: line.unit,
      tier, goal, cur: Math.min(cur, goal),
      ratio: Math.min(1, cur / goal),
      claimable: cur >= goal,
      allDone: false,
      reward: questReward(key, tier, save),
    };
  });
}

const claimableCount = save => questState(save).filter(q => q.claimable).length;

function claimQuest(save, lineKey) {
  const q = questState(save).find(x => x.key === lineKey);
  if (!q || !q.claimable) return null;
  save.gold += q.reward.gold;
  save.xp += q.reward.xp;
  let levels = 0;
  while (save.xp >= xpToLevel(save.level)) {
    save.xp -= xpToLevel(save.level);
    save.level++;
    levels++;
  }
  save.quests[lineKey] = q.tier + 1;
  return { ...q, levels };
}

/* ---------- 진행 ---------- */
// 몬스터를 잡았을 때 세이브를 갱신한다. 레벨업은 한 번에 여러 번 오를 수 있다.
function applyKill(save, monster) {
  save.gold += Math.floor(monster.gold * stats(save).goldMult);
  save.xp += monster.xp;
  save.totalKills++;
  let levels = 0;
  while (save.xp >= xpToLevel(save.level)) {
    save.xp -= xpToLevel(save.level);
    save.level++;
    levels++;
  }
  save.killsInStage++;
  let staged = false;
  if (save.killsInStage >= KILLS_PER_STAGE) {
    save.killsInStage = 0;
    save.stage++;
    save.bestStage = Math.max(save.bestStage, save.stage);
    staged = true;
  }
  return { levels, staged };
}

function buyUpgrade(save, key) {
  const cost = upgradeCost(key, save.upgrades[key]);
  if (save.gold < cost) return false;
  save.gold -= cost;
  save.upgrades[key]++;
  return true;
}

// 더 센 걸 끼우고 원래 끼고 있던 건 가방으로 돌린다.
function equip(save, itemId) {
  const i = save.bag.findIndex(it => it.id === itemId);
  if (i < 0) return false;
  const item = save.bag[i];
  const old = save.equipped[item.slot];
  save.equipped[item.slot] = item;
  save.bag.splice(i, 1);
  if (old) save.bag.push(old);
  return true;
}

const sellValue = item => Math.floor(item.power * 3 * rarityOf(item.rarity).mult);

function sell(save, itemId) {
  const i = save.bag.findIndex(it => it.id === itemId);
  if (i < 0) return 0;
  const v = sellValue(save.bag[i]);
  save.gold += v;
  save.bag.splice(i, 1);
  return v;
}

/* ---------- 오프라인 보상 ---------- */
// 자리를 비운 동안 몇 마리나 잡았을지 계산한다. 접속 중보다 덜 벌리고 상한이 있다.
function offlineGain(save, nowMs = Date.now()) {
  const sec = Math.max(0, Math.min(OFFLINE_CAP_SEC, (nowMs - save.lastSeen) / 1000));
  if (sec < 60) return { sec: 0, kills: 0, gold: 0, xp: 0 };
  const m = monsterAt(save.stage, 0);
  const st = stats(save);
  const perKill = m.maxHp / Math.max(1, st.dps);              // 한 마리에 걸리는 초
  const kills = Math.floor((sec * OFFLINE_RATE) / Math.max(0.1, perKill));
  return {
    sec: Math.floor(sec),
    kills,
    gold: Math.floor(kills * m.gold * st.goldMult),
    xp: Math.floor(kills * m.xp),
  };
}

const CORE = {
  monsterHp, goldReward, xpReward, xpToLevel,
  KILLS_PER_STAGE, BOSS_EVERY, OFFLINE_CAP_SEC, OFFLINE_RATE,
  monsterKindAt, KIND_MULT, KIND_TYPES, ALL_TYPES, TYPE_NAMES, hueForStage, TINT_BAND, TINT_RANGE, monsterAt,
  UPGRADES, upgradeCost,
  RARITIES, SLOTS, SLOT_KEYS, rollRarity, rarityOf, rollItem, dropChance, RATE_CAP,
  newSave, normalizeSave, stats, previewEquip,
  MILESTONES, milestoneReached,
  QUEST_LINES, QUEST_KEYS, questState, questReward, claimQuest, claimableCount,
  applyKill, buyUpgrade, equip, sell, sellValue, offlineGain,
};

if (typeof module !== 'undefined') module.exports = CORE;
if (typeof window !== 'undefined') window.CORE = CORE;
