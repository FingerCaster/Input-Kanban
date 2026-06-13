import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { resolveCodexLauncher } from '../src/codexLauncher.js';

async function writeLocalCodexShim(root) {
  const binDir = path.join(root, 'node_modules', '.bin');
  const codexDir = path.join(root, 'node_modules', '@openai', 'codex', 'bin');
  await fsp.mkdir(binDir, { recursive: true });
  await fsp.mkdir(codexDir, { recursive: true });
  const shim = path.join(binDir, 'codex.cmd');
  const codexJs = path.join(codexDir, 'codex.js');
  await fsp.writeFile(shim, '@ECHO off\r\nnode "%~dp0\\..\\@openai\\codex\\bin\\codex.js" %*\r\n');
  await fsp.writeFile(codexJs, 'console.log("codex");\n');
  return { shim, codexJs };
}

test('resolveCodexLauncher runs explicit JS launchers through node on Windows', async () => {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'input-kanban-codex-launcher-js-'));
  for (const ext of ['js', 'cjs', 'mjs']) {
    const script = path.join(tmp, `codex-stub.${ext}`);
    await fsp.writeFile(script, 'console.log("codex");\n');
    const launcher = resolveCodexLauncher(script);
    if (process.platform === 'win32') {
      assert.equal(launcher.command, process.execPath);
      assert.deepEqual(launcher.argsPrefix, [script]);
    } else {
      assert.equal(launcher.command, script);
      assert.deepEqual(launcher.argsPrefix, []);
    }
  }
});

test('resolveCodexLauncher maps local Windows npm codex.cmd shim to codex.js', async () => {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'input-kanban-codex-launcher-bin-'));
  const { shim, codexJs } = await writeLocalCodexShim(tmp);
  const launcher = resolveCodexLauncher(shim);
  if (process.platform === 'win32') {
    assert.equal(launcher.command, process.execPath);
    assert.deepEqual(launcher.argsPrefix, [codexJs]);
  } else {
    assert.equal(launcher.command, shim);
    assert.deepEqual(launcher.argsPrefix, []);
  }
});

test('resolveCodexLauncher resolves default codex on the current platform', () => {
  const launcher = resolveCodexLauncher('codex');
  assert.equal(typeof launcher.command, 'string');
  assert.ok(launcher.command.length > 0);
  assert.ok(Array.isArray(launcher.argsPrefix));
});
