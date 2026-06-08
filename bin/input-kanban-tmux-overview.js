#!/usr/bin/env node
import fs from 'node:fs';

const statePath = process.argv[2];

function readState() {
  if (!statePath) return null;
  try { return JSON.parse(fs.readFileSync(statePath, 'utf8')); }
  catch { return null; }
}

function countTasks(tasks = []) {
  return {
    total: tasks.length,
    pending: tasks.filter(task => task.status === 'pending').length,
    running: tasks.filter(task => task.status === 'running').length,
    completed: tasks.filter(task => task.status === 'completed').length,
    failed: tasks.filter(task => ['failed', 'unknown'].includes(task.status)).length,
    stopped: tasks.filter(task => task.status === 'stopped').length
  };
}

function line(label, value) {
  console.log(`${label.padEnd(12)} ${value}`);
}

const state = readState();
const now = new Date().toLocaleString();
console.log('Input Kanban tmux Overview');
console.log('='.repeat(32));
console.log(`Updated     ${now}`);

if (!state) {
  console.log('Waiting for run_state.json...');
  process.exit(0);
}

line('Run', state.runId || '-');
line('Label', state.label || '-');
line('Status', state.status || '-');
line('Repo', state.repo || '-');
console.log('');

const batches = Array.isArray(state.batches) ? state.batches : [];
const plannerStatus = state.planner?.status || 'pending';
const judgeStatus = state.judge?.status || 'pending';
console.log(`Special    planner=${plannerStatus} judge=${judgeStatus}`);
console.log(`Batches    ${batches.length}`);
console.log('');

if (!batches.length) {
  console.log('No worker batches materialized yet.');
  process.exit(0);
}

for (const [index, batch] of batches.entries()) {
  const tasks = Array.isArray(batch.tasks) ? batch.tasks : [];
  const counts = countTasks(tasks);
  console.log(`${index + 1}. ${batch.id || `batch-${index + 1}`}  ${batch.status || 'pending'}  maxParallel=${batch.maxParallel || '-'}  workers=${counts.total}`);
  console.log(`   completed=${counts.completed} running=${counts.running} pending=${counts.pending} failed=${counts.failed} stopped=${counts.stopped}`);
  for (const task of tasks) {
    const tmux = task.tmux?.ready ? ` window=${task.tmux.windowName || '-'} pane=${task.tmux.paneId || '-'}` : '';
    console.log(`   - ${task.id || '-'}  ${task.status || 'pending'}${tmux}`);
  }
  console.log('');
}
