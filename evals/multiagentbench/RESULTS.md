# WeWork × MultiAgentBench 首次小样本运行结果

状态：真实模型小样本链路已跑通；不是生产 DAG 全部实现，也不是官方 benchmark 得分。

## 完成内容

- 下载并固定 MultiAgentBench research 第 1 条原始任务，保留全部五名 agent 的 profile、源版本、哈希和上游许可。
- 新增可重复运行的 smoke runner：现有 WeWorkService → RuntimeManager → Pi RPC → run-bound WeWork 工具 → 文档提交 → 持久化读取。
- 显式阶段依赖为 review → proposals → critique → refinement → synthesis。五名助手在同一隔离团队中分别执行；依赖由测试 runner 调度，尚未接生产 DAG 启动器或 UI。
- 五份成果保留为 submitted，没有由模型自动批准；新状态和原有用户团队隔离。
- 基础工具接入真实 smoke 通过；相关 Pi/WeWork 工具 26 项测试通过。首次沙箱测试因 loopback listen EPERM 失败，允许本地测试端口后重跑通过。

## 两轮实测

| 运行目录（UTC） | 成功阶段 | 阶段执行总时长 | Pi total tokens（含缓存） |
| --- | --- | --- | --- |
| 2026-09-11T16-39-36-406Z | 5/5 | 129.8 秒 | 260,857 |
| 2026-09-11T16-42-18-893Z | 5/5 | 131.1 秒 | 361,570 |

使用 Pi 本机默认模型，实际 native session 记录为 `deepseek/deepseek-v4-flash-vision-exp`。tokens 是 Pi 报告的累计输入、输出及缓存口径，不是美元成本，也不是唯一上下文长度。两轮输出具有随机性，不能据此做统计显著性或因果收益结论。

## 发现并修正的接入问题

第一轮只给每位助手自己的角色资料和上游成果。第三名把自己的 profile 当成第二名所引用的 profile，错误否定 BSD/DP-SAD 的来源；第四名继续接受了这一错误。这是一个来源归属不清引起的共同偏航实例。

第二轮新增按 agent 标记的完整共享来源目录、作者明确的上游标题、要求分页读完资料，并修正导出/交接的长文分页。独立检查确认五名助手都完整读取共享目录；第三名明确确认 agent2 的 profile 包含上述两项方法，本次没有复现该项错误。此修正位于 benchmark 适配器，不等于生产系统已经具备通用来源追踪。

## 检查与边界

- 两轮均五阶段成功、成果持久化、依赖顺序合法、最终五问标题齐全，且没有自动接受成果。
- 独立 verifier 重新读取业务状态和 checkpoints，确认导出文件与提交全文一致、每个上游成果完整传给下游；第二轮来源目录读取检查全部通过。
- 未运行官方 judge、未接官方全部工具环境，文献综述限制在原始输入；因此只能称 adapted integration smoke。
- 成果语义尚未通过：例如第二轮 Question 1 除问题外还有额外说明，未严格满足原任务“只输出一个问题”；正文将部分输入摘要称为 verified literature，仍不能视为外部文献验证。一些技术论断也需专业核查。
- 人工查看指出具体问题，不等同于建立了自动语义评分器。原始输出保留，不后改美化。
- 四档权限、Adaptive、ARC、生产 DAG 调度、经营报告压力测试和视频写作交付均未因本次 smoke 而宣称完成。

## 下一步

将相同样本接入现有生产 DAG 启动/依赖推进路径，复用这次证据格式；增加独立内容验收，再扩至少量不同任务。经营报告用于后续长程压力测试，视频写作用于真实交付，不阻塞这次链路验证。

## 文件

运行方法见 README.md；每轮证据位于 runs/ 对应目录（默认 git 忽略，保留本地）。原始失败表现和修正后证据分别保存，不能只展示成功轮次。

## Phase 1 更新：生产 DAG 路径真实运行

新增 `app-runtime/src/host/workflow-executor.js` 和 `run-production.mjs`。已通过生产 `saveWorkflow` / `startWorkflow` 创建五个关联工作，由生产 `inputBindings` 传递成果，Host 执行器根据持久 run 状态推进。没有手动排列助手执行循环，也没有由 benchmark 手工复制上游输出。

实测目录：`runs/production-2026-09-11T17-16-29-413Z`。五个节点全部 completed，五份成果仍 submitted、reviews 为空；全文和 sourceNodeId/sourceWorkId/sourceDocumentId 全部校验通过；总耗时 111.2 秒，Pi 报告 total tokens 为 371,061（含缓存，不是计费金额）。最终五问格式存在，Question 1 本轮只包含一个问题；这不是科学结论正确性或官方评分证明。

9 项新执行器测试覆盖依赖传递、成功无提交、失败/取消阻断、失联不重放、重建 Runtime 恢复、重复 tick、其他 run 冒充提交，以及用户明确验收后仍可推进。另有 26 项既有 Pi/工具回归测试。

生产边界：这是可由 Host 显式调用的执行模块，尚未挂到聊天入口、UI 或新的 Host endpoint；不会默默启用后台自动执行。现有 completeCurrent 只协调选中图，因此模块要求目标图当前被选中，切图时拒绝推进；多图后台推进需要后续服务改造。四档授权/Adaptive/ARC 不在本次实现内。最终验收与阶段完成分离，明确人工验收允许推进但不会由执行器生成。

本轮实测加载的是添加“已验收也可推进”分支前的执行器；该后续分支由新增回归测试覆盖，本轮实际全部走 submitted 路径，未重跑相同模型样本。
