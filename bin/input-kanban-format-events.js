#!/usr/bin/env node
import readline from 'node:readline';
import { formatCodexEventLine } from '../src/eventFormatter.js';

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
let index = 0;

rl.on('line', line => {
  if (!line.trim()) return;
  console.log(formatCodexEventLine(line, index++));
  console.log('');
});
