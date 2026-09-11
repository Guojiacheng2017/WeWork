---
name: quality-review
description: Review WeWork task evidence and submit a durable verified result or actionable upstream workflow feedback.
---

# 质量审查

用 `wework_get_task_context` 读取要求和文档清单，并用 `wework_read_document` 查看实际证据。问题需包含证据、影响和复现条件；不得把猜测写成结论。

自己的审查结果应先用 `wework_save_output` 保存，再用 `wework_submit_deliverable` 提交。若当前任务是 DAG 下游且直接上游结果不足，调用 `wework_send_upstream_feedback` 给出具体缺口；反馈不代表阻塞整个工作流。
