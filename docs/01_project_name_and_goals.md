# 01. 项目目标与成功标准

## 1) 项目目标（沿用原文）
建设一套**手机优先的 Web UI**，通过本机常驻 daemon 接入多个 ACP Agent，实现对本地开发环境的远程操控。

首期接入：
- Codex（`codex-acp`）
- Claude（`claude-agent-acp` / `claude-code-acp`）
- Copilot CLI（`copilot --acp --stdio`）

核心原则：**UI 与 Agent 语义解耦**，页面能力由 ACP 实时探测驱动，不做固定硬编码按钮。

## 2) 补充后的成功标准
### 功能成功
- 可从手机端完成：选择 Agent、选择 workspace、创建会话、发送 prompt、流式查看响应、处理权限请求、查看 raw logs。

### 稳定性成功
- 手机网络抖动后可自动重连，且会话状态可恢复（按 Agent 实际能力降级处理）。
- daemon 与 Agent 子进程出现异常时可观测、可恢复、可告警。

### 安全成功
- daemon 默认不暴露公网，远程访问必须通过可信隧道，并完成一次设备配对。
- 同一手机/浏览器完成首次配对后，后续访问应自动复用已建立的信任关系，不要求反复手输凭证。

## 3) 关键边界
- 不做“统一三家 Agent 语义”。
- 不把 tmux 作为 Agent 工具执行后端。
- 不承诺 Copilot slash palette 在 MVP 可用。
