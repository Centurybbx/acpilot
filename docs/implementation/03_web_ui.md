# 阶段 3：前端骨架 + 聊天 UI + WS 连接

## 目标

实现手机优先的 Web UI，完成核心聊天交互、首次设备配对和 daemon 通信。UI 风格参考 `imgs/prototype.jpg`。

## 任务

### 3.1 Zustand Store 层

**`stores/connection.ts`** — WebSocket 连接状态

```ts
interface ConnectionStore {
  status: 'disconnected' | 'connecting' | 'connected' | 'reconnecting';
  reconnectProgress: number;    // 0-100，映射到顶部进度条
  lastSeqMap: Map<string, number>; // 每个 session 的最后消费序号

  connect(): void;
  disconnect(): void;
  // 内部：重连逻辑
}
```

**`stores/session.ts`** — 会话状态

```ts
interface SessionStore {
  currentSessionId: string | null;
  sessions: Session[];
  messages: Map<string, ChatMessage[]>; // sessionId -> messages
  pendingPermissions: PermissionRequest[];

  createSession(agentId: string, cwd: string): Promise<void>;
  sendPrompt(prompt: string): Promise<void>;
  cancelPrompt(): Promise<void>;
  respondPermission(requestId: string, approved: boolean): void;
}

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
  timestamp: number;
} | {
  id: string;
  role: 'permission';
  request: PermissionRequest;
  response?: 'allowed' | 'denied';
  timestamp: number;
};
```

**`stores/agents.ts`** — Agent 数据

```ts
interface AgentStore {
  agents: AgentDef[];
  capabilities: Map<string, AgentCapabilities>; // sessionId -> capabilities
  fetchAgents(): Promise<void>;
}
```

### 3.2 WebSocket Hook (`hooks/useWebSocket.ts`)

```ts
function useWebSocket() {
  // 基于已建立的设备会话连接 /ws
  // 收到消息后按 type 分发到对应 store
  // 断连时触发指数退避重连（1s/2s/4s/8s，上限 30s）
  // 重连成功后发送 session:resume 拉取漏掉的事件
  // 暴露 send 方法供 store 调用
}
```

### 3.2A 首次配对入口 (`App.tsx` / `components/auth/*`)

- 若 `GET /auth/state` 返回未配对：
  1. 展示配对申请页
  2. 提示用户去 daemon 终端查看 6 位配对码
  3. 在页面输入终端里的配对码
  4. 配对成功后写入长期设备会话并自动进入主界面
- 若已配对：直接进入主界面，不展示 token 输入页

### 3.3 AppShell 布局 (`components/layout/AppShell.tsx`)

参考原型，采用固定头尾 + 中间滚动的三段式布局：

```
┌──────────────────────────┐
│ 📁  ac-pilot-core  ⚙️    │  <- 顶栏：项目名 + 操作按钮
│ ◌ Reconnecting... 85%   │  <- 连接状态条（条件渲染）
├──────────────────────────┤
│                          │
│   聊天消息区（可滚动）     │  <- flex-1 overflow-y-auto
│                          │
├──────────────────────────┤
│ /explain /refactor ...   │  <- Slash 快捷按钮（横向滚动）
│ [Claude-3 ▾] [输入框  ➤] │  <- 底部输入区
│ ● Connected  Context: 12 │  <- 状态栏
└──────────────────────────┘
```

关键样式：
- 容器 `h-dvh flex flex-col`（使用 dvh 适配移动端地址栏）
- 顶栏 `sticky top-0`，高度固定
- 连接状态条：仅在非 `connected` 时显示，蓝色进度条 + 文字
- 底部区域 `sticky bottom-0`，不随聊天滚动

### 3.4 顶栏 (`components/layout/TopBar.tsx`)

- 左：文件夹图标（预留，MVP 无功能）
- 中：项目名称（当前 session 的 cwd 最后一段）+ 分支名（小字灰色）
- 右：设置齿轮图标（预留）

### 3.5 连接状态条 (`components/layout/ConnectionBar.tsx`)

- `reconnecting` 状态：蓝色进度条 + "Reconnecting to local daemon... {progress}%"
- `disconnected` 状态：红色背景 + "Disconnected" + 重连按钮
- `connected` 状态：隐藏

### 3.6 聊天视图 (`components/chat/ChatView.tsx`)

消息列表渲染，按时间顺序展示三种消息类型：

1. **Agent 消息 (`MessageBubble.tsx`)**：
   - 左对齐，灰色背景圆角气泡
   - 头像区域显示 "ACPILOT" 标签 + Agent 图标
   - 支持 markdown 渲染（代码块高亮）
   - 行内代码用 `monospace` 灰底样式

2. **用户消息 (`MessageBubble.tsx`)**：
   - 右对齐，蓝色背景白字圆角气泡
   - 右侧显示 "USER" 标签 + 用户图标

3. **权限审批卡片 (`PermissionCard.tsx`)**：
   - 内嵌在消息流中，不独占全屏
   - 卡片结构：
     - 锁图标 + "Permission Required" 标题
     - 描述文字："Allow ACpilot to modify local files in your workspace."
     - 文件路径预览区（灰底，文件图标 + 路径文字）
     - 两个按钮并排：Allow（蓝色实心）+ Deny（灰色描边）
   - 审批后按钮变为已审批状态文字

### 3.7 流式消息渲染 (`components/chat/StreamingMessage.tsx`)

- 接收 WS 增量内容，逐步追加到最后一条 assistant 消息
- 显示打字光标动画
- 滚动自动跟随最新内容（用户手动上滑则暂停跟随）

### 3.8 底部输入区 (`components/chat/ChatInput.tsx`)

参考原型底部区域：

- Slash 快捷按钮行：横向滚动的 pill 按钮（`/ explain`, `/ refactor`, `/ fix`, `/ test`）
  - 仅在 Agent 能力中有 `commands` 时渲染
  - 点击后自动填入对应 slash 命令到输入框
- 模型/配置选择器：下拉菜单，从 capabilities.configOptions 动态生成
- 输入框：`textarea` 自动增高，placeholder "Ask ACpilot anything..."
- 发送按钮：蓝色圆形，点击或回车发送

### 3.9 底部状态栏 (`components/layout/StatusBar.tsx`)

- 左：绿点 + "Local Engine: Connected"（或红点 + 状态文字）
- 右：蓝点 + "Context: N Files"（从会话能力中获取）

### 3.10 新建会话流程 (`components/session/NewSessionFlow.tsx`)

首次打开或无活跃会话时显示：

1. Agent 选择卡片列表（`AgentSelector.tsx`）
   - 每个 Agent 一张卡片，显示名称 + MVP 等级标签
2. Workspace 选择（`WorkspaceSelector.tsx`）
   - 输入绝对路径或从最近路径列表选择
   - 类型选择：local / worktree
3. 确认创建按钮

## 完成标准

- 手机浏览器访问页面，布局正常，无横向溢出
- 首次配对成功后再次打开页面无需重新认证
- 连接 daemon 后状态栏显示 "Connected"
- 断开 daemon 后自动重连，状态条显示重连进度
- 能完成：选择 Agent → 选择 workspace → 创建会话 → 发送消息 → 看到流式响应
- 权限卡片能正确显示并提交审批结果
