import { rm, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { resolve, join, dirname } from 'node:path';

const out = resolve('.m0-build');
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

for (const dir of ['platform', 'roguelite']) {
    const source = resolve('assets/scripts', dir);
    for (const name of await readdir(source)) {
        if (!name.endsWith('.ts')) continue;
        const body = await readFile(join(source, name), 'utf8');
        const js = stripTypeScriptTypes(body, { mode: 'transform' }).replace(
            /(\bfrom\s*['"])(\.\.?\/[^'"\r\n]+)(['"])/g,
            (_, start, path, end) => start + (/\.[a-z]+$/i.test(path) ? path : path + '.js') + end,
        );
        const dest = join(out, dir, name.slice(0, -3) + '.js');
        await mkdir(dirname(dest), { recursive: true });
        await writeFile(dest, js);
    }
}
