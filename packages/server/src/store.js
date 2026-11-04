import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync, renameSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { config } from './config.js';

const DATA_DIR = config.dataDir;
const ID_BYTES = 8;

export function createShare(record) {
  mkdirSync(DATA_DIR, { recursive: true });
  const payload = JSON.stringify({ ...record, createdAt: new Date().toISOString() });
  for (;;) {
    const id = randomBytes(ID_BYTES).toString('base64url');
    const file = join(DATA_DIR, `${id}.json`);
    if (existsSync(file)) continue;
    const tmp = join(DATA_DIR, `.${id}.${process.pid}.tmp`);
    try {
      writeFileSync(tmp, payload, { encoding: 'utf8', flag: 'wx' });
      renameSync(tmp, file);
      return id;
    } catch (e) {
      if (e.code === 'EEXIST') continue;
      throw e;
    }
  }
}

export function getShare(id) {
  if (!/^[A-Za-z0-9_-]{8,32}$/.test(id)) return null;
  const file = join(DATA_DIR, `${id}.json`);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}
