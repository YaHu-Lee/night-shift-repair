import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROUTES = ['basic', 'unlocks'];
const STAGES = Array.from({ length: 20 }, (_, index) => String(index + 1).padStart(2, '0'));
const INCLUDED = ['battle', 'objectiveOnly', 'activeShop'];
const EXCLUDED = ['failedAttempts', 'loading', 'pausedOrBackground', 'idleWaiting', 'otherNonGameplay'];
const DURATIONS = [...INCLUDED, ...EXCLUDED];
const CONDITIONS = ['freshSave', 'standardRules', 'noAds', 'skippedOptionalDialogue', 'noReplays'];
const OBSERVATIONS = ['newToRoguelikes', 'wave1Unprompted', 'sawFirstShop', 'explainedFirstShop',
    'cleared01', 'started02', 'started02Voluntarily', 'triedArcGunIn02'];
const TIMING_GATE_SECONDS = 120 * 60;
const MILLISECONDS_PER_SECOND = 1000;

function blank(fields) {
    return Object.fromEntries(fields.map(field => [field, null]));
}

export function createBlankRecord(volunteers = 8) {
    requireCondition(Number.isInteger(volunteers) && volunteers >= 8 && volunteers <= 12, 'volunteers 必须为 8–12');
    return {
        build: '',
        timing: ROUTES.map(route => ({
            route, testerAlias: '', device: '', ...blank(CONDITIONS),
            stages: STAGES.map(stage => ({ stage, cleared: null, elapsed: null, ...blank(DURATIONS), note: '' })),
        })),
        cohort: {
            noAds: null,
            volunteers: Array.from({ length: volunteers }, (_, index) => ({
                alias: 'P' + String(index + 1).padStart(2, '0'), ...blank(OBSERVATIONS),
            })),
        },
    };
}

function requireCondition(isValid, message) {
    if (!isValid) throw new Error(message);
}

function requireObject(value, label) {
    requireCondition(value && typeof value === 'object' && !Array.isArray(value), label + ' 必须是对象');
    return value;
}

function requireText(value, label) {
    requireCondition(typeof value === 'string' && value.trim().length > 0, label + ' 必须填写');
    return value.trim();
}

function addDurations(rows, fields) {
    return Object.fromEntries(fields.map(field => {
        const milliseconds = rows.reduce((total, row) => total + row[field], 0);
        requireCondition(Number.isSafeInteger(milliseconds), field + ' 累计时长超出范围');
        return [field, milliseconds];
    }));
}

function durationMilliseconds(value, label) {
    const milliseconds = typeof value === 'number' ? Math.round(value * MILLISECONDS_PER_SECOND) : NaN;
    requireCondition(Number.isSafeInteger(milliseconds) && milliseconds >= 0 && milliseconds / MILLISECONDS_PER_SECOND === value,
        label + ' 必须填写非负秒数，最多保留三位小数');
    return milliseconds;
}

function durationsInSeconds(durations) {
    return Object.fromEntries(Object.entries(durations).map(([field, value]) => [field, value / MILLISECONDS_PER_SECOND]));
}

function summarizeDurations(rows) {
    const { activeMs, excludedMs, elapsed } = addDurations(rows, ['activeMs', 'excludedMs', 'elapsed']);
    return { activeMs, seconds: durationsInSeconds({ activeSeconds: activeMs, excludedSeconds: excludedMs, elapsed }) };
}

