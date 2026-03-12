# ACpilot

> 运行与联调说明（含 Tailscale 手机访问排障）见根目录 `README.md`。

## 命名说明
- **项目名**：ACpilot
- **命名意图**：一眼看出这是”基于 ACP 的移动端多 Agent 编排与远程 Coding 中枢”。

## 文档导航（可持续迭代）
1. `01_project_name_and_goals.md`：目标、边界与成功标准
2. `02_scope_and_principles.md`：范围与设计原则（含补充约束）
3. `03_architecture_and_daemon.md`：系统架构与 daemon 技术规范
4. `04_phase_plan_v2.md`：修订版分阶段计划（与原文结构对齐）
5. `05_agent_integration_matrix.md`：Codex/Claude/Copilot 能力矩阵与接入策略
6. `06_mobile_resilience_and_security.md`：移动端稳定性与安全模型
7. `07_mvp_non_mvp_and_acceptance.md`：MVP/非 MVP 与验收标准
8. `08_testing_and_iteration_governance.md`：测试策略与迭代治理机制

## 迭代维护规则
- 每次迭代先更新 `04_phase_plan_v2.md` 的阶段状态，再更新相关专题文档。
- 所有“新风险/新约束”先登记在 `08_testing_and_iteration_governance.md` 的风险台账，再决定是否进入当前迭代。
- 对 Agent 能力的任何认知变化，必须同步更新 `05_agent_integration_matrix.md`。

## 当前版本
- `v1`：基于原计划书 + 问题补充审查结果完成结构化拆分。
