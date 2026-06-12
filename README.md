# Input Kanban

中文 | [English](README.en.md)

Input Kanban 是一个本地 Codex 编排看板。推荐通过 npm 安装，然后在目标工作区里运行 `input-kanban`，用浏览器管理任务拆分、并发执行和最终验收；如果工作区恰好是 Git 仓库，界面会额外标识出来。

## 推荐使用方式

### 1. 安装

```bash
npm install -g input-kanban
```

验证安装：

```bash
input-kanban --help
```

### 2. 在目标工作区启动

进入你希望 Codex 修改或检查的工作区：

```bash
cd /path/to/your/workspace
input-kanban
```

默认会启动本地服务：

```text
http://127.0.0.1:8787
```

打开浏览器访问这个地址即可使用看板。

### 3. 指定目标工作区启动

如果不想先 `cd` 到目标工作区，也可以显式指定：

```bash
input-kanban --workspace /path/to/your/workspace
```

`--repo` 仍可作为兼容别名使用。

## CLI 自动执行

如果希望从终端直接提交任务并自动推进，可以使用 `submit`。任务内容支持两种输入方式：

```bash
input-kanban submit --task-file task.md --label "修复登录问题"
input-kanban submit --task "修复登录问题，并补充回归测试" --label "修复登录问题"
```

`submit` 默认会创建任务批次、发起拆分、自动派发所有批次，并在全部完成后自动发起最终验收。默认 workspace 是当前目录；如果不传 `--label`，任务批次名称会从任务内容自动生成。它使用同一个 runs 目录，所以只要 8787 Web 看板也使用相同的 `--runs-dir`，CLI 创建的任务会在 Web 界面里可见。

`input-kanban serve` 会启动一个轻量后台 scheduler，持续刷新并推进未完成的 run：plan ready 后派发 batch、串行 batch 完成后启动下一批、全部 batch 完成后启动 final judge。CLI `submit --auto` / `input-kanban auto <runId>` 与 Web server 共用同一套 orchestrator 自动推进逻辑，因此任务推进不再依赖浏览器页面是否打开或刷新。

如果希望提交后立即返回，让任务在后台自动执行，可以加 `-d` / `--detach`：

```bash
input-kanban submit --task-file task.md -d
```

如果只想创建并拆分，不自动派发和验收，可以加 `--no-auto`。

常用参数：

```bash
input-kanban submit --task "修复登录问题"
input-kanban submit --task-file task.md --max-parallel 2 --worker-sandbox workspace-write
input-kanban submit --runs-dir ~/.input-kanban/runs --runner tmux -d
```

查看和停止：

```bash
input-kanban runs
input-kanban --json runs --active
input-kanban status
input-kanban status --watch
input-kanban status <runId> --watch
input-kanban --json status <runId>
input-kanban result
input-kanban result <runId> --copy
input-kanban --json result <runId>
input-kanban retry <runId> [taskId]
input-kanban --json retry <runId> [taskId]
input-kanban stop <runId>
```

`runs` 用来先列出可见任务批次，`runs --active` 只列出未进入终态或仍有子任务运行的批次，便于 agent 先发现 `runId`，再用 `status <runId>` 查详情。要只看某个工作区，可用 `input-kanban runs --workspace /path/to/workspace`；Web 左栏也提供了工作区筛选。不传 `runId` 时，`status` 和 `result` 默认查看最近一次任务批次。`result --copy` 会复制最终验收结果；`retry` 会保留失败现场并重试失败/未知任务；`--json` 适合给 agent/脚本做结构化读取；停止任务请显式传入 `runId`，避免误停。

## 常用启动参数

```bash
input-kanban --port 8787
input-kanban --host 127.0.0.1
input-kanban --runs-dir ~/.input-kanban/runs
input-kanban --codex-bin codex
input-kanban --runner headless
input-kanban --open
```

默认值：

- 工作区：启动 `input-kanban` 时的当前目录；创建批次时只要求它是一个存在的目录，若检测到 Git 会额外显示 Git 标识
- host：`127.0.0.1`
- port：`8787`
- runs 目录：`~/.input-kanban/runs`
- Codex 命令：`codex`
- runner：`headless`

`--runner` 当前支持 `headless` 和 `tmux`。默认行为保持 `headless`；`tmux` 会为每个 run 创建一个 `input-kanban-<runId>` session，并为 planner、每个 batch、final judge 创建独立 window。batch window 内包含 overview pane 和对应 worker panes。

tmux 模式仍由 Node.js 负责 batch barrier、`maxParallel`、final judge 顺序和 `judge_input.json` 生成。每个角色输出目录会写入 `run.sh` 和 `tmux.json`，状态继续由 `events.jsonl`、`stderr.log`、`last_message.md`、`exit_code` 和既有 artifact 文件驱动。tmux 角色命令完成后会先写入 `exit_code`，再保留 window，方便查看现场；需要关闭时由用户在 tmux 里手动退出。

如果当前使用的是 `--runner tmux`，中断并重新启动 `input-kanban serve` 不会中断正在执行中的 Codex 会话；tmux session 会继续运行，服务重启后 scheduler 会重新接管后续推进。若使用 `headless` runner，则不应假设服务重启对正在运行的子进程是安全的。

tmux 模式是可选能力，主要用于在终端里实时查看每个 Codex 角色的执行过程。`codex exec` 当前属于非交互模式，默认不会弹出人工 approval；如果创建任务时选择 `danger-full-access`，表示显式放开 worker sandbox 限制，应只在受控测试工作区中使用。

看板会在 run 生成 tmux 元数据后显示 `复制tmux attach指令`。文件查看区域不再重复展示 tmux 终端信息；如需查看现场，请从批次详情顶部复制 attach 指令进入 tmux session。

## 在看板里如何使用

1. 点击 `新建任务批次`。
2. 输入批次名称、工作区、Worker 沙箱和任务说明。
3. 点击 `创建批次`。
4. 看板会自动发起 `拆分任务`，让 Codex planner 生成 batches 和 workers。
5. 拆分完成后，Web 默认自动派发执行，按 batch barrier 和并发限制运行 workers。
6. 所有 batch 完成后，Web 默认自动发起 `汇总验收`。
7. 查看执行日志、最终回复、错误日志和产物。
8. 必要时可以停止或归档 run，也可以手动点击按钮重试、推进，或手动标记已确认完成的失败/未知 worker。

## 它适合做什么

- 把一个较大的 Codex 编程任务拆成多个 worker。
- 按批次阻塞关系控制执行顺序。
- 在本地观察每个 worker 的状态、日志和最终回复。
- 使用 tmux runner 时，在每个 batch window 中查看 overview pane 和 worker panes。
- 在所有 worker 完成后，让 final judge 汇总验收。
- 保留本地运行记录，便于排查和恢复。

## 运行数据保存位置

运行数据会保存到 runs 目录。CLI 默认位置是：

```text
~/.input-kanban/runs
```

每个 run 大致结构如下：

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

这些文件是本地运行记录，不需要提交到你的业务工作区。

## 使用前提

- 已安装 Node.js 20 或更高版本。
- 已安装并配置可用的 Codex CLI。
- 如需使用 `--runner tmux`，本机需要安装可用的 `tmux`。
- `codex` 命令能在终端中正常运行，或通过 `--codex-bin` 指定 Codex 可执行文件路径。

## 维护者开发

如果你要开发 Input Kanban 本身，而不是作为用户使用：

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
