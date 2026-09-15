# DAG 页面与运行服务接口约定 — V2.1.0

状态：V2.1.0 DAG 页面主路径已完成隔离 Electron + Host + Pi 联调（2026-09-12）。当前范围仅 DAG 页面，派活/session 设计暂停。

## 权威状态与已有读取

Renderer 使用现有 weworkApi / weworkStore，Host 通过 weworkCall(method,args) 与 POST /v1/wework/call。snapshot/hydrate 恢复持久状态，Runtime events 与 wework.updated 触发更新；不另造页面级业务数据库。

参与节点关联真实 employeeId、workItemId 和所在 workflow/node。查询工作覆盖团队 pending/completed/cancelled 和助手 current/queued/completed。cancelledAt 表示业务取消；work.status=completed 表示阶段完成，deliveryStatus 的 submitted/accepted/changes_requested 独立表示待验收/已验收/需修改。Runtime failed/cancelled 必须按 run.workId 关联，不能用助手当前状态覆盖其历史参与节点。

## 当前 UI 范围

- 助手参与图；节点附近提供查看任务与依据、启动前配置；复杂内容展开详情。
- 补充说明暂跳转精确 workId 的真实任务会话。
- 不接 employee-only 停止/退回，不提供虚构的快捷审批、自动恢复或四档授权完整生效状态。
- 查询内部关联工作图使用 WorkflowTemplate.workId === node.workItemId，排除父图自引用。多个图显式列出，无图明确说明。关联工作图不是 Runtime run。

## 已有命令及风险

cancelWork(workId) 是工作级取消。returnCurrent(employeeId)、助手停止是当前工作/运行操作，不可用于历史节点而不验证 workId。updateWork 修改基础字段；reviewDeliverable 使用具体工作和提交 ID。sendWorkbenchTab/steer 的目标会话约束需进一步核对后才能包装节点旁直接补充命令。

## 已修复：切图不改变目标工作推进

localWeWorkApi.completeCurrent 根据完成工作的 workflowId 调用依赖协调。取消、退回也更新其所属图。WorkflowExecutor 按明确目标 workflowId 读取，不修改 activeWorkflowId。测试覆盖切换选中图后完成推进、取消与退回，当前选中图保持不变。

## 已统一：Host 运行启动归属

桌面 Host 的 `startWorkflow(teamId)` 创建真实工作并登记获准执行的图。`WorkflowSupervisor` 持久保存登记信息，后台调用 `WorkflowExecutor` 推进依赖，与 renderer 是否打开无关。重复 Start 幂等，不恢复已暂停图。前端 Host 模式不再调用 LocalRunScheduler 启动 DAG 节点；agent 的 `wework_start_dag` 经过原有角色/权限校验后进入同一个 service。普通聊天保留原入口；已登记 DAG 的同一工作不能通过普通 startRun 另开重复运行。

Host-only `weworkCall(method,args)` 命令：

- `getWorkflowExecution(teamId, workflowId)`：返回 `enabled`、`status`（running/blocked/completed）、`blockers`、最近一次检查的 `runs`。暂停时 `enabled=false`，保留上次运行状态；runs 不是完整执行历史。
- `pauseWorkflowExecution(teamId, workflowId)`：停止后续推进和启动，已启动的工作继续。不是取消运行。
- `resumeWorkflowExecution(teamId, workflowId)`：恢复检查；失败、取消、失联运行仍阻塞，不自动重试。

命令不要求 UI 立刻增加按钮，具体表现由 UI 任务与用户讨论。状态变更发布 `wework.updated`，工作与交付仍以 snapshot 为权威。

重启只恢复登记过的图；不自动接管历史图。显式 Start 可登记已创建但尚未执行的工作（便于准备输入）；存在旧运行记录时拒绝直接接管，避免更换运行 ID 重复执行。注册表写入失败后停止调度。图或团队不存在时禁用该登记并记录原因。关闭 Host 先关闭调度，再停止运行；取消/未知结果保留为阻塞状态。

边界：四档授权仍是产品设计，现有 session 的 ask/auto/full 校验保持；Start 不隐式提升助手工具权限。失败后的人工修复/重试代次尚未实现。浏览器纯本地模式仍使用原前端路径，本轮保证桌面 Host 模式。

## 文件归属

- DAG/Eval 任务：src/local/localWeWorkApi.ts、app-runtime/src/host/workflow-executor.js、Runtime/API 服务改造与相应测试、eval 证据。改 store/API 前同步 UI 任务。
- UI 任务：WorkflowDagStage.tsx、ParticipationDetail.tsx/.test.ts、index.css、独立 HTML 示例；不改服务/API/store，不触发真实运行。

先完成状态与命令契约及服务单一调度，再进行节点操作联调和真实 UI 验收。聊天/附件新入口不混入当前页面范围。


## 桌面主路径联调结果 — 2026-09-12

