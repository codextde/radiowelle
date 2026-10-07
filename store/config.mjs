import fs from 'node:fs';
import os from 'node:os';

const file = new URL('../credentials/store.json', import.meta.url);
const local = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};

export function setting(name, fallback) {
  const value = process.env[name] ?? local[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing ${name}: set it as an environment variable or in credentials/store.json (see store/README.md)`);
  }
  return value;
}

export function ascKey() {
  const id = setting('ASC_KEY_ID');
  const path = setting('ASC_KEY_PATH', `${os.homedir()}/.appstoreconnect/private_keys/AuthKey_${id}.p8`);
  return { id, issuer: setting('ASC_ISSUER_ID'), key: fs.readFileSync(path) };
}
