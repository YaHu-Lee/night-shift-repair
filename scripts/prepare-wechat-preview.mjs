import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const [input, output, extra] = process.argv.slice(2);
assert.equal(extra, undefined, 'Usage: node scripts/prepare-wechat-preview.mjs [release-directory] [new-preview-directory]');
const release = resolve(input ?? 'creator-m0/build/wechatgame-campaign-release');
const preview = resolve(output ?? 'creator-m0/build/wechatgame-campaign-preview');
assert.ok(release !== preview && !preview.startsWith(release + sep), 'Use a separate preview directory');

const checker = fileURLToPath(new URL('./check-campaign-distribution.mjs', import.meta.url));
function check(path, ...flags) {
    const result = spawnSync(process.execPath, [checker, '--platform', 'wechat', ...flags, path], {encoding:'utf8'});
    if (result.status !== 0) throw new Error(result.stderr || result.error?.message || 'Package validation failed');
    return result.stdout;
}

check(release);
await mkdir(dirname(preview), {recursive:true});
await mkdir(preview).catch(error => {
    if (error.code === 'EEXIST') throw new Error('Preview directory already exists. Choose a new output directory: ' + preview);
    throw error;
});
await cp(release, preview, {recursive:true, force:false});
const path = join(preview, 'src', 'settings.json');
const settings = JSON.parse(await readFile(path, 'utf8'));
settings.launch.nightShiftMockRewardedVideo = true;
await writeFile(path, JSON.stringify(settings) + '\n');
console.log('WeChat preview:', preview);
console.log(check(preview, '--wechat-preview'));
