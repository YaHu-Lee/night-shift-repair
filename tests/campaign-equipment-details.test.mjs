import test from 'node:test';
import assert from 'node:assert/strict';
import { ATTACHMENTS, GEAR, createEquipment, getEquipmentOffer, resolveEquipment } from '../.m0-build/m1/Equipment.js';
import { equipmentDetail } from '../.m0-build/m1/EquipmentDetails.js';

function stats(item, fitted) {
    return Object.fromEntries(equipmentDetail(item, fitted).rows.map(({ label, value }) => [label, value]));
}

test('equipment details show fitted weapon values and their original baseline', () => {
    const { equipment, tools } = createEquipment('hydraulic_nailer', {
        weapon: { reachBonus: 8, intervalReduction: 2, damageBonus: 1 },
    });
    tools[0].attachments[0] = 'hydraulic_nailer/finisher';
    tools[0].attachments[1] = 'hydraulic_nailer/handling';
    const fitted = resolveEquipment(tools, equipment, 'arc', 10).weapons[0];
    const item = getEquipmentOffer('hydraulic_nailer');
    assert.deepEqual(stats(item), { 单次伤害: '4', 射程: '155 像素', 攻击间隔: '1067 毫秒' });
    assert.deepEqual(stats(item, fitted), {
        单次伤害: '6（基础 4）', 射程: '163 像素（基础 155）', 攻击间隔: '1133 毫秒（基础 1067）',
        穿刺目标: '+1 台', 弹道宽度: '+4 像素',
    });
    assert.equal(stats(getEquipmentOffer('wrench'), fitted).射程, '104 像素');
});

test('part and gear details show their actual effects and only parts name a compatible weapon', () => {
    assert.deepEqual(stats(getEquipmentOffer('induction/alternate')), {
        适用武器: '感应线圈', 作用半径: '−6 像素', 攻击间隔: '−133 毫秒',
    });
    assert.deepEqual(stats(getEquipmentOffer('gear/harness')), { 体力上限: '+1', 移动速度: '+8%' });
    assert.equal(stats(getEquipmentOffer('gear/sorter')).波末回收率, '+18 个百分点');
    assert.equal(stats(getEquipmentOffer('gear/guard')).格挡, '每波挡下第 1 次伤害');
    assert.deepEqual(stats(getEquipmentOffer('gear/pulse')), { 何时震击: '每捡 5 个零件', 震击范围: '79 像素', 震击伤害: '4' });
    for (const part of Object.values(ATTACHMENTS)) assert.ok(equipmentDetail(part).rows.length > 1, part.id);
    for (const item of Object.values(GEAR)) assert.ok(equipmentDetail(item).rows.length > 0, item.id);
});
