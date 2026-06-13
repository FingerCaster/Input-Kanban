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

async function withPrependedPath(dir, fn) {
  const originalPath = process.env.PATH;
  process.env.PATH = `${dir}${path.delimiter}${originalPath || ''}`;
  try {
    return await fn();
  } finally {
    process.env.PATH = originalPath;
  }
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

test('resolveCodexLauncher maps bare Windows codex.cmd from PATH to codex.js', async () => {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'input-kanban-codex-launcher-path-'));
  const { codexJs } = await writeLocalCodexShim(tmp);
  const binDir = path.join(tmp, 'node_modules', '.bin');

  await withPrependedPath(binDir, async () => {
    const launcher = resolveCodexLauncher('codex.cmd');
    if (process.platform === 'win32') {
      assert.equal(launcher.command, process.execPath);
      assert.deepEqual(await Promise.all(launcher.argsPrefix.map(file => fsp.realpath(file))), [await fsp.realpath(codexJs)]);
    } else {
      assert.equal(launcher.command, 'codex.cmd');
      assert.deepEqual(launcher.argsPrefix, []);
    }
  });
});

test('resolveCodexLauncher leaves non-codex and oversized shims unresolved', async () => {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'input-kanban-codex-launcher-unmatched-'));
  const { shim } = await writeLocalCodexShim(tmp);
  const nonCodexShim = path.join(tmp, 'not-codex.cmd');
  const largeShim = path.join(tmp, 'large-codex.cmd');
  await fsp.copyFile(shim, nonCodexShim);
  await fsp.writeFile(nonCodexShim, '@ECHO off\r\nnode "%~dp0\\somewhere-else.js" %*\r\n');
  await fsp.writeFile(largeShim, `${'x'.repeat(70 * 1024)}@openai\\codex\\bin\\codex.js`);

  const nonCodexLauncher = resolveCodexLauncher(nonCodexShim);
  const largeLauncher = resolveCodexLauncher(largeShim);
  if (process.platform === 'win32') {
    assert.equal(nonCodexLauncher.command, nonCodexShim);
    assert.deepEqual(nonCodexLauncher.argsPrefix, []);
    assert.equal(largeLauncher.command, largeShim);
    assert.deepEqual(largeLauncher.argsPrefix, []);
  } else {
    assert.equal(nonCodexLauncher.command, nonCodexShim);
    assert.deepEqual(nonCodexLauncher.argsPrefix, []);
    assert.equal(largeLauncher.command, largeShim);
    assert.deepEqual(largeLauncher.argsPrefix, []);
  }
});

test('resolveCodexLauncher resolves default codex on the current platform', () => {
  const launcher = resolveCodexLauncher('codex');
  assert.equal(typeof launcher.command, 'string');
  assert.ok(launcher.command.length > 0);
  assert.ok(Array.isArray(launcher.argsPrefix));
});
