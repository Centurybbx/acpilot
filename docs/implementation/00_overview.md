# MVP 实现计划总览

## 目标

实现 ACpilot MVP：一个手机优先的 Web UI + 本机 daemon，通过 ACP 协议编排 Codex / Claude / Copilot 三个 Agent，完成远程 coding 闭环。

## 技术栈

| 层 | 选型 | 理由 |
|---|---|---|
| Daemon | TypeScript + Node.js 22+ | 与前端共享类型，stdio 桥接成本低 |
| HTTP/WS 框架 | Fastify + ws | 轻量、性能好、插件生态成熟 |
| 前端框架 | React 19 + Vite | 移动端 SPA，热更新快 |
| 状态管理 | Zustand | 轻量，适合中小规模状态 |
| 样式 | Tailwind CSS | 移动优先工具类，快速迭代 |
| 包管理 | pnpm workspace | daemon + web 共享类型包 |
| 测试 | Vitest + Testing Library | 项目惯用 |

## 仓库结构

```
acpilot/
├── packages/
│   ├── shared/              # 共享类型与常量
│   │   ├── src/
│   │   │   ├── types/
│   │   │   │   ├── acp.ts           # ACP 协议类型
│   │   │   │   ├── daemon-api.ts    # Daemon REST/WS API 类型
│   │   │   │   └── session.ts       # 会话模型类型
│   │   │   └── constants.ts
│   │   └── package.json
│   ├── daemon/              # Node.js 后端
│   │   ├── src/
│   │   │   ├── index.ts             # 入口
│   │   │   ├── server.ts            # Fastify + WS 服务
│   │   │   ├── auth/
│   │   │   │   └── token.ts         # Token 生成/校验/刷新
│   │   │   ├── agent/
│   │   │   │   ├── registry.ts      # Agent 注册表
│   │   │   │   ├── process.ts       # 子进程生命周期管理
│   │   │   │   └── acp-bridge.ts    # ACP stdio JSON-RPC 桥接
│   │   │   ├── session/
│   │   │   │   ├── manager.ts       # 会话 CRUD + 状态机
│   │   │   │   └── event-log.ts     # 事件序号 + 断连补齐
│   │   │   ├── ws/
│   │   │   │   └── handler.ts       # WebSocket 连接管理
│   │   │   └── config.ts            # 运行时配置
│   │   ├── __tests__/
│   │   └── package.json
│   └── web/                 # React 前端
│       ├── src/
│       │   ├── main.tsx
│       │   ├── App.tsx
│       │   ├── stores/
│       │   │   ├── connection.ts     # WS 连接 + 重连状态
│       │   │   ├── session.ts        # 当前会话状态
│       │   │   └── agents.ts         # Agent 列表 + 能力快照
│       │   ├── components/
│       │   │   ├── layout/
│       │   │   │   ├── AppShell.tsx          # 顶栏 + 状态栏 + 内容区
│       │   │   │   └── StatusBar.tsx         # 连接状态 + 上下文信息
│       │   │   ├── chat/
│       │   │   │   ├── ChatView.tsx          # 聊天主视图
│       │   │   │   ├── MessageBubble.tsx     # 消息气泡（Agent/User）
│       │   │   │   ├── ChatInput.tsx         # 输入框 + 发送按钮
│       │   │   │   └── StreamingMessage.tsx  # 流式渲染
│       │   │   ├── permission/
│       │   │   │   └── PermissionCard.tsx    # 权限审批卡片
│       │   │   ├── session/
│       │   │   │   ├── AgentSelector.tsx     # Agent 选择
│       │   │   │   ├── WorkspaceSelector.tsx # workspace 选择
│       │   │   │   └── NewSessionFlow.tsx    # 新建会话流程
│       │   │   ├── controls/
│       │   │   │   ├── SlashPalette.tsx      # Slash 命令面板
│       │   │   │   └── DynamicControls.tsx   # configOptions 动态控件
│       │   │   └── debug/
│       │   │       └── LogViewer.tsx         # Raw logs 查看
│       │   ├── hooks/
│       │   │   ├── useWebSocket.ts           # WS 连接 + 重连
│       │   │   ├── useSession.ts             # 会话操作
│       │   │   └── useReconnect.ts           # 断连恢复
│       │   └── lib/
│       │       └── api.ts                    # HTTP API 封装
│       ├── index.html
│       └── package.json
├── docs/
├── imgs/
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── package.json
```

## 实现阶段划分

共 5 个执行阶段，详见各阶段文档：

1. **`01_foundation.md`** — 项目脚手架 + 共享类型 + Daemon 骨架
2. **`02_daemon_core.md`** — Agent 进程管理 + ACP 桥接 + 会话管理
3. **`03_web_ui.md`** — 前端骨架 + 聊天 UI + WS 连接
4. **`04_agent_integration.md`** — Codex 完整闭环 + Claude/Copilot Beta 接入
5. **`05_resilience_and_polish.md`** — 断连恢复 + 安全加固 + 移动端体验优化

## UI 原型要点（基于 prototype.jpg）

原型展示了一个典型的移动端聊天界面：

- **顶栏**：项目名称（ac-pilot-core）+ 分支名（MAIN BRANCH）+ 文件浏览入口 + 设置入口
- **连接状态条**：显示 daemon 连接进度（如 "Reconnecting to local daemon... 85%"）
- **聊天区域**：Agent 消息（左侧灰底）和用户消息（右侧蓝底）交替显示
- **权限审批卡片**：内嵌在聊天流中，包含锁图标、文件路径预览、Allow/Deny 按钮
- **底部操作区**：
  - Slash 命令快捷按钮（/ explain, / refactor, / fix, / test）
  - 模型选择器（下拉 Claude-3）
  - 输入框 + 发送按钮
- **底部状态栏**：Local Engine 连接状态（绿点）+ 上下文文件数（Context: 12 Files）
