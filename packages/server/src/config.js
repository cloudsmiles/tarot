import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = resolve(HERE, '..');

// 仅支持本配置用到的 YAML 子集：两级缩进、标量、整行/行尾注释、引号值
function parseSimpleYaml(text) {
  const root = {};
  let section = null;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/^\s*#.*$/, '').replace(/\s+#.*$/, '');
    if (!line.trim()) continue;
    const indent = line.match(/^\s*/)[0].length;
    const m = line.trim().match(/^([\w.-]+):\s*(.*)$/);
    if (!m) continue;
    let [, key, rawValue] = m;
    let value = rawValue.trim().replace(/^["']|["']$/g, '');
    if (/^\d+$/.test(value)) value = Number(value);
    if (indent === 0) {
      if (rawValue.trim() === '') {
        root[key] = {};
        section = root[key];
      } else {
        root[key] = value;
        section = null;
      }
    } else if (section) {
      section[key] = value;
    }
  }
  return root;
}

function loadRaw() {
  const path = process.env.TAROT_CONFIG
    ? resolve(process.env.TAROT_CONFIG)
    : join(SERVER_DIR, 'config.yaml');
  if (!existsSync(path)) return { path, yaml: {} };
  return { path, yaml: parseSimpleYaml(readFileSync(path, 'utf8')) };
}

const { path: CONFIG_PATH, yaml } = loadRaw();

export const config = {
  configPath: CONFIG_PATH,
  port: Number(yaml.port ?? 8787),
  dataDir: yaml.dataDir ? resolve(SERVER_DIR, String(yaml.dataDir)) : join(SERVER_DIR, 'data'),
  ark: {
    apiKey: String(yaml.ark?.apiKey ?? ''),
    baseUrl: String(yaml.ark?.baseUrl ?? 'https://ark.cn-beijing.volces.com/api/plan/v3'),
    model: String(yaml.ark?.model ?? 'ark-code-latest'),
  },
};
