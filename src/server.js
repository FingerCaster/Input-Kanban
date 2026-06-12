import http from 'node:http';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CodexAppServerClient } from './appServerClient.js';
import { APP_ROOT, DEFAULT_WORKSPACE, DEFAULT_REPO, PACKAGE_VERSION, RUNNER, RUNS_DIR } from './utils.js';
import { createRun, listRuns, startPlanner, dispatchRun, startJudge, refreshRun, readRunFile, readRunTaskText, markTaskCompleted, stopRun, archiveRun, renameRun, retryRun } from './orchestrator.js';
import { startAutoScheduler } from './scheduler.js';

const PUBLIC_DIR = path.join(APP_ROOT, 'public');

function send(res, status, body, type = 'application/json') {
  const data = type === 'application/json' ? JSON.stringify(body, null, 2) : body;
  res.writeHead(status, { 'Content-Type': `${type}; charset=utf-8` });
  res.end(data);
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text) return {};
  try { return JSON.parse(text); } catch { return { text }; }
}

function notFound(res) { send(res, 404, { error: 'not found' }); }
function methodNotAllowed(res) { send(res, 405, { error: 'method not allowed' }); }

async function serveStatic(req, res, pathname) {
  let file = pathname === '/' ? path.join(PUBLIC_DIR, 'index.html') : path.join(PUBLIC_DIR, pathname.replace(/^\/+/, ''));
  file = path.resolve(file);
  if (!file.startsWith(PUBLIC_DIR)) return notFound(res);
  try {
    const data = await fsp.readFile(file);
    const ext = path.extname(file);
    const type = ext === '.html' ? 'text/html' : ext === '.js' ? 'text/javascript' : ext === '.css' ? 'text/css' : ext === '.png' ? 'image/png' : ext === '.svg' ? 'image/svg+xml' : 'text/plain';
    res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` });
    res.end(data);
  } catch { notFound(res); }
}

async function handleApi(req, res, url, appClient) {
  const parts = url.pathname.split('/').filter(Boolean);
  try {
    if (req.method === 'GET' && url.pathname === '/api/health') {
      return send(res, 200, { ok: true, version: PACKAGE_VERSION, appRoot: APP_ROOT, runsDir: RUNS_DIR, defaultWorkspace: DEFAULT_WORKSPACE, defaultRepo: DEFAULT_REPO, runner: RUNNER });
    }
    if (parts[1] === 'runs' && parts.length === 2) {
      if (req.method === 'GET') return send(res, 200, { runs: await listRuns({ includeArchived: url.searchParams.get('includeArchived') === '1', workspace: url.searchParams.get('workspace') || '' }) });
      if (req.method === 'POST') {
        const body = await readBody(req);
        return send(res, 201, await createRun(body));
      }
      return methodNotAllowed(res);
    }
    if (parts[1] === 'runs' && parts.length >= 3) {
      const runId = parts[2];
      if (parts.length === 4 && parts[3] === 'status' && req.method === 'GET') return send(res, 200, await refreshRun(runId, appClient));
      if (parts.length === 4 && parts[3] === 'plan' && req.method === 'POST') return send(res, 202, await startPlanner(runId));
      if (parts.length === 4 && parts[3] === 'dispatch' && req.method === 'POST') return send(res, 202, await dispatchRun(runId));
      if (parts.length === 4 && parts[3] === 'judge' && req.method === 'POST') return send(res, 202, await startJudge(runId));
      if (parts.length === 4 && parts[3] === 'retry' && req.method === 'POST') {
        const body = await readBody(req);
        return send(res, 200, await retryRun(runId, body));
      }
      if (parts.length === 4 && parts[3] === 'stop' && req.method === 'POST') {
        const body = await readBody(req);
        return send(res, 200, await stopRun(runId, body));
      }
      if (parts.length === 4 && parts[3] === 'archive' && req.method === 'POST') {
        const body = await readBody(req);
        return send(res, 200, await archiveRun(runId, body));
      }
      if (parts.length === 4 && parts[3] === 'label' && req.method === 'PATCH') {
        const body = await readBody(req);
        return send(res, 200, await renameRun(runId, body));
      }
      if (parts.length === 4 && parts[3] === 'task-text' && req.method === 'GET') return send(res, 200, await readRunTaskText(runId), 'text/plain');
      if (parts.length === 6 && parts[3] === 'tasks' && parts[5] === 'file' && req.method === 'GET') {
        const text = await readRunFile(runId, parts[4], url.searchParams.get('name') || 'last_message.md');
        return send(res, 200, text, 'text/plain');
      }
      if (parts.length === 6 && parts[3] === 'tasks' && parts[5] === 'mark-completed' && req.method === 'POST') {
        const body = await readBody(req);
        return send(res, 200, await markTaskCompleted(runId, parts[4], body));
      }
    }
    notFound(res);
  } catch (e) {
    send(res, e.statusCode || 500, { error: e.message });
  }
}

export function createHttpServer({ appClient = new CodexAppServerClient() } = {}) {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url, appClient);
    return await serveStatic(req, res, url.pathname);
  });
}

export async function startServer({ host = process.env.HOST || '127.0.0.1', port = Number(process.env.PORT || 8787), log = true, scheduler = true } = {}) {
  const appClient = new CodexAppServerClient();
  const server = createHttpServer({ appClient });
  const autoScheduler = scheduler ? startAutoScheduler({ appClient, log }) : null;
  await new Promise(resolve => server.listen(port, host, resolve));
  const url = `http://${host}:${port}`;
  if (log) console.log(`input-kanban listening on ${url}`);
  const stop = async () => {
    autoScheduler?.stop();
    appClient.stop();
    await new Promise(resolve => server.close(resolve));
  };
  return { server, appClient, autoScheduler, host, port, url, version: PACKAGE_VERSION, defaultWorkspace: DEFAULT_WORKSPACE, defaultRepo: DEFAULT_REPO, runsDir: RUNS_DIR, runner: RUNNER, scheduler: !!autoScheduler, stop };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const instance = await startServer();
  const shutdown = () => { instance.stop().finally(() => process.exit(0)); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
