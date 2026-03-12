# 阶段 2：Daemon 核心功能

## 目标

完成 Agent 进程管理、ACP stdio 桥接、会话管理、设备信任认证。这是整个系统的核心中枢。

## 任务

### 2.1 一次配对式认证 (`src/auth/*`)

MVP 认证主路径改为“首次配对一次，后续长期信任设备”：

```ts
interface TrustedDevice {
  id: string;
  name: string;
  createdAt: number;
  lastSeenAt: number;
  revokedAt?: number;
  secretHash: string;
}

function loadOrCreateAuthSecret(): Promise<string>
function listTrustedDevices(): Promise<TrustedDevice[]>
function createPairingChallenge(deviceName?: string): Promise<{ challengeId: string; code: string; expiresAt: number }>
function completePairing(challengeId: string, code: string): Promise<{ deviceId: string; deviceSecret: string }>
function verifyDeviceSession(deviceId: string, deviceSecret: string): Promise<{ valid: boolean; revoked: boolean }>
```

- daemon 持久化服务端密钥与 trusted device store，保证 daemon 重启后信任关系不丢失
- 首次无设备时进入 bootstrap 配对模式；成功后浏览器获得长期会话
- Fastify 中间件：除 `/healthz` 与首次配对端点外，其余路由都要求设备已信任
- HTTP 与 WS 共用同一认证态，不再把长期凭证放进 URL query

说明：
- 当前仓库里已有 `src/auth/token.ts` 临时实现，但该方案会在 daemon 重启后失效，只适合开发期过渡。

### 2.2 Agent 注册表 (`src/agent/registry.ts`)

```ts
interface AgentDef {
  id: string;             // 'codex' | 'claude' | 'copilot'
  displayName: string;
  command: string;         // 启动命令，如 'codex-acp'
  args: string[];          // 启动参数
  env?: Record<string, string>;
  mvpLevel: 'ga' | 'beta';
}

const AGENT_REGISTRY: AgentDef[] = [
  { id: 'codex', displayName: 'Codex', command: 'codex-acp', args: [], mvpLevel: 'ga' },
  { id: 'claude', displayName: 'Claude', command: 'npx', args: ['@zed-industries/claude-code-acp'], mvpLevel: 'beta' },
  { id: 'copilot', displayName: 'Copilot', command: 'copilot', args: ['--acp', '--stdio'], mvpLevel: 'beta' },
];
```

- `getAgents()` — 返回可用 Agent 列表
- `getAgent(id)` — 查找单个 Agent 定义

### 2.3 Agent 进程管理 (`src/agent/process.ts`)

管理 Agent 子进程的完整生命周期：

```ts
class AgentProcess {
  readonly agentId: string;
  readonly pid: number;
  private process: ChildProcess;
  private restartCount: number;
  private status: 'starting' | 'running' | 'crashed' | 'stopped' | 'fused';

  // 启动子进程，绑定 stdio
  start(cwd: string): void
  // 安全关闭
  stop(): Promise<void>
  // 崩溃后自动重启（限次 + 指数退避）
  private handleCrash(exitCode: number): void
  // 超过重启上限 -> 熔断
  private fuse(): void
}
```

关键行为：
- `spawn` 使用 `{ stdio: ['pipe', 'pipe', 'pipe'] }`，捕获 stdout/stderr
- 崩溃重启：退避间隔 1s → 2s → 4s，超过 `crashRestartLimit` 进入熔断状态
- 熔断后拒绝新会话，需手动重置
- 空闲回收：无活跃会话超过 `sessionIdleTimeoutMs` 后自动 kill

### 2.4 ACP 桥接 (`src/agent/acp-bridge.ts`)

在 daemon 与 Agent 子进程的 stdio 之间建立 JSON-RPC 通信：

