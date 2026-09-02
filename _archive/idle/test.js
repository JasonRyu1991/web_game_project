const assert = require('assert');
const C = require('./core.js');

/* --- 성장 곡선 --- */
assert.ok(C.monsterHp(1) > 0 && C.monsterHp(10) > C.monsterHp(9), '체력은 단조 증가');
assert.ok(C.goldReward(10) > C.goldReward(9), '보상도 단조 증가');
// 체력이 보상보다 빨리 늘어야 뒤로 갈수록 느려진다. 반대면 무한 가속한다.
const hpRatio = C.monsterHp(21) / C.monsterHp(20);
const goldRatio = C.goldReward(21) / C.goldReward(20);
assert.ok(hpRatio > goldRatio, `체력 증가율(${hpRatio.toFixed(3)})이 보상(${goldRatio.toFixed(3)})보다 커야 함`);

/* --- 몬스터 배치 --- */
assert.strictEqual(C.monsterKindAt(1, 0), 'grunt', '스테이지 앞부분은 잡몹');
assert.strictEqual(C.monsterKindAt(1, C.KILLS_PER_STAGE - 1), 'brute', '마지막은 중간보스');
assert.strictEqual(C.monsterKindAt(5, C.KILLS_PER_STAGE - 1), 'boss', '5의 배수 스테이지 끝은 보스');
assert.strictEqual(C.monsterKindAt(10, C.KILLS_PER_STAGE - 1), 'boss');
assert.strictEqual(C.monsterKindAt(4, C.KILLS_PER_STAGE - 1), 'brute');
const boss = C.monsterAt(5, C.KILLS_PER_STAGE - 1), mob = C.monsterAt(5, 0);
assert.ok(boss.maxHp > mob.maxHp * 5, '보스는 훨씬 단단해야 함');
assert.ok(boss.gold > mob.gold * 5, '보스는 보상도 커야 함');

/* --- 스탯: 전부 곱연산이라 강화가 계속 의미 있어야 한다 --- */
const s = C.newSave();
const base = C.stats(s).dps;
assert.ok(base > 0, '아무것도 안 해도 공격은 나가야 함');
const s2 = C.newSave(); s2.upgrades.atk = 10;
const s3 = C.newSave(); s3.upgrades.atk = 20;
const gain1 = C.stats(s2).dps / base, gain2 = C.stats(s3).dps / C.stats(s2).dps;
assert.ok(Math.abs(gain1 - gain2) < 1e-9, '같은 횟수 강화는 같은 배수여야 함 (곱연산)');
const s4 = C.newSave(); s4.upgrades.rate = 500;
assert.ok(C.stats(s4).rate <= C.RATE_CAP, '공격 속도는 상한을 넘지 않음');
const s5 = C.newSave(); s5.upgrades.crit = 9999;
assert.ok(C.stats(s5).crit <= 0.75, '치명타 확률도 상한');

/* --- 강화 비용 --- */
assert.ok(C.upgradeCost('atk', 5) > C.upgradeCost('atk', 0), '살수록 비싸져야 함');
const buyer = C.newSave(); buyer.gold = 0;
assert.strictEqual(C.buyUpgrade(buyer, 'atk'), false, '골드가 없으면 못 삼');
assert.strictEqual(buyer.upgrades.atk, 0);
buyer.gold = C.upgradeCost('atk', 0);
assert.strictEqual(C.buyUpgrade(buyer, 'atk'), true);
assert.strictEqual(buyer.gold, 0, '정확히 비용만큼 빠짐');
assert.strictEqual(buyer.upgrades.atk, 1);

/* --- 처치와 레벨업 --- */
const k = C.newSave();
const m1 = C.monsterAt(1, 0);
C.applyKill(k, m1);
assert.strictEqual(k.totalKills, 1);
assert.strictEqual(k.killsInStage, 1);
assert.ok(k.gold >= m1.gold, '골드가 들어와야 함');
// 스테이지 넘김
const st = C.newSave();
for (let i = 0; i < C.KILLS_PER_STAGE; i++) C.applyKill(st, C.monsterAt(st.stage, st.killsInStage));
assert.strictEqual(st.stage, 2, '10마리 잡으면 다음 스테이지');
assert.strictEqual(st.killsInStage, 0);
assert.strictEqual(st.bestStage, 2);
// 경험치가 한 번에 많이 들어오면 여러 레벨이 올라야 한다
const lv = C.newSave();
const r = C.applyKill(lv, { kind: 'boss', maxHp: 1, gold: 0, xp: 100000 });
assert.ok(r.levels > 1, `한 번에 여러 레벨 (${r.levels})`);
assert.ok(lv.xp < C.xpToLevel(lv.level), '남은 경험치는 다음 레벨 요구치보다 작아야 함');

