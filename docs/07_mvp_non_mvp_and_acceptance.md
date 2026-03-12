# 07. MVP / 非 MVP 与验收标准（修订）

## 1) MVP 范围（收敛版）
### 必须完成
- 带“一次配对 + 长期设备信任”的本机 daemon，可托管 Codex/Claude/Copilot 三类 Agent
- 手机优先 Web UI：Agent 选择、workspace 选择、会话创建、prompt、流式响应、权限审批、raw logs
- Codex：完整闭环（动态控件 + slash palette + review/审批）

### 可用但不承诺完整
- Claude：动态控件 + slash + 权限审批（Beta）
- Copilot：基础 ACP 会话 + 动态能力探测（Beta）

## 2) 暂不纳入 MVP（沿用并补充）
- Copilot slash command 面板
- 跨 Agent 统一历史恢复/迁移
- “所有 Codex 内建 slash commands 全量可用”承诺
- tmux 取代 Agent 工具执行
- 复杂双列 Diff（手机端）

## 3) 验收标准
### 功能验收
- Codex 全链路 20+ 轮会话稳定通过
- Claude 与 Copilot 基础链路稳定通过
- 权限请求在 UI 上可准确审批并回传结果

### 稳定性验收
- 模拟断网恢复后，会话状态可恢复或明确降级
- Agent 进程异常退出后可自动恢复或明确告警

### 安全验收
- 未配对设备无法访问核心接口
- 已配对设备在 daemon 重启后仍可直接访问，不要求重新手输凭证
- 设备撤销后原设备无法继续访问核心接口
- 日志检查不存在明文密钥泄露
