# 阶段 4：Agent 接入

## 目标

完成 Codex 完整闭环，Claude / Copilot 基础链路可用。

## 任务

### 4.1 Codex 完整闭环（GA）

Codex 是首个也是最完整的 Agent，需要验证整条链路：

**4.1.1 ACP 生命周期**

按顺序实现并测试：

```
initialize → 解析 capabilities → session/new → session/prompt → 流式接收 → session/cancel
```

- `initialize` 返回的 `capabilities` 存入会话级快照
- 验证 `configOptions` 字段能正确解析（mode, model 等）
- 验证 `available_commands_update` 事件能触发 UI 更新

**4.1.2 动态控件对接**

根据 `capabilities.configOptions` 动态渲染控件：

| configOption | 控件类型 | 行为 |
|---|---|---|
| `model` (enum) | 下拉选择器 | 展示可选模型列表 |
| `mode` (enum) | 下拉选择器 | 展示 auto/manual 等模式 |
| 布尔类型选项 | Toggle 开关 | 开/关切换 |

如果 `configOptions` 不可用，fallback 到 `modes` 字段。

**4.1.3 Slash Palette**

- 监听 `available_commands_update` 事件
- 将命令列表渲染为底部快捷按钮
- 点击按钮 → 将 `/<command>` 填入输入框 → 用户确认发送
- 用户也可手动在输入框输入 `/` 触发命令搜索

**4.1.4 权限审批闭环**

- Agent 发出权限请求事件 → daemon 转发 → 前端渲染 PermissionCard
- 用户点击 Allow/Deny → WS 发回 `permission:response` → daemon 调用 ACP 回传
- 需处理：用户长时间未审批时 Agent 可能超时的情况

**4.1.5 Review 流程（单列）**

Codex 的代码变更 review：
- 变更文件列表：简单列表展示文件路径 + 增/删行数
- 单文件 diff：单列 unified diff 展示（不做双列，手机屏幕不够）
- 每个变更可以 accept / reject

### 4.2 Claude 接入（Beta）

**4.2.1 基础会话链路**

- 使用 `npx @zed-industries/claude-code-acp` 启动
- 完成 `initialize → session/new → session/prompt → 流式` 链路
- 验证 capabilities 解析

**4.2.2 工具调用展示**

- Claude 的工具调用结果以折叠卡片形式展示在消息流中
- 展开可看工具名 + 输入参数 + 输出结果

**4.2.3 权限审批**

- 复用 Codex 的 PermissionCard 组件
- 验证 Claude 的权限请求格式与通用组件兼容

**4.2.4 Slash Commands**

- 监听 `available_commands_update`
- 动态渲染命令列表，复用 SlashPalette 组件

### 4.3 Copilot 接入（Beta）

**4.3.1 基础会话链路**

- 使用 `copilot --acp --stdio` 启动
- 完成 `initialize → session/new → session/prompt → 流式` 链路
- 记录 capabilities 实际返回值（Public Preview 可能不完整）

**4.3.2 能力探测降级**

- 如果 `configOptions` 为空 → 不渲染动态控件区域
- 如果无 `available_commands_update` → 隐藏 slash palette + 提示文字
- 记录所有探测结果到 debug 面板

**4.3.3 不纳入 MVP 的功能**

- Slash command 面板（需 `available_commands_update` 稳定后再评估）

### 4.4 Debug 面板 (`components/debug/LogViewer.tsx`)

提供一个可从设置入口进入的调试页面：

- 显示内容：
  - ACP initialize 握手原始结果
  - Agent capabilities 快照
  - 权限请求历史轨迹
  - Agent 进程退出原因 + 重启计数
  - Raw ACP JSON-RPC 日志流
- 数据来源：`GET /sessions/:id/logs`

## 完成标准

- **Codex**：能完成 20+ 轮会话，动态控件正确渲染，权限审批正常回传，slash 命令可用
- **Claude**：能创建会话、发送 prompt、收到流式响应、处理权限请求
- **Copilot**：能创建会话、发送 prompt、收到响应，缺失能力正确降级
- Debug 面板能查看所有三个 Agent 的 raw logs