/* --- 장비 --- */
let seed = 7;
const rng = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const item = C.rollItem(10, rng, 1);
assert.ok(C.SLOT_KEYS.includes(item.slot), '유효한 슬롯');
assert.ok(C.RARITIES.some(r => r.key === item.rarity), '유효한 등급');
assert.ok(item.power > 0);
assert.ok(C.rollItem(40, rng, 2).power > C.rollItem(1, rng, 3).power, '높은 스테이지가 더 센 장비');

// 장착: 원래 끼던 건 가방으로 돌아온다
const eqs = C.newSave();
const a = { id: 'a', slot: 'weapon', rarity: 'common', power: 10, stage: 1 };
const b = { id: 'b', slot: 'weapon', rarity: 'rare', power: 40, stage: 5 };
eqs.bag.push(a, b);
assert.strictEqual(C.equip(eqs, 'a'), true);
assert.strictEqual(eqs.equipped.weapon.id, 'a');
assert.strictEqual(C.equip(eqs, 'b'), true);
assert.strictEqual(eqs.equipped.weapon.id, 'b');
assert.ok(eqs.bag.some(i => i.id === 'a'), '빼낸 장비는 가방으로');
assert.strictEqual(C.equip(eqs, 'none'), false, '없는 아이템은 실패');
// 무기는 공격력을 올린다
const withGear = C.newSave();
withGear.equipped.weapon = { id: 'w', slot: 'weapon', rarity: 'rare', power: 100, stage: 5 };
assert.ok(Math.abs(C.stats(withGear).atk / C.stats(C.newSave()).atk - 2) < 1e-9,
  'power 100 이면 공격력 두 배');

// 판매
const sl = C.newSave();
sl.bag.push({ id: 'x', slot: 'charm', rarity: 'epic', power: 20, stage: 3 });
const got = C.sell(sl, 'x');
assert.ok(got > 0 && sl.gold === got && sl.bag.length === 0, '팔면 골드로 바뀌고 가방에서 빠짐');
assert.strictEqual(C.sell(sl, 'x'), 0, '없는 걸 팔면 0');

/* --- 세이브 복구: 망가진 파일로도 게임이 떠야 한다 --- */
assert.deepStrictEqual(C.normalizeSave(null).level, 1);
assert.deepStrictEqual(C.normalizeSave('쓰레기').stage, 1);
const bad = C.normalizeSave({ level: -5, gold: NaN, stage: 0, upgrades: { atk: 'x' },
                              bag: [{ slot: 'nope' }, null], equipped: { weapon: { slot: 'glove' } } });
assert.strictEqual(bad.level, 1, '음수 레벨은 1로');
assert.strictEqual(bad.gold, 0, 'NaN 골드는 0으로');
assert.strictEqual(bad.stage, 1);
assert.strictEqual(bad.upgrades.atk, 0);
assert.strictEqual(bad.bag.length, 0, '망가진 아이템은 버림');
assert.strictEqual(bad.equipped.weapon, null, '슬롯이 안 맞는 장비는 버림');
const ok = C.normalizeSave({ level: 12, gold: 500, stage: 7, killsInStage: 3,
                             upgrades: { atk: 4, rate: 2, crit: 1, luck: 0 } });
assert.strictEqual(ok.level, 12); assert.strictEqual(ok.stage, 7); assert.strictEqual(ok.upgrades.atk, 4);

