// Re-applies fullBleed to the bundled logos in place (idempotent).
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fullBleed } from './lib/logo.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../assets/logos');
let changed = 0;
for (const country of await readdir(root)) {
  const dir = path.join(root, country);
  for (const file of (await readdir(dir)).filter((f) => f.endsWith('.webp'))) {
    const out = await fullBleed(await readFile(path.join(dir, file)));
    if (!out) continue;
    await writeFile(path.join(dir, file), out);
    changed++;
  }
}
console.log(`full-bleed applied to ${changed} logos`);
