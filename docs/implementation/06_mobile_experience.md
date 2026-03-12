# 阶段 6：移动端体验完善

## 目标

从“可用”提升到“可连续使用”。重点优化移动端的多任务切换体验，完善 Review 与 Troubleshooting 闭环，并增加 Tmux 伴侣能力。

## 任务

### 6.1 移动端四区导航 (Mobile Navigation)

将目前的单一聊天视图扩展为四区切换，适配移动端底部导航习惯。

**6.1.1 底部导航栏 (`components/layout/BottomNav.tsx`)**

-固定在屏幕底部，包含四个 Tab：
  - **Chat**: 现有聊天界面
  - **Review**: 代码变更审查 (`ReviewFlow`)
  - **Files**: 文件树浏览 (Placeholder for now)
  - **Terminal**: Tmux 会话控制
- 状态联动：
  - Chat 图标显示未读数徽标
  - Review 图标显示待审查变更数

**6.1.2 视图状态管理 (`stores/ui.ts`)**

- 新增 UI Store 管理当前激活 Tab
- 保持各视图状态（切换 Tab 不丢失滚动位置或输入内容）

### 6.2 Review 流程闭环

后续接入 Review 数据流；当前不要在文档中假定 `ReviewFlow` 已经接好。

**6.2.1 数据源对接**

- 监听 Agent 的 `tool_call` (如 `apply_change`) 或特定事件
- 解析 diff 数据并存入 `SessionStore` 的 `pendingChanges`
- 在 Review Tab 中渲染 `ReviewFlow`

**6.2.2 交互闭环**

- 用户点击 Accept/Reject -> 发送 `tool_result` 或对应指令给 Agent
- 变更合并后自动清除 Review 列表项

### 6.3 Tmux 伴侣 (Tmux Companion)

为移动端提供稳定的终端控制能力，不依赖 Agent 的执行环境。

**6.3.1 协议扩展 (`packages/shared`)**

- `Session` 接口增加 `tmuxSessionId?: string` 字段
- `Daemon` 新增 API：`POST /sessions/:id/tmux/attach`，`POST /sessions/:id/tmux/detach`

**6.3.2 Daemon 实现**

- 使用 `node-pty` 或类似库对接本地 tmux 命令
- 管理 tmux session 生命周期（与 ACP session 绑定或独立）
- 提供简单的输入/输出流转发到 WebSocket

**6.3.3 前端终端组件 (`components/terminal/TmuxView.tsx`)**

- 使用 `xterm.js` 渲染终端内容
- 移动端适配：虚拟键盘辅助栏（Ctrl, Esc, Tab, Arrows）
- 手势支持：滑动滚动，双指缩放

### 6.4 故障排查与日志 (Troubleshooting Loop)

补齐 `LogViewer` 到排障流程的接线；当前仅有组件，不应在设计文档中表述为已集成。

**6.4.1 设置/调试入口**

- TopBar 右侧设置按钮 -> 打开 Settings Modal
- Settings 中包含：
  - "View Raw Logs" -> 进入 `LogViewer`
  - "Export Debug Info" -> 导出当前会话快照 JSON

**6.4.2 故障恢复引导**

- 当检测到 Agent 频繁崩溃或协议错误时，主动弹出 Troubleshooting 提示
- 提供 "Restart Agent" 和 "Download Logs" 快捷操作

### 6.5 Worktree 可视化

在 TopBar 增强显示当前上下文。

- 显示当前 Git Branch / Worktree 名称
- 点击标题可弹出 Worktree 切换列表 (如 daemon 支持)
- 明确标识当前环境是 `Local` 还是 `Worktree`

## 完成标准

1.  **导航**: 手机端可流畅切换 Chat/Review/Terminal，状态保持。
2.  **Review**: 能在手机上完成代码变更的 Accept/Reject 操作。
3.  **Tmux**: 能连接到与会话绑定的 tmux session 并执行简单命令。
4.  **排障**: 发生问题时，用户能方便地导出日志用于反馈。