export function stageRowFromMarkers(value) {
    const record = requireObject(value, '关卡时间标记');
    requireCondition(STAGES.includes(record.stage), 'stage 必须为 01–20');
    requireCondition(record.cleared === true, 'cleared 须在观察到首通结单后单独确认');
    requireCondition(record.note === undefined || typeof record.note === 'string', 'note 必须是文本');
    const markers = record.markers;
    requireCondition(Array.isArray(markers) && markers.length >= 2, 'markers 至少需要一个区间起点和结束标记');

    const milliseconds = Object.fromEntries(DURATIONS.map(field => [field, 0]));
    let successActivitySeen = false;
    for (const [index, value] of markers.entries()) {
        const label = 'markers[' + index + ']';
        const marker = requireObject(value, label);
        requireCondition(Number.isSafeInteger(marker.atMs) && marker.atMs >= 0, label + '.atMs 必须是非负整数毫秒');
        if (index) {
            const previous = markers[index - 1];
            requireCondition(marker.atMs > previous.atMs, label + '.atMs 须严格递增');
            milliseconds[previous.bucket] += marker.atMs - previous.atMs;
        }
        if (index === markers.length - 1) {
            requireCondition(Object.keys(marker).length === 2 && marker.end === true, label + ' 须用 atMs 和 end:true 结束');
        } else {
            requireCondition(Object.keys(marker).length === 2 && DURATIONS.includes(marker.bucket),
                label + ' 须用 atMs 和一个有效的 bucket');
            requireCondition(marker.bucket !== 'failedAttempts' || !successActivitySeen, label + ' 的失败尝试须在成功玩法时间前');
            successActivitySeen ||= INCLUDED.includes(marker.bucket);
        }
    }

    const elapsed = markers.at(-1).atMs - markers[0].atMs;
    requireCondition(milliseconds.battle > 0, '成功尝试的 battle 须大于零');
    return { stage: record.stage, cleared: true, ...durationsInSeconds({ elapsed, ...milliseconds }), note: record.note ?? '' };
}

function timingReport(timing) {
    requireCondition(Array.isArray(timing) && timing.length === ROUTES.length, 'timing 必须有两条路线');
    requireCondition(ROUTES.every(route => timing.some(item => item?.route === route)), 'timing 需要 basic 与 unlocks 各一条');
    const testerAliases = new Set();
    const summaries = ROUTES.map(route => {
        const item = timing.find(entry => entry.route === route);
        const alias = requireText(item.testerAlias, route + '.testerAlias').toLowerCase();
        requireCondition(!testerAliases.has(alias), '两条正式计时路线必须由不同测试者完成');
        testerAliases.add(alias);
        requireText(item.device, route + '.device');
        for (const condition of CONDITIONS) {
            requireCondition(item[condition] === true, route + '.' + condition + ' 必须确认');
        }
        requireCondition(Array.isArray(item.stages) && item.stages.length === STAGES.length,
            route + ' 必须记录 01–20 的完整时长');
        const stages = item.stages.map((value, index) => {
            const prefix = route + '/' + STAGES[index];
            const row = requireObject(value, prefix);
            requireCondition(row.stage === STAGES[index], prefix + ' 必须按关卡顺序记录且不得重复');
            requireCondition(row.cleared === true, prefix + ' 尚未通关');
            const milliseconds = Object.fromEntries(['elapsed', ...DURATIONS].map(field => [
                field, durationMilliseconds(row[field], prefix + '.' + field),
            ]));
            requireCondition(milliseconds.battle > 0, prefix + '.battle 必须大于零');
            const activeMs = INCLUDED.reduce((sum, field) => sum + milliseconds[field], 0);
            const excludedMs = EXCLUDED.reduce((sum, field) => sum + milliseconds[field], 0);
            requireCondition(milliseconds.elapsed === activeMs + excludedMs, prefix + '.elapsed 与全部时间桶总和不相等');
            requireCondition(row.note === undefined || typeof row.note === 'string', prefix + '.note 必须是文本');
            return { stage: row.stage, note: row.note, ...milliseconds, activeMs, excludedMs };
        });
        const byChapter = Array.from({ length: 4 }, (_, index) => {
            const section = stages.slice(index * 5, index * 5 + 5);
            return { chapter: index + 1, ...summarizeDurations(section).seconds };
        });
        const totals = summarizeDurations(stages);
        return {
            activeMs: totals.activeMs,
            report: {
                route, device: item.device, ...totals.seconds,
                included: durationsInSeconds(addDurations(stages, INCLUDED)),
                excluded: durationsInSeconds(addDurations(stages, EXCLUDED)),
                byChapter, notes: stages.filter(stage => stage.note?.trim()).map(stage => ({ stage: stage.stage, note: stage.note.trim() })),
            },
        };
    });
    const shorterMs = Math.min(...summaries.map(summary => summary.activeMs));
    return { passed: shorterMs >= TIMING_GATE_SECONDS * MILLISECONDS_PER_SECOND, gateSeconds: TIMING_GATE_SECONDS,
        shorterSeconds: shorterMs / MILLISECONDS_PER_SECOND, routes: summaries.map(summary => summary.report) };
}

