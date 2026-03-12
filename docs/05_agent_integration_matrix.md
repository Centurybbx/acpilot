# 05. Agent 能力矩阵与接入策略

## 1) 矩阵字段定义
- 会话生命周期：new/load/prompt/cancel/resume
- 动态配置：configOptions / modes
- 命令发现：available_commands_update
- 权限模型：权限请求事件 + 审批回传
- 流式更新：消息增量与状态更新
- 会话恢复：断连后 resume/load 可用性

## 2) 当前策略矩阵（计划基线）
| Agent | 接入命令 | MVP 等级 | slash palette | 备注 |
|---|---|---|---|---|
| Codex | `codex-acp` | GA（完整） | 是（仅广告命令） | 首个闭环基线 |
| Claude | `@zed-industries/claude-agent-acp` 或 `@zed-industries/claude-code-acp` | Beta | 是（动态发现） | 以 SDK 原生行为优先 |
| Copilot | `copilot --acp --stdio` | Beta | 否（MVP 外） | Public Preview，按实测能力落地 |

## 3) 接入实施顺序
1. Codex：验证完整闭环，沉淀通用编排与 UI 抽象
2. Claude：验证二号 Agent 的兼容性，修正抽象过拟合
3. Copilot：验证 Public Preview 能力边界并降级实现

## 4) 能力探测落地规范
- 每次会话创建后都缓存 capability snapshot（会话级）
- UI 只依据 snapshot 与增量更新渲染
- 不允许预置“想当然控件”

## 5) 风险与降级
- 若某 Agent 不发送 `available_commands_update`：
  - UI 隐藏 slash palette
  - 文案提示“当前 Agent 未暴露命令面板能力”
- 若某 Agent 不支持 `configOptions`：
  - 仅在兼容路径中读取 `modes`
