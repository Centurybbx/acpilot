# 阶段 5：断连恢复 + 安全加固 + 移动端体验

## 目标

从"能用"到"可靠地在手机上连续使用"。

## 任务

### 5.1 断连恢复

**5.1.1 WebSocket 重连**

已在阶段 3 实现基础重连，此处完善：

- 区分三种断连原因：网络抖动 / 锁屏后台冻结 / daemon 重启
- 重连成功后行为：
  1. 发送 `session:resume`，携带 `lastSeq`
  2. Daemon 从 EventLog 拉取缺失事件，批量推送
  3. 前端按序号排序合并到消息列表
  4. UI 显示"已恢复"提示 toast

**5.1.2 会话恢复**

根据 Agent 能力分三级处理：

| Agent 能力 | 恢复策略 | 用户感知 |
|---|---|---|
| 支持 `session/resume` | 调用 resume，继续会话 | 无缝恢复 |
| 支持 `session/load` | 新进程 + load 历史 | 短暂加载后恢复 |
| 都不支持 | 仅日志可读 + 提示新建 | 明确降级提示 |

**5.1.3 UI 三态显示**

连接状态条的三态映射：

- "Reconnecting to local daemon... {progress}%"（蓝色进度条）
- "Session restored"（绿色 toast，2s 后消失）
- "Session expired — Start a new session"（黄色卡片 + 新建按钮）

### 5.2 安全加固

**5.2.1 设备信任生命周期**

- 首次配对成功后，前端持久化长期设备会话，不再依赖短期 token 自动刷新
- daemon 重启后，已配对设备应保持可用
- 用户可在设置页手动“忘记此设备”，daemon 也可撤销指定 trusted device
- 当前代码仍是 sessionStorage + refresh token 过渡实现；文档基线已调整为 trusted device 模型

**5.2.2 审计日志**

- Daemon 所有管理 API 调用写入审计日志文件
- 格式：`[timestamp] [method] [path] [client_ip] [result]`
- 日志中的 Token、路径敏感段做 `***` 脱敏

**5.2.3 速率限制**

在 Fastify 中用插件添加 rate limit：

| 端点 | 限制 |
|---|---|
| `POST /sessions` | 5 次/分钟 |
| `POST /sessions/:id/prompt` | 30 次/分钟 |
| `POST /auth/pair/start` | 5 次/分钟 |
| `POST /auth/pair/complete` | 10 次/分钟 |

### 5.3 移动端体验优化

**5.3.1 键盘适配**

- 输入框聚焦时 `visualViewport` 监听，自动调整布局避免键盘遮挡
- 发送消息后保持键盘不收起（连续对话体验）

**5.3.2 滚动行为**

- 新消息自动滚动到底部
- 用户手动上滑后暂停自动滚动，底部出现 "↓ New messages" 按钮
- 点击按钮跳回最新

**5.3.3 手势**

- 下拉刷新（预留，可触发会话恢复检查）
- 消息长按复制

**5.3.4 暗色模式**

- 跟随系统 `prefers-color-scheme`
- Tailwind dark 变体配置

## 完成标准

- 断开 Wi-Fi 再恢复，聊天记录完整无丢失，UI 显示恢复状态
- 锁屏 30s 后解锁，WS 自动重连 + 事件补齐
- 未配对设备调用任何核心 API 返回 401
- daemon 重启后已配对设备仍可访问
- 高频调用触发 429 rate limit
- 手机键盘弹出时聊天区域正常可见
- 连续 20 轮对话滚动行为正确
