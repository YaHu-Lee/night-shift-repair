import { MAGNET_PULSE, TICK_RATE, TOOLS, attackReach, isTool } from './content';
import type { ToolId } from './content';
import { ATTACHMENTS, GEAR } from './Equipment';
import type { EquipmentOffer, WeaponEquipmentStats } from './Equipment';
import { isMeleeTool } from './WeaponMotion';

interface DetailRow { readonly label: string; readonly value: string }
interface EquipmentDetail { readonly description: string; readonly rows: readonly DetailRow[] }

const milliseconds = (ticks: number): number => Math.round(ticks * 1000 / TICK_RATE);
const rounded = (value: number): number => Math.round(value * 100) / 100;
const signed = (value: number, unit = ''): string => `${value > 0 ? '+' : '−'}${rounded(Math.abs(value))}${unit}`;
const rangeName = (id: ToolId): string => id === 'induction' || id === 'traction_coil' ? '作用半径' : '射程';

function currentStat(base: number, current: number, unit = ''): string {
    const value = `${rounded(current)}${unit}`;
    return rounded(base) === rounded(current) ? value : `${value}（基础 ${rounded(base)}）`;
}

function weaponBonuses(rows: DetailRow[], id: ToolId, change: (typeof ATTACHMENTS)[string]['change']): void {
    if (change.close) rows.push({ label: '近处命中伤害', value: `射程 45% 以内 ${signed(change.close)}` });
    if (change.far) rows.push({ label: '远处命中伤害', value: `从射程 65% 处起 ${signed(change.far)}` });
    if (change.chainReach) rows.push({ label: '连跳距离', value: signed(change.chainReach, ' 像素') });
    if (change.hops) rows.push({ label: '连跳次数', value: signed(change.hops, ' 次') });
    if (change.pierce) rows.push({ label: '穿刺目标', value: signed(change.pierce, ' 台') });
    if (change.targets) rows.push({ label: id === 'traction_coil' ? '牵引目标' : '同时攻击', value: signed(change.targets, ' 台') });
    if (change.combo) rows.push({ label: '第 4 击伤害', value: signed(change.combo) });
    if (change.displacement) rows.push({ label: id === 'traction_coil' ? '拉近距离' : '推开距离',
        value: signed(change.displacement, ' 像素') });
    if (change.spread) {
        if (id === 'riveter' || id === 'hydraulic_nailer') rows.push({ label: '弹道宽度', value: signed(change.spread * 2, ' 像素') });
        else rows.push({ label: '喷射范围', value: '扇面加宽' });
    }
    if (change.heat) rows.push({ label: '升温增伤', value: '第 4 次连发起 +1' }, { label: '过热', value: '暂停攻击，冷却后恢复' });
}

export function equipmentDetail(item: EquipmentOffer, fitted?: WeaponEquipmentStats, sweptMelee = false): EquipmentDetail {
    const rows: DetailRow[] = [];
    if (item.kind === 'weapon' && isTool(item.id)) {
        const tool = TOOLS[item.id];
        const contact = sweptMelee && isMeleeTool(item.id);
        const stats = fitted?.id === item.id ? fitted : undefined;
        rows.push(
            { label: '单次伤害', value: currentStat(tool.damage, stats?.damage ?? tool.damage) },
            { label: contact ? '角色周围射程' : rangeName(item.id), value: currentStat(attackReach(item.id, tool.reach, sweptMelee),
                attackReach(item.id, stats?.reach ?? tool.reach, sweptMelee), ' 像素') },
            { label: '攻击间隔', value: currentStat(milliseconds(tool.cooldown), milliseconds(stats?.interval ?? tool.cooldown), ' 毫秒') },
        );
        if (stats) {
            weaponBonuses(rows, item.id, stats);
            if (stats.arcLink) rows.push({ label: '分流接头', value: contact ? '再打标记目标，伤害 +1' : '再打标记目标，连跳增伤' });
        }
        const description = item.id === 'bypass_wrench' ? '交替钩扫和压击。第 4 击伤害 +3，2 秒没有目标后重计。' : item.detail;
        return { description, rows };
    }
    const attachment = item.kind === 'attachment' ? ATTACHMENTS[item.id] : undefined;
    if (attachment) {
        const { weapon, change, variant } = attachment;
        rows.push({ label: '适用武器', value: TOOLS[weapon].name });
        if (change.damage) rows.push({ label: '伤害', value: signed(change.damage) });
        if (change.reach) rows.push({ label: rangeName(weapon), value: signed(change.reach, ' 像素') });
        if (change.interval) rows.push({ label: '攻击间隔', value: signed(milliseconds(change.interval), ' 毫秒') });
        weaponBonuses(rows, weapon, change);
        if (variant === 'link') {
            rows.push({ label: '标记', value: '命中时给目标上标记' });
            rows.push(sweptMelee && isMeleeTool(weapon)
                ? { label: '标记增伤', value: '再打标记目标，伤害 +1' }
                : { label: '强化连跳', value: '再打标记目标，跳得更远、伤害更高' });
        }
        return { description: '', rows };
    }
    const gear = item.kind === 'gear' ? GEAR[item.id] : undefined;
    if (gear) {
        const { hp, speed, pickup, shield, salvage, pulse } = gear.change;
        if (hp) rows.push({ label: '体力上限', value: signed(hp) });
        if (speed) rows.push({ label: '移动速度', value: signed(speed * 100, '%') });
        if (pickup) rows.push({ label: '拾取范围', value: signed(pickup, ' 像素') });
        if (salvage) rows.push({ label: '波末回收率', value: signed(salvage * 100, ' 个百分点') });
        if (shield) rows.push({ label: '格挡', value: '每波挡下第 1 次伤害' });
        if (pulse) rows.push(
            { label: '何时震击', value: `每捡 ${MAGNET_PULSE.parts} 个零件` },
            { label: '震击范围', value: `${MAGNET_PULSE.radius} 像素` },
            { label: '震击伤害', value: String(MAGNET_PULSE.damage) },
        );
        return { description: '', rows };
    }
    return { description: item.detail, rows };
}
