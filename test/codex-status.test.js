import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'input-kanban-codex-status-'));
const codexStub = path.join(tmp, 'codex-stub.js');
await fsp.writeFile(codexStub, '#!/usr/bin/env node\nconsole.log("codex-cli 1.2.3");\n');
await fsp.chmod(codexStub, 0o755);
const npmStub = path.join(tmp, 'npm');
await fsp.writeFile(npmStub, '#!/usr/bin/env node\nprocess.exit(42);\n');
await fsp.chmod(npmStub, 0o755);
process.env.PATH = `${tmp}${path.delimiter}${process.env.PATH || ''}`;

const { detectCodexInfo } = await import(`../src/utils.js?codex-status=${Date.now()}`);

test('detectCodexInfo reports local codex status without npm registry lookup by default', async () => {
  const info = await detectCodexInfo(codexStub);

  assert.equal(info.installed, true);
  assert.equal(info.installedVersion, '1.2.3');
  assert.equal(info.latestCheckEnabled, false);
  assert.equal(info.latestVersion, null);
  assert.equal(info.updateAvailable, false);
});
