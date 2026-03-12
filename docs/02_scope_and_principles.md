# 02. 范围与原则（修订版）

## 1) 统一入口，不统一语义
- Web UI 统一承载 Codex / Claude / Copilot。
- 不强行做统一按钮语义，控件由 ACP 能力动态渲染。

## 2) 浏览器不直连 Agent
- 浏览器仅连接本机 daemon/coordinator。
- daemon 负责 Agent 进程生命周期与 ACP stdio 通信。

## 3) 安全与穿透优先
- 默认仅本机可访问。
- 远程访问必须同时满足：
  - 可信内网隧道（Tailscale / Cloudflare Tunnel）
  - 首次设备配对后建立长期信任关系

补充约束：
- 不把“每次打开都输入 token”当作正式产品路径，这只允许作为临时 bootstrap 手段。
- daemon 必须持久化认证密钥与 trusted device 列表，否则重启后信任关系丢失，无法满足移动端连续使用目标。

## 4) Slash command 原生化
- 仅展示 Agent 通过 `available_commands_update` 广告出来的命令。
- 客户端负责展示与发送，不重写命令语义。

## 5) workspace / tmux 是编排层能力
- `local/worktree/tmux` 由 daemon 编排。
- Agent 只接收 cwd/环境，不把编排层能力误当 ACP 核心语义。

## 6) 新增约束：`configOptions` 优先，`modes` 仅兼容路径
- 动态渲染优先读 `configOptions`。
- `modes` 仅作为兼容 fallback，并在实现中标记 deprecated。
- 需在版本计划中给出 fallback 移除条件。

## 7) 新增约束：移动端优先必须包含断连恢复
- 手机端断网/切网/后台冻结是常态，不是异常。
- 断连恢复能力不再后置，必须在底座阶段设计完成。
