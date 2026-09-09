# WeWork UIKit

从现有 Wework 界面提取的 React 组件库。现有页面布局、圆桌场景、助手形象和业务交互继续沿用。

## 入口与展示

- 组件：`src/components/ui/index.ts`
- 基础变量：`src/styles/design-system.css` 中的 `--ww-*`，包含颜色、字号、间距、圆角、高度和阴影。
- 组件样式：`src/components/ui/ui.css`
- 可交互展示页：启动 `npm run dev:web`，打开 `/?ui-kit`。仅开发模式启用；示例只使用 React 本地状态，不创建业务数据。
- 展示页面按需加载，正常平台入口保持不变。

## 使用

```tsx
import { Button, Field, Input, Dialog, DialogFooter } from '../ui';

<Dialog open={open} onClose={close} busy={saving} title="新建团队">
  <form onSubmit={save}>
    <Field label="团队名称" hint="创建后可以修改" error={error}>
      <Input required value={name} onChange={e => setName(e.target.value)} />
    </Field>
    <DialogFooter>
      <Button type="button" variant="ghost" onClick={close}>取消</Button>
      <Button type="submit" variant="primary" loading={saving}>创建团队</Button>
    </DialogFooter>
  </form>
</Dialog>
```

| 组件 | 用途 |
| --- | --- |
| Button / IconButton | primary、secondary、ghost、danger；sm、md、icon 尺寸；loading 阻止重复点击。IconButton 必须提供 label。 |
| Input / Textarea / FormSelect | 保留原生 value、事件、ref、required、disabled 和表单提交能力；FormSelect 与 Select 共用弹出菜单，NativeSelect 保留为兼容名称。 |
| Field | 自动关联 label、hint、error 与唯一输入控件，合并已有 aria-describedby。 |
| Select | 从现有 AppSelect 提取，保留受控 API、Portal、键盘选择、选中指示，支持禁用、禁用选项和空选项。 |
| Badge | neutral、info、success、warning、danger 状态。 |
| Tabs | 带面板的页签；左右方向键、Home、End，跳过禁用项。 |
| ViewSwitcher | 切换既有页面视图；沿用导航语义，以 aria-current 表达当前页面。 |
| Dialog / DialogFooter | 统一弹窗标题、关闭、遮罩、焦点循环和恢复；busy 时禁止关闭。 |
| Tooltip | 对可聚焦子控件补充说明；鼠标悬停和键盘聚焦可见，Escape 隐藏。 |

Button 保留原生默认提交语义；表单内的非提交按钮必须写 `type="button"`。省略 variant 时只应用共用控件基础样式，供已有复合控件保留自身状态外观；新建普通按钮应明确选择 variant。页面 className 主要负责布局，避免重复配置视觉样式。

`data-ui` 是组件内部的样式挂钩，业务页面不再手工添加。复选框、范围输入、3D 场景对象、拖拽手柄不伪装为普通文本框或矩形按钮。

## 已接入现有产品

- 23 个现有组件文件内的 166 个已标记控件迁移到 React UIKit，包括设置、团队管理、工作台、项目视图、门户、待办和监控。
- 新建团队与助手入职复用 Dialog、DialogFooter、Field 和加载按钮。
- 顶部团队导航复用 Button、Badge 和 ViewSwitcher。
- 项目列表原有 AppSelect 路径保留兼容导出，实际实现集中到 UIKit Select。
- ConversationComposer 保持现有 API，内部文本域使用 UIKit Textarea；展示页复用同一组件。
- 大型工作台、设备设置保留各自的内容容器和现有焦点逻辑，内部控件与弹窗视觉使用共享样式。

## 验证

`npm run build:web` 验证类型和生产构建。`npm run test:web` 包含 UIKit 原生语义、输入辅助说明、禁用状态与页签面板关联回归检查。

浏览器检查覆盖展示页选择器键盘选择、Tabs 切换、弹窗焦点循环与 Escape 后恢复焦点，并回查真实业务弹窗。桌面原生目录选择和真实模型执行不属于本次组件验收。

表单单选菜单统一使用 FormSelect。内部原生 select 只保留值、FormData、必填校验与 change 事件，不展示系统菜单。显式 multiple 或 size > 1 的多选列表保留原生交互。文字选区统一为浅蓝色，标签仍可选择复制。
