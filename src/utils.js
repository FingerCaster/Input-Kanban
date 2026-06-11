import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { version: PACKAGE_VERSION } = require('../package.json');

export const APP_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
export { PACKAGE_VERSION };
export const DEFAULT_REPO = path.resolve(process.env.KANBAN_DEFAULT_REPO || process.cwd());
export const RUNS_DIR = path.resolve(process.env.KANBAN_RUNS_DIR || path.join(process.env.HOME || APP_ROOT, '.input-kanban', 'runs'));
export const CODEX_BIN = process.env.KANBAN_CODEX_BIN || 'codex';
export const VALID_RUNNERS = ['headless', 'tmux'];

export function normalizeRunner(value = 'headless', source = 'KANBAN_RUNNER') {
  const runner = String(value || '').trim();
  if (VALID_RUNNERS.includes(runner)) return runner;
  throw new Error(`invalid ${source}: ${value}; expected one of: ${VALID_RUNNERS.join(', ')}`);
}

export const RUNNER = normalizeRunner(process.env.KANBAN_RUNNER || 'headless');

export async function ensureDir(dir) { await fsp.mkdir(dir, { recursive: true }); }
export function nowIso() { return new Date().toISOString(); }
export function safeIdPart(s) { return String(s || '').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'run'; }
export function makeRunId(label='run') {
  const ts = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  return `run_${ts}_${safeIdPart(label)}_${crypto.randomBytes(3).toString('hex')}`;
}
export async function readJson(file, fallback=null) {
  try { return JSON.parse(await fsp.readFile(file, 'utf8')); } catch { return fallback; }
}
export async function writeJsonAtomic(file, data) {
  await ensureDir(path.dirname(file));
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  await fsp.writeFile(tmp, JSON.stringify(data, null, 2));
  await fsp.rename(tmp, file);
}
export async function fileInfo(file) {
  try { const st = await fsp.stat(file); return { exists: true, size: st.size, mtimeMs: st.mtimeMs, mtime: st.mtime.toISOString() }; }
  catch { return { exists: false }; }
}
export async function readTextMaybe(file, maxBytes=200000) {
  try {
    const st = await fsp.stat(file);
    const start = Math.max(0, st.size - maxBytes);
    const fh = await fsp.open(file, 'r');
    try {
      const buf = Buffer.alloc(st.size - start);
      await fh.read(buf, 0, buf.length, start);
      return buf.toString('utf8');
    } finally { await fh.close(); }
  } catch { return ''; }
}
export function extractFirstJsonObject(text) {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [];
  if (fenced) candidates.push(fenced[1]);
  candidates.push(text);
  for (const c of candidates) {
    const start = c.indexOf('{');
    if (start < 0) continue;
    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < c.length; i++) {
      const ch = c[i];
      if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
      if (ch === '"') inStr = true;
      else if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (depth === 0) { try { return JSON.parse(c.slice(start, i + 1)); } catch {} } }
    }
  }
  return null;
}
export async function listRunDirs() {
  await ensureDir(RUNS_DIR);
  const entries = await fsp.readdir(RUNS_DIR, { withFileTypes: true });
  return entries.filter(e => e.isDirectory()).map(e => path.join(RUNS_DIR, e.name)).sort().reverse();
}
export function pathForRun(runId) { return path.join(RUNS_DIR, safeIdPart(runId)); }
export function roleDir(runDir, role, taskId=null) {
  if (role === 'worker') return path.join(runDir, 'workers', safeIdPart(taskId));
  return path.join(runDir, role);
}
export async function appendFileStream(stream, file) {
  await ensureDir(path.dirname(file));
  const ws = fs.createWriteStream(file, { flags: 'a' });
  stream.pipe(ws);
  return ws;
}
