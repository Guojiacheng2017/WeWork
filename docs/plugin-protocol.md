# WeWork Plugin Protocol v0.1

WeWork Plugin 使用与 Codex Plugin 对齐的包结构和 MCP 传输协议，但拥有自己的宿主命名空间。

## 包结构

```text
<plugin-name>/
  .wework-plugin/plugin.json
  .mcp.json
  server.mjs
```

`plugin.json` 的 `name`、`version`、`description`、`author`、`interface` 和 `mcpServers` 字段与 Codex Plugin 保持兼容。为便于迁移，WeWork 也可读取 `.codex-plugin/plugin.json`；原生插件应使用 `.wework-plugin`。

## 发现与生命周期

桌面 Host 扫描打包的 `plugins/` 目录，校验目录名与 manifest `name` 一致，再读取 `mcpServers`。插件是否供某个团队使用不写回插件包，而记录在团队状态中：

```json
{
  "pluginId": "wework-plane",
  "version": "0.1.0",
  "enabled": true,
  "permissions": ["network", "credentials:integration", "project:read"],
  "configuration": { "credentialRef": "credential-id" }
}
```

停用只停止调用，不删除团队业务数据；卸载和数据删除是不同操作。

## MCP 与权限

Host 通过 stdio JSON-RPC 完成 `initialize`、`tools/list` 和 `tools/call`。每个工具在 `_meta["wework/permissions"]` 声明调用所需权限。Host 在调用前将它与团队授予列表逐项比对，未授权即拒绝。

需要外部服务的插件，其凭据只在 WeWork 安全存储中保存。团队配置仅持有 `credentialRef`；Host 在单次 `tools/call` 前解析并注入，插件子进程不会继承宿主的完整环境变量。内置本地插件不应要求 URL 或凭据。

## 业务数据 adapter

Project Management 插件通过稳定工具名接入 WeWork：

- `project_sync`：返回完整 `CollaborationDatabase` 快照。
- `project_create_work_item`：创建事项并返回新快照。
- `project_update_work_item`：更新事项并返回新快照。

插件负责能力声明和可选外部 adapter；WeWork 负责持久化、UI、团队隔离和助手协作。首个 Project Management Plugin 默认直接使用团队本地 `CollaborationDatabase`，不依赖 Plane 服务；外部 Plane adapter 属于后续可选扩展。
