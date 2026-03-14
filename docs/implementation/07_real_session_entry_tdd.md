# 07. 真实会话入口与恢复链路 TDD 计划

## 目标

把当前前端空态里的占位 UI 替换成真实可用的会话创建与恢复链路，并用 red/green TDD 逐步补齐：

- 无活跃会话时，进入真实 `NewSessionFlow`
- 已有会话时，侧边栏展示真实 session 列表并支持切换
- 刷新或重连后，active session 能通过 HTTP + WS 完成 hydration / subscribe / resume
- 顶栏展示真实项目名与分支信息
- 提供 raw logs 可见入口

## 不在本轮范围

- 图片附件 / 文件上传
- 文件系统浏览器
- 预 session 的通用 model 选择器
- 非 active 历史会话持久化

## 交付原则

1. 每个阶段先写失败测试，再实现到通过
2. 优先接通真实链路，不保留误导性的 mock 交互
3. 尽量复用现有 store / API / ACP 抽象，不平行造新状态
4. 所有新增 UI 继续保持移动端优先

## 阶段拆分

### 阶段 1：真实空态入口

问题：当前 `App.tsx` 空态仍挂着不可用的 home 输入框，`NewSessionFlow` 已实现但未接线。

交付：

- `App` 空态进入 `AppShell(mode="home") + NewSessionFlow`
- `NewSessionFlow` 成为唯一真实的新建入口
- session store 增加 hydration / select / new-session-view 所需 action
- 新建成功后切回 chat 态

测试先行：

- `App` 在 paired 且无 current session 时渲染 `NewSessionFlow`
- store hydrate/select 行为符合预期

### 阶段 2：恢复语义与订阅链路

问题：当前 WS 只在 socket open 时发 `session:resume`；新建 session 后不会自动订阅；`session:restored` / `session:expired` 没有真正消费。

交付：

- 增加显式 session subscribe 消息，避免把新建 session 误判为 restored
- socket 初次打开时对已 hydration session 执行 resume
- socket 打开后新增 session 自动 subscribe
- store 消费 `session:restored` / `session:expired`
- App 只在收到真实 restored 事件时展示 toast

测试先行：

- `useWebSocket` 对新增 session 发送 subscribe
- store 正确处理 restored / expired
- WS handler 接受 subscribe 且不触发 restore 逻辑

### 阶段 3：真实 session 列表与 HTTP hydration

问题：侧边栏仍是硬编码，daemon 虽然有 `listActive()` 但未暴露 HTTP。

交付：

- daemon 新增 `GET /sessions`
- web 新增 `fetchSessions()`
- paired 成功后先 hydrate active sessions，再建立 WS
- 侧边栏展示真实 session 列表、当前高亮、点击切换、支持进入新建页

测试先行：

- daemon `GET /sessions` 返回 active sessions
- sidebar 渲染真实 session 列表并触发切换
- App 初始加载会调用 session hydration

### 阶段 4：会话元数据与顶栏清理

问题：顶栏项目名 fallback 是原型残留，branch 永远显示 `MAIN BRANCH`。

交付：

- shared `Session` 增加 `branch?: string`
- daemon 创建 session 时探测 git branch，失败则安全降级
- 顶栏显示真实 project name / branch；无 branch 时不显示占位文案

测试先行：

- session manager 创建 session 时携带 branch
- 顶栏在有无 branch 两种情况下都正确渲染

### 阶段 5：快捷预设与 raw logs 入口

问题：原 home 卡片是假交互，`LogViewer` 也是死代码。

交付：

- 去掉 `Debug CLI` / `Write Docs` 快捷卡片，保留可编辑的 starter prompt
- 创建 session 时若填写 starter prompt，则自动发送首条 prompt
- 在 shell 中给当前 session 增加 raw logs 入口

测试先行：

- 点击预设会填充 starter prompt
- 创建 session 时会自动发送 starter prompt
- 当前 session 可打开 raw logs 视图

## 建议执行顺序

1. 阶段 1
2. 阶段 2
3. 阶段 3
4. 阶段 4
5. 阶段 5
6. 全量回归测试与收尾提交

## 完成标准

- 无活跃会话时，看不到假输入框，只能走真实创建流程
- 刷新页面后，active session 能恢复到真实列表并继续接收消息
- 新建第二个 session 后，无需重连即可收到其流式消息
- 顶栏不再显示 `ac-pilot-core` / `MAIN BRANCH` 这类假数据
- raw logs 在 UI 中有可点击入口
- web / daemon 相关测试全部通过
