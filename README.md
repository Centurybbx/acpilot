# ACpilot

## 本地启动

```bash
pnpm install
pnpm --filter @acpilot/daemon dev
pnpm --filter @acpilot/web dev
```

## 手机通过 Tailscale 访问 Web

### 关键点
- Web dev server 不能只监听 loopback（`[::1]:5173` 或 `127.0.0.1:5173`）。
- 必须监听外部地址（`0.0.0.0` / `*` / `::`）才能被手机通过 Tailscale 访问。

### 推荐启动命令

```bash
pnpm --filter @acpilot/web exec vite --host 0.0.0.0 --port 5173 --strictPort
```

### 监听状态检查

```bash
lsof -nP -iTCP:5173 -sTCP:LISTEN
```

- 错误示例：`[::1]:5173`（只能本机访问）
- 正确示例：`*:5173` / `[::]:5173` / `0.0.0.0:5173`

### 手机访问地址

1. 先拿电脑 Tailscale IPv4：

```bash
tailscale ip -4
```

2. 在手机浏览器打开：

```text
http://<tailscale-ip>:5173
```

## Token 使用说明
- 在 Web 首屏粘贴 daemon 启动日志里的 `Initial token: <token>`。
- 输入纯 token 字符串，不要加 `Bearer ` 前缀。

## Agent 环境准备（端到端会话必需）

### Codex

```bash
pnpm install
pnpm --filter @acpilot/daemon add @zed-industries/codex-acp @zed-industries/claude-agent-acp
codex login status
```

- 不需要全局 `-g` 安装，daemon 会优先使用仓库内依赖里的可执行文件。
- `codex-acp` 找不到会导致 `Create Session` 失败。
- 可通过环境变量覆盖命令路径：

```bash
ACPILOT_CODEX_COMMAND=/absolute/path/to/codex-acp pnpm --filter @acpilot/daemon dev
```

### Claude

- 当前 daemon 默认优先使用仓库内 `@zed-industries/claude-agent-acp`。
- 未安装时才 fallback 到 `npx @zed-industries/claude-agent-acp`。

### Copilot

- 需本机已有 `copilot` 命令且支持 `--acp`。
- 可通过环境变量覆盖命令路径：

```bash
ACPILOT_COPILOT_COMMAND=/absolute/path/to/copilot pnpm --filter @acpilot/daemon dev
```

## 文档
- 详细设计与阶段计划见：[docs/README.md](./docs/README.md)
