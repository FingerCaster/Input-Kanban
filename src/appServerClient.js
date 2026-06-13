import { spawn } from 'node:child_process';
import readline from 'node:readline';
import { CODEX_BIN } from './utils.js';
import { resolveCodexLauncher } from './codexLauncher.js';

export class CodexAppServerClient {
  constructor() {
    this.proc = null;
    this.nextId = 1;
    this.pending = new Map();
    this.initialized = false;
    this.stderrTail = [];
  }

  start() {
    if (this.proc) return;
    const { command, argsPrefix } = resolveCodexLauncher(CODEX_BIN);
    this.proc = spawn(command, [...argsPrefix, 'app-server', '--stdio'], { stdio: ['pipe', 'pipe', 'pipe'] });
    const rl = readline.createInterface({ input: this.proc.stdout });
    rl.on('line', line => this.#handleLine(line));
    this.proc.stderr.on('data', d => this.#pushStderr(String(d)));
    this.proc.on('error', error => {
      for (const { reject } of this.pending.values()) reject(error);
      this.pending.clear();
      this.proc = null;
      this.initialized = false;
    });
    this.proc.on('exit', code => {
      for (const { reject } of this.pending.values()) reject(new Error(`app-server exited: ${code}`));
      this.pending.clear();
      this.proc = null;
      this.initialized = false;
    });
  }

  #pushStderr(s) {
    for (const line of s.split(/\r?\n/).filter(Boolean)) this.stderrTail.push(line);
    this.stderrTail = this.stderrTail.slice(-50);
  }

  #handleLine(line) {
    let msg;
    try { msg = JSON.parse(line); } catch { return; }
    if (!Object.prototype.hasOwnProperty.call(msg, 'id')) return;
    const p = this.pending.get(msg.id);
    if (!p) return;
    this.pending.delete(msg.id);
    if (msg.error) p.reject(new Error(JSON.stringify(msg.error)));
    else p.resolve(msg.result);
  }

  async request(method, params = null, timeoutMs = 15000) {
    this.start();
    const id = this.nextId++;
    const msg = { id, method };
    if (params !== null) msg.params = params;
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`app-server request timeout: ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve: v => { clearTimeout(timer); resolve(v); }, reject: e => { clearTimeout(timer); reject(e); } });
      this.proc.stdin.write(JSON.stringify(msg) + '\n');
    });
  }

  async ensureInitialized() {
    if (this.initialized) return;
    await this.request('initialize', {
      clientInfo: { name: 'codex-orchestrator-kanban', version: '0.1.0' },
      capabilities: { experimentalApi: true }
    });
    this.initialized = true;
  }

  async listThreads({ cwd, limit = 100, searchTerm = null } = {}) {
    await this.ensureInitialized();
    return await this.request('thread/list', {
      cwd: cwd || null,
      sourceKinds: ['exec', 'appServer'],
      limit,
      searchTerm,
      sortDirection: 'desc',
      sortKey: 'created_at'
    }, 20000);
  }

  stop() {
    if (!this.proc) return;
    this.proc.kill('TERM');
    this.proc = null;
  }
}

export function matchThreadToMarkers(thread, runId, taskId) {
  const preview = thread?.preview || '';
  return preview.includes(`ORCHESTRATOR_RUN_ID: ${runId}`) && preview.includes(`ORCHESTRATOR_TASK_ID: ${taskId}`);
}