使用隔离 documents/userData，真实 Electron preload → IPC → Host → Pi。通过 UI 点击启动「资料汇总与核查」两阶段任务；节点从执行中/等待上游推进到已提交·待验收。通过节点就地操作和双击进入详情，再进入精确 workId 的任务会话，展开上游输入和 Result 输出正文。两项工作均 completed，交付均 submitted，reviews 为 0。刷新后状态保留，持久运行记录仍只有两条。

验证窗口：1440×860、1180×800。页面标题/内容正常，无 Vite 错误遮罩，最终控制台与 pageerror 均无应用错误。修复右侧抽屉重复占用画布、适应画布未避开左栏、标题/工具区重叠、低缩放就地按钮不可读，以及任务上下文对 DAG 完成条件的错误提示。59 条相关测试、TypeScript 与 Vite production build 通过；构建仍有主 bundle 超过 500 kB 的体积提示。

本轮没有验证手机布局、全部异常/审批分支、多团队压力和完整 Adaptive 权限；不能将这次主路径联调表述为整个产品验收完成。临时截图与运行证据保留于 `/tmp/wework-dag-ui-qa`，未操作用户已有团队。

## 异常路径联调 — 2026-09-12

Host `snapshot` 现在为每个团队附加 `workflowExecutions` 只读投影，来源是 supervisor 注册表，未另存为业务工作状态。页面依现有 `wework.updated`/hydrate 刷新，无第二套执行器或轮询。节点按具体 workflowId/workId 显示执行受阻，详情展示原因与暂停说明；交付/验收状态保持独立。旧 Host/纯本地没有该投影时沿用业务状态。

阻塞记录增加 `code`（failed/cancelled/uncertain/submission_missing/no_runnable_work 等）及可选 `detail`，保留原 reason、runId、workId。存储不可用会显示为阻塞而非健康执行。

隔离 Electron 测试通过：设备禁用 Pi 后，UI 点击启动产生一条真实 failed 记录；上游显示执行受阻及设备 Harness 未获准原因，下游仍等待。通过现有 IPC 命令暂停、关闭并重新启动 Host，暂停保持；resume 只恢复检查，不生成新 run。总记录数保持 3（此前两条成功、本次一条失败）。切回已完成旧图，其两个待验收节点不被新图失败污染。最终无 pageerror/console error。

新增/回归验证：58 条 Node 测试、60 条 Vitest、TypeScript、runtime bundle 均通过。Ask 模式不提供 DAG 写入/启动工具的测试通过，未宣称四档 Adaptive 授权已实现。本轮没有增加控制按钮，暂停/恢复通过真实桌面 IPC 接口验证；用户修复原因后的显式重试代次仍待实现。截图 `/tmp/wework-dag-ui-qa/failure-detail.png`、`paused.png`。

## 图导航归属调整 — 用户确认，2026-09-12

任务运行图改由 DAG 左侧「编排与任务图」统一导航，中央画布展示选中的图。父子关系按 child.workId 匹配 parent.nodes[].workItemId，不按助手归属。共享图只保留一处导航行，图头保留所有上级链接；缺失上级的图独立列出，循环或自引用不会导致图被隐藏或导航无限递归。

助手详情不再内嵌任务运行图，仅在存在关联图时显示「在画布中打开」。详情展开时左侧图导航仍可访问。选中子图会展开祖先分支，并显示所属任务和返回上级入口；切图清除前一图的节点选择和配置面板。

隔离真实 Electron 1440×860 / 1180×800 已验证：左侧父子导航、返回上级、助手详情跳转、收起分支后的自动展开、刷新后选中图保留。60 条相关测试、TypeScript 和 Vite build 通过，最终页面无 console/pageerror/错误遮罩；仅保留既有 bundle 体积提示。本轮未启动新增子图的模型任务。截图 `/tmp/wework-dag-ui-qa/task-graph-navigation.png`。

## 画布交互优化 — 2026-09-12

DAG 右侧协作抽屉默认收起，其他场景保持原默认行为。低缩放下持续显示任务名称与状态；选择节点突出直接上下游并弱化其他节点，Escape 清除选择。连线端口与节点中心对齐，拖动不再使用位置过渡动画。

普通滚轮平移，Ctrl/Cmd + 滚轮围绕鼠标缩放；按钮缩放围绕可用画布中心，比例按钮恢复 100%，适应画布避开左侧导航与右侧面板。

隔离真实 Electron 六节点分叉/汇合案例已验证：中心缩放坐标保持、滚轮平移、修饰键缩放、上下游聚焦、Escape 清除、100% 恢复和 1180×800 窄窗口标签展示。页面错误日志为空；9 条相关 Vitest、TypeScript 与 Vite build 通过（保留既有 bundle 体积提示）。截图 `/tmp/wework-dag-ui-qa/canvas-narrow.png`。本轮未启动测试图模型执行。
