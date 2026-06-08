# Input Kanban

中文 | [English](README.en.md)

Input Kanban 是一个本地 Codex 编排看板。推荐通过 npm 安装，然后在目标代码仓库里运行 `input-kanban`，用浏览器管理任务拆分、并发执行和最终验收。

## 推荐使用方式

### 1. 安装

```bash
npm install -g input-kanban
```

验证安装：

```bash
input-kanban --help
```

### 2. 在目标仓库启动

进入你希望 Codex 修改或检查的代码仓库：

```bash
cd /path/to/your/repo
input-kanban
```

默认会启动本地服务：

```text
http://127.0.0.1:8787
```

打开浏览器访问这个地址即可使用看板。

### 3. 指定目标仓库启动

如果不想先 `cd` 到目标仓库，也可以显式指定：

```bash
input-kanban --repo /path/to/your/repo
```

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

- 目标仓库：启动 `input-kanban` 时的当前目录
- host：`127.0.0.1`
- port：`8787`
- runs 目录：`~/.input-kanban/runs`
- Codex 命令：`codex`
- runner：`headless`

`--runner` 当前支持 `headless` 和 `tmux`。默认行为保持 `headless`；`tmux` 会为每个 run 创建一个 `input-kanban-<runId>` session，并为 planner、每个 batch、final judge 创建独立 window。batch window 内包含 overview pane 和对应 worker panes。

tmux 模式仍由 Node.js 负责 batch barrier、`maxParallel`、final judge 顺序和 `judge_input.json` 生成。每个角色输出目录会写入 `run.sh` 和 `tmux.json`，状态继续由 `events.jsonl`、`stderr.log`、`last_message.md`、`exit_code` 和既有 artifact 文件驱动。tmux 角色命令完成后会先写入 `exit_code`，再保留 window，方便查看现场；需要关闭时由用户在 tmux 里手动退出。

tmux 模式是可选能力，主要用于在终端里实时查看每个 Codex 角色的执行过程。`codex exec` 当前属于非交互模式，默认不会弹出人工 approval；如果创建任务时选择 `danger-full-access`，表示显式放开 worker sandbox 限制，应只在受控测试仓库中使用。

看板会在 run 生成 tmux 元数据后显示 `复制tmux attach指令`。文件查看区域不再重复展示 tmux 终端信息；如需查看现场，请从批次详情顶部复制 attach 指令进入 tmux session。

## 在看板里如何使用

1. 点击 `新建任务批次`。
2. 输入批次名称、目标仓库、Worker 沙箱和任务说明。
3. 点击 `创建批次`。
4. 点击 `拆分任务`，让 Codex planner 生成 batches 和 workers。
5. 点击 `派发执行`，按 batch barrier 和并发限制运行 workers。
6. 查看执行日志、最终回复、错误日志和产物。
7. 所有 batch 完成后，点击 `汇总验收`。
8. 必要时可以停止或归档 run，也可以手动标记已确认完成的失败/未知 worker。

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

这些文件是本地运行记录，不需要提交到你的业务仓库。

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
