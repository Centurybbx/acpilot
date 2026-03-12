# 06. 移动端稳定性与安全模型

## A. 移动端稳定性（新增核心设计）

### 1) 断连场景
- 切换 Wi-Fi/4G/5G
- 锁屏导致浏览器后台挂起
- 隧道短时抖动

### 2) 重连策略
- WebSocket 断开后指数退避重连（1s/2s/4s/8s，上限 30s）
- 重连成功后请求 daemon 会话快照与未消费事件
- UI 显示“重连中/已恢复/需人工恢复”三态

### 3) 会话恢复策略
- 优先 `session/resume`（若 Agent 支持）
- 次优 `session/load`
- 都不支持则进入“仅日志可读 + 需新建会话”降级路径

### 4) 流式一致性策略
- daemon 为每个会话维护递增事件序号
- 客户端断连后按最后序号拉取补齐事件，防止漏包

## B. 安全模型（补充细化）

### 1) 鉴权
- 主路径改为“首次配对一次，后续长期信任设备”，不再把短期 token 刷新作为默认交互
- 首次配对允许使用一次性配对码或本机确认，成功后 daemon 为该设备签发长期会话
- daemon 持久化：
  - 服务端认证密钥
  - trusted device 列表（`deviceId / deviceName / createdAt / lastSeenAt / revokedAt`）
- 浏览器侧持久化：
  - 优先 `HttpOnly` cookie
  - 若平台限制 cookie，可退化为本地保存 opaque device credential，但不暴露为可手动复制的 Bearer token
- 支持设备级撤销，不强行引入用户系统或 RBAC

### 2) 网络暴露
- 默认仅本机回环地址监听
- 远程连接通过 Tailscale/Cloudflare Tunnel 等可信通道
- 公网暴露需显式开关并强制告警提示

### 3) 审计与脱敏
- 所有管理 API 写审计日志（哪个设备、何时、做了什么）
- 日志中对密钥、Token、路径敏感片段做脱敏
- raw ACP logs 与审计日志分离存储
- 当前没有用户体系，审计粒度以 device/session 为准，不在文档中假定“多用户账号”能力

### 4) 速率与并发限制
- 会话创建、prompt 发送、权限审批都需 rate limit
- 单设备并发上限可配置，防止误操作和滥用

### 5) 现状修正
- 当前实现仍是短期 HMAC token，且 daemon 默认每次重启都会生成新的 `tokenSecret`，这会导致旧 token 全部失效。
- 当前模型仅适合开发期临时接入，不适合手机端长期连续使用；后续实现应按上面的 trusted device 模型替换。
