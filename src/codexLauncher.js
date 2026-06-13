import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

function existingPath(filePath) {
  return fs.existsSync(filePath) ? filePath : null;
}

function codexJsCandidatesFromShim(shimPath) {
  const dir = path.dirname(shimPath);
  return [
    path.join(dir, 'node_modules', '@openai', 'codex', 'bin', 'codex.js'),
    path.join(dir, '..', '@openai', 'codex', 'bin', 'codex.js')
  ];
}

function codexJsFromShim(shimPath) {
  for (const candidate of codexJsCandidatesFromShim(shimPath)) {
    const found = existingPath(candidate);
    if (found) return found;
  }
  return null;
}

function readShimTarget(filePath) {
  try {
    if (/codex\.js$/i.test(filePath)) return filePath;
    const text = fs.readFileSync(filePath, 'utf8');
    const shimJs = codexJsFromShim(filePath);
    if (shimJs && /(?:@openai[\\/]+codex|node_modules[\\/]+@openai[\\/]+codex)[\\/]+bin[\\/]+codex\.js/i.test(text)) return shimJs;
    return null;
  } catch {
    return null;
  }
}

function isPathLike(value) {
  return path.isAbsolute(value) || value.includes(path.sep) || value.includes('/') || value.includes('\\') || /\.(?:cmd|bat|ps1|c?js|mjs)$/i.test(value);
}

function resolveWindowsCodexLauncher(spec) {
  const value = String(spec || '').trim() || 'codex';
  if (isPathLike(value)) {
    if (/\.(?:c?js|mjs)$/i.test(value)) return { command: process.execPath, argsPrefix: [value] };
    const shimJs = readShimTarget(value);
    if (shimJs) return { command: process.execPath, argsPrefix: [shimJs] };
    return { command: value, argsPrefix: [] };
  }

  if (value.toLowerCase() !== 'codex') return { command: value, argsPrefix: [] };

  const where = spawnSync('where.exe', [value], { encoding: 'utf8' });
  const candidates = String(where.stdout || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const seen = new Set();
  for (const candidate of candidates) {
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    const shimJs = readShimTarget(candidate);
    if (shimJs) return { command: process.execPath, argsPrefix: [shimJs] };
    if (fs.existsSync(candidate)) return { command: candidate, argsPrefix: [] };
  }

  return { command: value, argsPrefix: [] };
}

export function resolveCodexLauncher(spec = 'codex') {
  if (process.platform === 'win32') return resolveWindowsCodexLauncher(spec);
  return { command: String(spec || 'codex').trim() || 'codex', argsPrefix: [] };
}
