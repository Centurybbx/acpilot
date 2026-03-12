# 03. 系统架构与 Daemon 技术规范

## 1) 分层架构
`Mobile Web UI -> Local Daemon -> ACP Agent Process (stdio)`

- UI 层：移动端交互、状态展示、权限审批入口
- Daemon 层：会话编排、进程托管、设备信任、日志、重连恢复
- Agent 层：Codex/Claude/Copilot 的 ACP Server 能力

## 2) Daemon 技术选型（冻结建议）
> 用于解决“原计划未指定技术栈”的关键缺口。

- 语言：**TypeScript (Node.js 22+)**
- 浏览器通信：**WebSocket（主） + HTTP（管理/健康检查）**
- Agent 通信：**stdio + JSON-RPC (ACP)**
- 进程管理：`child_process.spawn` + 受控重启 + 指数退避

理由：
- 对 CLI 进程托管和 stdio 桥接成本最低；
- 与前端 TypeScript 共享类型；
- 便于快速落地 MVP 并迭代。

## 3) Daemon 责任边界
- 启停 Agent 子进程
- 执行 ACP 生命周期：`initialize / session/new / session/prompt / session/cancel / session/load(可选)`
- 维护会话映射：`agent + sessionId + cwd + workspaceType + tmuxBinding`
- 鉴权与审计：设备配对、会话校验、访问日志、脱敏日志
- 可观测性：raw ACP logs、错误码、退出码、重连事件

## 4) 进程与资源策略
- 并发上限：每类 Agent 进程可配置上限（默认 1~2）
- 崩溃恢复：限次自动拉起（例如 3 次），超限进入熔断
- 空闲回收：会话空闲超时后回收子进程（可配置）
- 当前资源保护以“并发上限 + 崩溃熔断 + 空闲回收”为主；CPU/内存阈值降级暂不写入基线设计，避免文档超前于实现

## 5) Daemon API 最小集合
- `GET /auth/state`
- `POST /auth/pair/start`
- `POST /auth/pair/complete`
- `POST /auth/logout`
- `GET /agents`
- `POST /sessions`
- `POST /sessions/{id}/prompt`
- `POST /sessions/{id}/cancel`
- `GET /sessions/{id}/logs`
- `GET /healthz`

说明：
- HTTP 与 WebSocket 认证应共享同一设备会话，不再把长期凭证放在 URL query 中。
- 启动日志打印的一次性配对码可以保留，但仅用于首次绑定设备，不作为长期访问凭证。

## 6) 调试面板要求
- 初始化握手结果
- 能力探测结果（configOptions / commands / permissions）
- 权限请求轨迹
- 进程退出原因与重启计数
