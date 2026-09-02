# WeWork中文套壳 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有 WeWork 前端包装为“WeWork”，补齐助手入职、团队绩效考核与服务受理入口及展示页。

**Architecture:** 仅修改 renderer 可见文案和导航层，不改内部路径、API、存储键、领域模型或 Electron appId。新增纯配置描述行业化栏目，新增一个读取现有团队数据的展示组件，由 App 持有瞬时页面选择状态。

**Tech Stack:** React 19、TypeScript、Vite、Tailwind CSS、Vitest、lucide-react

## Global Constraints

- App 可见名称统一为“WeWork”。
- Employee 新增流程显示为“助手入职”。
- 团队绩效考核必须包含“业务绩效”和“个人绩效”。
- 服务受理必须包含“业务分解、任务匹配、任务执行、任务监控、任务反馈”。
- 不修改项目路径、内部 WeWork 命名、API、存储键或 Electron appId。

---

### Task 1: 行业化导航配置

**Files:**
- Create: `src/domain/portalNavigation.ts`
- Test: `src/domain/portalNavigation.test.ts`

**Interfaces:**
- Produces: `PortalPage`、`performancePages`、`servicePages`、`portalPageMeta`。

- [x] **Step 1: Write the failing test**

```ts
expect(performancePages.map((item) => item.label)).toEqual(['业务绩效', '个人绩效']);
expect(servicePages.map((item) => item.label)).toEqual(['业务分解', '任务匹配', '任务执行', '任务监控', '任务反馈']);
```

- [x] **Step 2: Run test to verify it fails**

Run: `npm run test:web -- src/domain/portalNavigation.test.ts`

- [x] **Step 3: Write minimal implementation**

定义稳定页面 id、中文标签、说明和服务流程序号。

- [x] **Step 4: Run test to verify it passes**

Run: `npm run test:web -- src/domain/portalNavigation.test.ts`

### Task 2: 包装导航与业务展示页

**Files:**
- Create: `src/components/portal/PortalPageView.tsx`
- Modify: `src/components/layout/TeamSidebar.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `PortalPage` 与现有 `WeWorkTeam` 数据。
- Produces: 可切换绩效和服务受理页面；原有圆桌和团队管理入口以“助手入职”复用 `setAddEmployeeOpen(true)`，侧栏顶部不新增入职入口。

- [x] **Step 1: Add navigation props and controls**

左侧栏增加行业化一级/二级入口；团队选择恢复工作台。

- [x] **Step 2: Add data-backed portal view**

绩效页展示团队或助手完成情况；服务页展示五阶段流程和当前任务列表。

- [x] **Step 3: Wire App page state**

App 使用 `PortalPage | null` 切换原工作台和包装页，不污染持久化 topology。

- [x] **Step 4: Build and verify navigation labels**

Run: `npm run build:web`

### Task 3: 可见品牌与入职文案

**Files:**
- Modify: `index.html`
- Modify: `src/App.tsx`
- Modify: `src/index.css`
- Modify: `src/components/layout/TeamSidebar.tsx`
- Modify: `src/components/modals/AddEmployeeModal.tsx`
- Modify: `desktop/package.json`

**Interfaces:**
- Produces: 浏览器标题、启动页、桌面标题栏、侧栏和入职弹窗统一中文包装。

- [x] **Step 1: Replace visible app naming**

将用户可见 WeWork 品牌替换为“WeWork”；保留内部标识。

- [x] **Step 2: Replace employee onboarding copy**

入口、标题、关闭标签和提交按钮统一使用“助手入职”。

- [x] **Step 3: Run complete web tests and build**

Run: `npm run test:web && npm run build:web`

- [x] **Step 4: Browser smoke test**

检查启动页、侧栏、绩效二级页、服务受理五阶段页和入职弹窗。