function countGate(rows, field, numeratorNeeded, denominatorNeeded) {
    const eligible = rows.length;
    const successes = rows.filter(row => row[field]).length;
    return {
        successes, eligible,
        rate: eligible ? successes / eligible : null,
        ...(numeratorNeeded === undefined ? {} : {
            threshold: numeratorNeeded / denominatorNeeded,
            passed: eligible > 0 && successes * denominatorNeeded >= eligible * numeratorNeeded,
        }),
    };
}

function cohortReport(value) {
    const cohort = requireObject(value, 'cohort');
    requireCondition(cohort.noAds === true, 'cohort.noAds 必须确认');
    const people = cohort.volunteers;
    requireCondition(Array.isArray(people) && people.length >= 8 && people.length <= 12, 'cohort 必须记录 8–12 位志愿者');
    const aliases = new Set();
    for (const [index, value] of people.entries()) {
        const label = 'cohort.volunteers[' + index + ']';
        const person = requireObject(value, label);
        const alias = requireText(person.alias, label + '.alias').toLowerCase();
        requireCondition(!aliases.has(alias), label + ' 使用了重复代号');
        aliases.add(alias);
        for (const field of OBSERVATIONS) {
            requireCondition(typeof person[field] === 'boolean', label + '.' + field + ' 必须填写 true 或 false');
        }
        requireCondition(!person.explainedFirstShop || person.sawFirstShop, label + ' 未看到首店，无法评估首店说明');
        requireCondition(!person.cleared01 || person.sawFirstShop, label + ' 首通 01 应已到达首店');
        requireCondition(!person.started02 || person.cleared01, label + ' 开始 02 前须首通 01');
        requireCondition(!person.started02Voluntarily || person.started02, label + ' 主动开 02 需要开始 02');
        requireCondition(!person.triedArcGunIn02 || person.started02, label + ' 在 02 试用电弧枪前须进入 02');
    }
    const noviceMix = countGate(people, 'newToRoguelikes', 1, 2);
    const unpromptedWave = countGate(people, 'wave1Unprompted', 3, 4);
    const firstShop = countGate(people.filter(person => person.sawFirstShop), 'explainedFirstShop', 2, 3);
    const voluntary02 = countGate(people.filter(person => person.cleared01), 'started02Voluntarily', 1, 2);
    const arcGunTrial = countGate(people.filter(person => person.started02), 'triedArcGunIn02');
    return {
        passed: [noviceMix, unpromptedWave, firstShop, voluntary02].every(gate => gate.passed),
        volunteers: people.length, noviceMix, unpromptedWave, firstShop, voluntary02, arcGunTrial,
    };
}

export function evaluateRecord(value, section = 'check') {
    requireCondition(['check', 'timing', 'cohort'].includes(section), '验收类型必须为 check、timing 或 cohort');
    const record = requireObject(value, '验收记录');
    const build = requireText(record.build, 'build');
    const timing = section === 'cohort' ? undefined : timingReport(record.timing);
    const cohort = section === 'timing' ? undefined : cohortReport(record.cohort);
    const passed = (timing?.passed ?? true) && (cohort?.passed ?? true);
    return { build, section, passed, ...(timing ? { timing } : {}), ...(cohort ? { cohort } : {}) };
}

function runCli(args) {
    const [section, path, volunteerCount] = args;
    requireCondition(path && ['init', 'check', 'timing', 'cohort', 'stage-row'].includes(section)
        && args.length <= (section === 'init' ? 3 : 2),
    '用法：node scripts/campaign-human-acceptance.mjs init|timing|cohort|check|stage-row 记录.json [志愿者人数（仅 init）]');
    if (section === 'init') {
        const record = createBlankRecord(volunteerCount === undefined ? 8 : Number(volunteerCount));
        writeFileSync(path, JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
        console.log('已创建待填写记录 ' + path);
        return 0;
    }
    const value = JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
    if (section === 'stage-row') {
        console.log(JSON.stringify(stageRowFromMarkers(value), null, 2));
        return 0;
    }
    const report = evaluateRecord(value, section);
    console.log(JSON.stringify(report, null, 2));
    return report.passed ? 0 : 1;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
    try {
        process.exitCode = runCli(process.argv.slice(2));
    } catch (error) {
        console.error(error.message);
        process.exitCode = 2;
    }
}
