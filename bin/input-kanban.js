#!/usr/bin/env node
import path from 'node:path';
import { spawn } from 'node:child_process';

function parseArgs(argv) {
  const args = { host: '127.0.0.1', port: undefined, repo: undefined, runsDir: undefined, codexBin: undefined, open: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => argv[++i];
    if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--open') args.open = true;
    else if (arg === '--no-open') args.open = false;
    else if (arg === '--host') args.host = next();
    else if (arg === '--port' || arg === '-p') args.port = Number(next());
    else if (arg === '--repo' || arg === '-r') args.repo = next();
    else if (arg === '--runs-dir') args.runsDir = next();
    else if (arg === '--codex-bin') args.codexBin = next();
    else throw new Error(`unknown argument: ${arg}`);
  }
  return args;
}

function printHelp() {
  console.log(`input-kanban

Usage:
  input-kanban [options]

Options:
  --host <host>          Host to bind, default 127.0.0.1
  -p, --port <port>      Port to bind, default 8787
  -r, --repo <path>      Default target repository, default current directory
  --runs-dir <path>      Runtime runs directory, default ~/.input-kanban/runs
  --codex-bin <path>     Codex CLI executable, default codex
  --open                 Open browser after starting
  --no-open              Do not open browser, default
  -h, --help             Show help
`);
}

function openBrowser(url) {
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  const child = spawn(command, args, { stdio: 'ignore', detached: true });
  child.unref();
}

try {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { printHelp(); process.exit(0); }
  if (args.port) process.env.PORT = String(args.port);
  if (args.host) process.env.HOST = args.host;
  if (args.repo) process.env.KANBAN_DEFAULT_REPO = path.resolve(args.repo);
  else if (!process.env.KANBAN_DEFAULT_REPO) process.env.KANBAN_DEFAULT_REPO = process.cwd();
  if (args.runsDir) process.env.KANBAN_RUNS_DIR = path.resolve(args.runsDir);
  if (args.codexBin) process.env.KANBAN_CODEX_BIN = args.codexBin;

  const { startServer } = await import('../src/server.js');
  const instance = await startServer({ host: process.env.HOST, port: Number(process.env.PORT || 8787), log: false });
  console.log('Input Kanban started');
  console.log(`URL:  ${instance.url}`);
  console.log(`Repo: ${instance.defaultRepo}`);
  console.log(`Runs: ${instance.runsDir}`);
  if (args.open) openBrowser(instance.url);
  const shutdown = () => { instance.stop().finally(() => process.exit(0)); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
} catch (error) {
  console.error(error.message || String(error));
  process.exit(1);
}
