import test from 'node:test';
import assert from 'node:assert/strict';
import { formatCodexEventLine, formatCodexEventsJsonl } from '../src/eventFormatter.js';

test('formatCodexEventsJsonl formats known Codex events for human reading', () => {
  const text = [
    JSON.stringify({ type: 'thread.started', thread_id: 'thread-123' }),
    JSON.stringify({ type: 'turn.started' }),
    JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'hello' } })
  ].join('\n');

  const pretty = formatCodexEventsJsonl(text);

  assert.match(pretty, /Codex 会话开始/);
  assert.match(pretty, /会话ID: thread-123/);
  assert.match(pretty, /回合开始/);
  assert.match(pretty, /完成: 模型回复/);
  assert.match(pretty, /hello/);
});

test('formatCodexEventLine formats a single streaming JSONL event', () => {
  const pretty = formatCodexEventLine(JSON.stringify({ type: 'turn.completed', status: 'completed' }), 4);

  assert.match(pretty, /\[005\] 回合完成/);
  assert.match(pretty, /status: completed/);
});
