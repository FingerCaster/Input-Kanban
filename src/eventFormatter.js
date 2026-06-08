function formatKnownFields(obj, fields) {
  return fields
    .filter(field => obj[field] !== undefined && obj[field] !== null)
    .map(field => `  ${field}: ${typeof obj[field] === 'string' ? obj[field] : JSON.stringify(obj[field], null, 2)}`)
    .join('\n');
}

function formatJson(value) { return indentText(JSON.stringify(value, null, 2)); }
function indentText(text) { return String(text).split('\n').map(line => `  ${line}`).join('\n'); }
function truncateText(text, max = 12000) { return text.length > max ? `${text.slice(0, max)}\n...<已截断 ${text.length - max} 字符>` : text; }

function displayItemType(type) {
  return {
    command_execution: '命令执行',
    agent_message: '模型回复',
    agentMessage: '模型回复',
    reasoning: '推理',
    file_change: '文件变更',
    fileChange: '文件变更',
    mcp_tool_call: 'MCP 工具调用',
    mcpToolCall: 'MCP 工具调用'
  }[type] || type;
}

function formatCodexItem(seq, action, item = {}) {
  const type = item.type || 'unknown';
  const title = `[${seq}] ${action}: ${displayItemType(type)}`;
  if (type === 'command_execution') {
    const parts = [title];
    if (item.command) parts.push(`  命令: ${item.command}`);
    if (item.status) parts.push(`  状态: ${item.status}`);
    if (item.exit_code !== undefined && item.exit_code !== null) parts.push(`  退出码: ${item.exit_code}`);
    if (item.aggregated_output) parts.push(`  输出:\n${indentText(truncateText(item.aggregated_output))}`);
    return parts.join('\n');
  }
  if (type === 'agent_message' || type === 'agentMessage') {
    const text = item.text || item.message || item.content || '';
    return text ? `${title}\n  内容:\n${indentText(truncateText(String(text)))}` : title;
  }
  if (type === 'reasoning') {
    const summary = item.summary || item.content || '';
    return summary ? `${title}\n  摘要:\n${indentText(truncateText(Array.isArray(summary) ? summary.join('\n') : String(summary)))}` : title;
  }
  if (type === 'file_change' || type === 'fileChange') {
    return `${title}\n${formatKnownFields(item, ['status', 'path', 'changes'])}`.trimEnd();
  }
  return `${title}\n${formatJson(item)}`;
}

export function formatCodexEvent(seq, event) {
  switch (event.type) {
    case 'thread.started':
      return `[${seq}] Codex 会话开始\n  会话ID: ${event.thread_id || '-'}`;
    case 'turn.started':
      return `[${seq}] 回合开始`;
    case 'turn.completed':
      return `[${seq}] 回合完成\n${formatKnownFields(event, ['status', 'error', 'usage'])}`.trimEnd();
    case 'item.started':
      return formatCodexItem(seq, '开始', event.item);
    case 'item.completed':
      return formatCodexItem(seq, '完成', event.item);
    case 'error':
      return `[${seq}] 错误\n${formatJson(event)}`;
    default:
      return `[${seq}] ${event.type || '未知事件'}\n${formatJson(event)}`;
  }
}

export function formatCodexEventsJsonl(text) {
  if (!text.trim()) return '暂无事件日志。';
  const lines = text.split(/\r?\n/).filter(Boolean);
  return lines.map((line, index) => {
    const seq = String(index + 1).padStart(3, '0');
    let event;
    try { event = JSON.parse(line); }
    catch { return `[${seq}] 无法解析事件\n${line}`; }
    return formatCodexEvent(seq, event);
  }).join('\n\n');
}

export function formatCodexEventLine(line, index = 0) {
  const seq = String(index + 1).padStart(3, '0');
  try { return formatCodexEvent(seq, JSON.parse(line)); }
  catch { return `[${seq}] 无法解析事件\n${line}`; }
}