/* --- 오프라인 보상 --- */
const off = C.newSave();
off.lastSeen = Date.now() - 30 * 1000;
assert.strictEqual(C.offlineGain(off).kills, 0, '1분 미만은 보상 없음');
off.lastSeen = Date.now() - 2 * 3600 * 1000;
const g2 = C.offlineGain(off);
assert.ok(g2.kills > 0 && g2.gold > 0, '2시간이면 보상이 있어야 함');
off.lastSeen = Date.now() - 48 * 3600 * 1000;
const g48 = C.offlineGain(off);
assert.strictEqual(g48.sec, C.OFFLINE_CAP_SEC, '상한을 넘지 않음');
// 미래 시각이 찍혀 있어도 음수가 나오면 안 된다
off.lastSeen = Date.now() + 10 * 3600 * 1000;
const gf = C.offlineGain(off);
assert.ok(gf.gold === 0 && gf.kills === 0, '미래 시각이어도 음수 보상 없음');

/* --- 퀘스트 --- */
const q0 = C.newSave();
const qs0 = C.questState(q0);
assert.strictEqual(qs0.length, C.QUEST_KEYS.length, '갈래마다 하나씩');
assert.ok(qs0.every(q => q.tier === 0 && !q.claimable), '시작하면 아무것도 못 받음');
assert.ok(qs0.every(q => q.reward.gold > 0 && q.reward.xp > 0), '보상이 있어야 함');
assert.strictEqual(C.claimableCount(q0), 0);

// 목표를 채우면 받을 수 있다
q0.totalKills = C.QUEST_LINES.kills.goals[0];
assert.strictEqual(C.claimableCount(q0), 1, '채운 갈래만 받을 수 있음');
const claimed = C.claimQuest(q0, 'kills');
assert.ok(claimed && q0.gold > 0, '보상이 들어와야 함');
assert.strictEqual(q0.quests.kills, 1, '다음 단계로 넘어감');
assert.strictEqual(C.claimQuest(q0, 'kills'), null, '같은 단계를 두 번 받을 수 없음');
assert.strictEqual(C.claimQuest(q0, 'stage'), null, '목표 미달이면 못 받음');
const nextGoal = C.questState(q0).find(q => q.key === 'kills').goal;
assert.ok(nextGoal > C.QUEST_LINES.kills.goals[0], '목표가 커져야 함');

// 갈래마다 진행도가 제 값을 본다
const q1 = C.newSave();
q1.bestStage = 999; q1.gearFound = 999; q1.totalKills = 0;
const st1 = C.questState(q1);
assert.ok(st1.find(q => q.key === 'stage').claimable, '탐험은 최고 층수를 본다');
assert.ok(st1.find(q => q.key === 'gear').claimable, '수집은 주운 장비 수를 본다');
assert.ok(!st1.find(q => q.key === 'kills').claimable, '사냥은 처치 수를 본다');

// 마지막 단계까지 끝내면 더 받을 게 없다
const q2 = C.newSave();
q2.totalKills = 1e9;
for (let i = 0; i < C.QUEST_LINES.kills.goals.length; i++) assert.ok(C.claimQuest(q2, 'kills'));
const last = C.questState(q2).find(q => q.key === 'kills');
assert.ok(last.allDone && !last.claimable, '전부 끝내면 더 없음');
assert.strictEqual(C.claimQuest(q2, 'kills'), null);

// 보상이 크면 레벨이 여러 번 오를 수 있다
const q3 = C.newSave();
q3.bestStage = 60; q3.totalKills = 1e9;
const big = C.claimQuest(q3, 'kills');
assert.ok(big.levels >= 1, '큰 보상이면 레벨이 오른다');
assert.ok(q3.xp < C.xpToLevel(q3.level), '남은 경험치 정리');

/* --- 세이브: 새 칸도 복구되어야 한다 --- */
const nb = C.normalizeSave({ quests: { kills: -3, stage: 'x', gear: 99999 },
                             gearFound: -5, settings: { dmgNumbers: 'nope', shake: false } });
assert.strictEqual(nb.quests.kills, 0, '음수 단계는 0');
assert.strictEqual(nb.quests.stage, 0, '숫자가 아니면 0');
assert.strictEqual(nb.quests.gear, C.QUEST_LINES.gear.goals.length, '단계 수를 넘지 않음');
assert.strictEqual(nb.gearFound, 0);
assert.strictEqual(nb.settings.dmgNumbers, true, '불리언이 아니면 기본값');
assert.strictEqual(nb.settings.shake, false, '불리언이면 그대로');
assert.deepStrictEqual(C.normalizeSave(null).quests, { kills: 0, stage: 0, gear: 0 });

console.log('ok');
