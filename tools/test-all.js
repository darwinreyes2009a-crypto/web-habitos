/* Compatibilidad CI: el workflow sigue llamando `node tools/test-all.js`.
   Con package.json type=module este fichero es ESM y delega al runner CJS. */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const result = spawnSync(process.execPath, [path.join(root, 'tools/test-all.cjs')], {
  cwd: root,
  stdio: 'inherit'
});
process.exit(result.status == null ? 1 : result.status);
