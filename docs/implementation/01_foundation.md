# 阶段 1：项目脚手架 + 共享类型 + Daemon 骨架

## 目标

搭建 pnpm monorepo，定义共享类型，让 daemon 能启动并返回健康检查。

## 任务

### 1.1 初始化 monorepo

- 根目录 `pnpm-workspace.yaml`：声明 `packages/*`
- 根 `package.json`：scripts（`dev`, `build`, `test`）
- 根 `tsconfig.base.json`：strict 模式，paths alias

### 1.2 创建 `packages/shared`

定义三组核心类型：

**ACP 协议类型 (`types/acp.ts`)**

```ts
// ACP JSON-RPC 基础
interface AcpRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: Record<string, unknown>;
}
interface AcpResponse {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}
// ACP 事件（Agent -> Daemon）
interface AcpEvent {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown>;
}

// 能力快照
interface AgentCapabilities {
  configOptions?: ConfigOption[];
  modes?: Mode[];              // deprecated fallback
  commands?: SlashCommand[];
  permissions?: PermissionModel;
  supportsResume?: boolean;
  supportsLoad?: boolean;
}
interface ConfigOption {
  name: string;
  type: 'string' | 'boolean' | 'enum';
  values?: string[];
  default?: string;
  description?: string;
}
interface SlashCommand {
  name: string;
  description?: string;
  params?: string[];
}
```

**会话模型类型 (`types/session.ts`)**

```ts
type SessionStatus = 'initializing' | 'active' | 'suspended' | 'closed' | 'error';

interface Session {
  id: string;
  agentId: string;
  cwd: string;
  workspaceType: 'local' | 'worktree';
  status: SessionStatus;
  capabilities: AgentCapabilities;
  eventSeq: number;          // 用于断连补齐
  createdAt: number;
  lastActiveAt: number;
}
```

**Daemon API 类型 (`types/daemon-api.ts`)**

```ts
// REST 响应
interface ApiResponse<T> { ok: boolean; data?: T; error?: string; }

// WS 消息（Daemon -> 前端）
type WsMessage =
  | { type: 'agent:message'; sessionId: string; seq: number; content: AgentMessage }
  | { type: 'agent:status'; sessionId: string; status: SessionStatus }
  | { type: 'permission:request'; sessionId: string; request: PermissionRequest }
  | { type: 'capabilities:update'; sessionId: string; capabilities: AgentCapabilities }
  | { type: 'connection:status'; status: 'connected' | 'reconnecting' | 'disconnected' };

// WS 消息（前端 -> Daemon）
type WsClientMessage =
  | { type: 'permission:response'; sessionId: string; requestId: string; approved: boolean }
  | { type: 'session:resume'; sessionId: string; lastSeq: number };

interface AgentMessage {
  role: 'assistant';
  content: string;
  isStreaming?: boolean;
  toolCalls?: ToolCallInfo[];
}
interface PermissionRequest {
  id: string;
  description: string;
  filePath?: string;
  action: string;
}
```

### 1.3 创建 `packages/daemon` 骨架

**入口 (`src/index.ts`)**

```ts
// 读取配置 -> 启动 Fastify -> 注册路由 -> 启动 WS -> 监听端口
```

**服务 (`src/server.ts`)**

- Fastify 实例 + CORS（当前实现为全放开；后续需收敛到本机开发源 + 明确配置的隧道域名）
- 注册路由：
  - `GET /healthz` — 返回 `{ status: 'ok', uptime, agents: [...] }`
  - `GET /auth/state` — 返回当前是否已配对/是否已有 trusted device
  - `GET /agents` — 预留
- WS upgrade 处理（路径 `/ws`）

**配置 (`src/config.ts`)**

```ts
interface DaemonConfig {
  port: number;                // 默认 3141
  host: string;                // 默认 '127.0.0.1'
  authSecretPath: string;      // 服务端认证密钥的持久化路径
  trustedDevicesPath: string;  // 已信任设备列表
  agentConcurrencyLimit: number; // 默认 2
  sessionIdleTimeoutMs: number;  // 默认 30 分钟
  crashRestartLimit: number;     // 默认 3
}
```

认证基线修正：
- 不再把“每次启动打印 token，手机手工输入”当作长期方案。
- 若没有任何 trusted device，daemon 才进入 bootstrap 模式，允许首次配对。

### 1.4 创建 `packages/web` 骨架

- Vite + React 19 + TypeScript 项目
- 安装 Tailwind CSS
- 创建空白 `App.tsx`，确认 `pnpm dev` 可启动
- 配置 proxy 到 daemon（`vite.config.ts` 的 `server.proxy`）

## 完成标准

- `pnpm install` 无报错
- `pnpm build` 三个包都能编译
- daemon `pnpm dev` 启动后 `curl localhost:3141/healthz` 返回 200
- web `pnpm dev` 启动后浏览器可见空白页
