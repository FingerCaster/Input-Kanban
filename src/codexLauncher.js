import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const MAX_SHIM_BYTES = 64 * 1024;
const WHERE_TIMEOUT_MS = 5000;

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
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size > MAX_SHIM_BYTES) return null;
    const text = fs.readFileSync(filePath, 'utf8');
    const shimJs = codexJsFromShim(filePath);
    if (shimJs && /(?:@openai[\\/]+codex|node_modules[\\/]+@openai[\\/]+codex)[\\/]+bin[\\/]+codex\.js/i.test(text)) return shimJs;
    return null;
  } catch {
    return null;
  }
}

function hasPathSeparator(value) {
  return path.isAbsolute(value) || value.includes(path.sep) || value.includes('/') || value.includes('\\');
}

function resolvePathCandidate(value) {
  if (/\.(?:c?js|mjs)$/i.test(value)) return { command: process.execPath, argsPrefix: [value] };
  const shimJs = readShimTarget(value);
  if (shimJs) return { command: process.execPath, argsPrefix: [shimJs] };
  return { command: value, argsPrefix: [] };
}

function whereCandidates(value) {
  const where = spawnSync('where.exe', [value], {
    encoding: 'utf8',
    timeout: WHERE_TIMEOUT_MS,
    windowsHide: true
  });
  return String(where.stdout || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
}

function resolveFromPath(value) {
  const seen = new Set();
  for (const candidate of whereCandidates(value)) {
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    const resolved = resolvePathCandidate(candidate);
    if (resolved.command !== candidate || fs.existsSync(candidate)) return resolved;
  }
  return null;
}

function resolveWindowsCodexLauncher(spec) {
  const value = String(spec || '').trim() || 'codex';
  if (hasPathSeparator(value)) return resolvePathCandidate(value);

  const pathResolved = resolveFromPath(value);
  if (pathResolved) return pathResolved;

  return resolvePathCandidate(value);
}

export function resolveCodexLauncher(spec = 'codex') {
  const value = String(spec || '').trim() || 'codex';
  if (/\.(?:c?js|mjs)$/i.test(value)) return { command: process.execPath, argsPrefix: [value] };
  if (process.platform === 'win32') return resolveWindowsCodexLauncher(value);
  return { command: value, argsPrefix: [] };
}