```ts
class AcpBridge {
  constructor(private process: AgentProcess)

  // 发送 JSON-RPC 请求并等待响应
  async request(method: string, params?: object): Promise<AcpResponse>

  // 发送 ACP 生命周期调用
  async initialize(): Promise<AgentCapabilities>
  async sessionNew(cwd: string, config?: object): Promise<{ sessionId: string }>
  async sessionPrompt(sessionId: string, prompt: string): Promise<void>
  async sessionCancel(sessionId: string): Promise<void>

  // 注册事件监听（Agent 主动推送）
  onEvent(handler: (event: AcpEvent) => void): void

  // 内部：stdin 写入、stdout 按行解析 JSON-RPC
  private write(data: AcpRequest): void
  private startReadLoop(): void
}
```

Stdio 解析策略：
- stdout 按 `\n` 分行，每行尝试 `JSON.parse`
- 有 `id` 的是 response，匹配 pending request
- 无 `id` 的是 event/notification，分发给事件监听器
- stderr 作为 raw log 存储

### 2.5 会话管理 (`src/session/manager.ts`)

```ts
class SessionManager {
  private sessions: Map<string, Session>;

  // 创建会话：校验 agent 可用 -> 启动/复用进程 -> ACP initialize -> session/new
  async create(agentId: string, cwd: string, workspaceType: string): Promise<Session>

  // 发送 prompt：校验会话存活 -> ACP session/prompt -> 流式转发到 WS
  async prompt(sessionId: string, prompt: string): Promise<void>

  // 取消会话中的操作
  async cancel(sessionId: string): Promise<void>

  // 获取会话信息
  get(sessionId: string): Session | undefined
  listActive(): Session[]

  // 处理权限审批回传
  async handlePermissionResponse(sessionId: string, requestId: string, approved: boolean): Promise<void>

  // 关闭会话
  async close(sessionId: string): Promise<void>
}
```

### 2.6 事件日志 (`src/session/event-log.ts`)

为每个会话维护有序事件队列，支持断连补齐：

```ts
class EventLog {
  private events: Map<string, IndexedEvent[]>; // sessionId -> events

  // 追加事件，自动分配递增序号
  append(sessionId: string, event: WsMessage): number

  // 从指定序号开始获取后续事件（断连补齐用）
  getAfter(sessionId: string, afterSeq: number): IndexedEvent[]

  // 获取最新序号
  getLatestSeq(sessionId: string): number
}

interface IndexedEvent {
  seq: number;
  timestamp: number;
  message: WsMessage;
}
```

### 2.7 WebSocket 处理 (`src/ws/handler.ts`)

```ts
class WsHandler {
  // 处理新连接：读取已建立的设备会话 -> 注册客户端
  handleConnection(ws: WebSocket, req: IncomingMessage): void

  // 广播会话事件到订阅该会话的客户端
  broadcastToSession(sessionId: string, message: WsMessage): void

  // 处理客户端消息（权限回传、断连恢复请求）
  handleClientMessage(ws: WebSocket, message: WsClientMessage): void

  // 客户端断开时清理订阅
  handleDisconnect(ws: WebSocket): void
}
```

### 2.8 注册 REST 路由

在 `server.ts` 中挂载完整路由：

| 方法 | 路径 | 功能 |
|---|---|---|
| `GET` | `/healthz` | 健康检查，无需鉴权 |
| `GET` | `/auth/state` | 返回当前设备认证状态 |
| `POST` | `/auth/pair/start` | 启动一次性配对挑战 |
| `POST` | `/auth/pair/complete` | 完成配对并建立长期设备会话 |
| `POST` | `/auth/logout` | 删除当前设备会话 |
| `GET` | `/agents` | 返回已注册 Agent 列表 |
| `POST` | `/sessions` | 创建会话（body: `{ agentId, cwd, workspaceType }`) |
| `POST` | `/sessions/:id/prompt` | 发送 prompt（body: `{ prompt }`) |
| `POST` | `/sessions/:id/cancel` | 取消当前操作 |
| `GET` | `/sessions/:id/logs` | 获取 raw ACP logs |

## 完成标准

- 启动 daemon 且无 trusted device 时，可完成首次配对
- 已配对设备调用 `GET /agents` 返回三个 Agent 定义
- 未配对设备调用核心接口返回 401
- `POST /sessions` 指定 Codex，能成功启动子进程并返回 session ID（需本机安装 codex-acp）
- WS 连接建立后能接收到会话事件流
