---
name: task-dispatch
description: Dispatch scoped WeWork collaboration and turn executable work into clear owner, dependency, input, and output assignments.
---

# 任务分解与调度

先用 `wework_get_team` 和 `wework_get_task_context` 确认成员、目标与已有资料。协作必须调用 `wework_request_collaboration`，文字中的 `@` 不等于已派发。

只把接手人需要的信息、文档和工具交给他。工作范围内群发使用 `targetEmployeeId="work"`，仅工作牵头人或团队负责人可用；`targetEmployeeId="all"` 仅团队负责人可用。工具未成功返回时，不得声称已经派发。
