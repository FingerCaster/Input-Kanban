# Input Kanban

中文 | [English](README.md)

Input Kanban 是一个本地 Codex 编排看板。通过 npm 安装后运行 `input-kanban`，即可在浏览器里管理 planner、worker 和 final judge 的执行流程。

## 安装

```bash
npm install -g input-kanban
```

验证 CLI：

```bash
input-kanban --help
```

## 启动

在你希望 Codex 执行任务的目标仓库目录中运行：

```bash
cd /path/to/repo
input-kanban
```

然后打开：

```text
http://127.0.0.1:8787
```

也可以显式指定目标仓库：

```bash
input-kanban --repo /path/to/repo
```

## 常用参数

```bash
input-kanban --port 8787
input-kanban --host 127.0.0.1
input-kanban --runs-dir ~/.input-kanban/runs
input-kanban --codex-bin codex
input-kanban --open
```

默认值：

- 目标仓库：启动命令时的当前目录
- host：`127.0.0.1`
- port：`8787`
- runs 目录：`~/.input-kanban/runs`
- Codex 可执行文件：`codex`

## 它能做什么

- 根据用户输入的任务说明创建本地 run。
- 使用 `codex exec --json` 启动只读 planner。
- 按严格 batch barrier 和 `batch.maxParallel` 调度 worker。
- 跟踪本地进程、退出码、日志、最终回复和 artifact。
- 在最终验收前生成 `judge_input.json`，汇总所有 worker 结果。
- 所有 batch 完成后运行一次 final judge。
- 支持停止 run、软归档 run、手动标记 failed / unknown worker 为完成。
- 在看板里格式化展示 Codex JSONL 执行日志。

## 典型流程

1. 在目标仓库中启动 `input-kanban`。
2. 打开浏览器看板。
3. 输入任务说明并创建 run。
4. 点击 `拆分任务` 生成 batches 和 workers。
5. 点击 `派发执行` 运行 workers。
6. 查看日志、最终回复和 artifacts。
7. 所有 batch 完成后点击 `汇总验收`。
8. 必要时停止或归档 run。

## 运行数据

运行数据会保存到配置的 runs 目录：

```text
runs/<runId>/
├── task.md
├── plan.json
├── run_state.json
├── planner/
├── workers/<taskId>/
└── judge/
    ├── judge_input.json
    └── verdict.json
```

CLI 默认 runs 目录是：

```text
~/.input-kanban/runs
```

## 开发

```bash
git clone https://github.com/zhang3xing1/Input-Kanban.git
cd Input-Kanban
npm install
npm start
```

本地 CLI 开发：

```bash
npm link
input-kanban --help
```

检查：

```bash
npm run check
```

## 更多文档

- [项目实现说明](PROJECT_GUIDE.md)
- [环境变量](ENVIRONMENT.md)
