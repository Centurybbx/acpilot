# 04. 分阶段计划（V2 修订）

> 在原 0~6 阶段基础上补齐可执行产物、风险控制与并行策略。

## 阶段 0：方案冻结与能力矩阵
### 目标
把“能做什么、谁来做、哪些不承诺”冻结为可执行文档。

### 必交付
- 三家 Agent 能力矩阵（来自真实 `initialize` 与运行时探测）
- Daemon 技术选型决议（语言、协议、进程模型）
- 移动端信息架构草图（一级/二级控件分层）
- 协议兼容策略：`configOptions` 优先、`modes` fallback 退场规则

## 阶段 1：ACP 基座与 Daemon
### 目标
完成稳定宿主层和可持续复用的认证链路。

### 必交付
- Daemon v0：进程托管 + ACP stdio 桥接 + 一次配对式设备信任 + raw logs
- Agent Registry：Codex / Claude / Copilot
- 会话模型：`agent, cwd, workspaceType, tmuxBinding, capabilitySnapshot`
- **新增**：断连重连与会话恢复机制（移动端必备）

## 阶段 2：动态 UI 骨架
### 目标
前端按能力生长，适配手机交互。

### 必交付
- 动态渲染规则：`configOptions` 主路径，`modes` 仅兼容
- 核心页面：新建会话、聊天、动态控制区、slash palette、logs 入口
- workspace 选择：local / worktree 绝对路径映射
- 权限审批 UI 与 ACP 权限请求一一映射

## 阶段 3：Codex 接入（首个完整闭环）
### 目标
Codex 成为首个生产可用 Agent。

### 必交付
- 完整会话链路：创建、prompt、取消、流式、审批
- 动态控制能力对接（mode/model/permissions）
- slash palette（仅展示真实广告命令）
- 手机单列顺序 review/审批闭环（含大变更性能保护）

## 阶段 4：Claude 接入（可与阶段 3 并行）
### 目标
在不重造工具链前提下接入 Claude。

### 必交付
- 会话、工具调用、权限请求、背景终端对接
- slash commands 动态发现与发送
- 项目级自定义命令/插件能力作为增强项，不阻塞 MVP

## 阶段 5：Copilot 接入
### 目标
纳入统一框架，保持“动态探测，不预设控件”。

### 必交付
- 基础 ACP 会话可用（new/prompt/stream/cancel）
- 能力探测驱动控件渲染
- 记录握手与能力边界（Public Preview 能力验证，不按黑盒假设开发）
- slash palette 不进 MVP（仅在 `available_commands_update` 稳定后评估）

## 阶段 6：移动端体验完善
### 目标
从“可用”提升到“可连续使用”。

### 必交付
- Chat / Review / Files / Terminal 四区切换优化
- worktree 与 session 绑定可视化
- tmux companion（attach/create/detach）
- 故障恢复、日志导出、排障路径闭环
