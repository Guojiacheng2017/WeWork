---
name: handoff-summary
description: Create a durable WeWork handoff artifact containing only the context the receiving owner needs.
---

# 协作交接

用 `wework_get_task_context` 核对当前状态和资料来源。交接内容只保留接手者继续工作所需的信息：已验证事实、相关文档、未决风险、工具需求和下一步。

用 `wework_save_output` 保存交接文档；任务完成时再用 `wework_submit_deliverable` 提交。需要另一位成员参与时必须调用 `wework_request_collaboration`，不要只输出一段声称已经交接的文字。
