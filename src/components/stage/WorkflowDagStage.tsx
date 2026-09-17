import { WorkflowWorkControl } from './WorkflowWorkControl';
import { panForZoom } from './canvasViewport';
import { WorkflowNavigation } from './WorkflowNavigation';
import { parentWorkflows } from './graphHierarchy';
import { executionBlockerForWork, workflowBlockerMessage } from '../../domain/workflowExecution';
import { ParticipationDetail, findParticipationWork } from './ParticipationDetail';
import { Dialog, DialogFooter, Button, Input, NativeSelect, Textarea } from '../ui';
import { createPortal } from 'react-dom';
import { WorkspacePanelContext } from '../workspace/WorkspacePanelContext';
import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle, CheckCircle2, ChevronUp, ChevronDown, Clock, Layers, Maximize2, Minus, MousePointer2,
  PlayCircle, Plus, Search, X, Settings2, Sparkles, Trash2, GitBranch, PanelRight, GripVertical, Pin, SquarePlus, Save, Undo2, Redo2, Copy, ListChecks, History,
} from 'lucide-react';
import { WeWorkEmployee, RoleNode, WorkflowTemplate } from '../../domain/wework';
import { useWeWorkStore } from '../../state/weworkStore';
import { EmployeeBotAvatar } from '../employee/EmployeeBotAvatar';
import { clampDagZoom, dagNodeDisplayMode } from './workflowSemanticZoom';

interface WorkflowDagStageProps {
  active?: boolean;
  workflow?: WorkflowTemplate;
  workflows?: WorkflowTemplate[];
  employees: WeWorkEmployee[];
  pendingPanelVisible?: boolean;
  pendingPanelWidth?: number;
}
type Point = { x: number; y: number };
type NodePositions = Record<string, Point>;

const NODE_WIDTH = 236;
const NODE_HEIGHT = 208;
const CANVAS_WIDTH = 1800;
const CANVAS_HEIGHT = 980;

const statusMeta: Record<RoleNode['status'], { label: string; dot: string; badge: string }> = {
  completed: { label: '已完成', dot: '#10b981', badge: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  running: { label: '执行中', dot: '#0ea5e9', badge: 'border-sky-200 bg-sky-50 text-sky-700' },
  ready: { label: '就绪', dot: '#f59e0b', badge: 'border-amber-200 bg-amber-50 text-amber-700' },
  waiting: { label: '等待', dot: '#94a3b8', badge: 'border-slate-200 bg-slate-50 text-slate-500' },
  blocked: { label: '待处理', dot: '#f43f5e', badge: 'border-rose-200 bg-rose-50 text-rose-700' },
};

function autoLayout(nodes: RoleNode[]): NodePositions {
  const levels = new Map<string, number>();
  const resolveLevel = (node: RoleNode, path = new Set<string>()): number => {
    if (levels.has(node.id)) return levels.get(node.id)!;
    if (path.has(node.id)) return 0;
    const nextPath = new Set(path).add(node.id);
    const dependencies = (node.requires ?? []).map((id) => nodes.find((item) => item.id === id)).filter(Boolean) as RoleNode[];
    const level = dependencies.length ? Math.max(...dependencies.map((item) => resolveLevel(item, nextPath))) + 1 : 0;
    levels.set(node.id, level);
    return level;
  };
  nodes.forEach((node) => resolveLevel(node));
  const groups = new Map<number, RoleNode[]>();
  nodes.forEach((node) => groups.set(levels.get(node.id) ?? 0, [...(groups.get(levels.get(node.id) ?? 0) ?? []), node]));
  const positions: NodePositions = {};
  groups.forEach((group, level) => {
    const totalHeight = group.length * NODE_HEIGHT + Math.max(0, group.length - 1) * 72;
    group.forEach((node, index) => {
      positions[node.id] = { x: 100 + level * 340, y: Math.max(72, 330 - totalHeight / 2 + index * (NODE_HEIGHT + 72)) };
    });
  });
  return positions;
}

function edgePath(from: Point, to: Point, compact: boolean) {
  const startX = from.x + (compact ? NODE_WIDTH / 2 + 38 : NODE_WIDTH);
  const startY = from.y + NODE_HEIGHT / 2;
  const endX = to.x + (compact ? NODE_WIDTH / 2 - 38 : 0);
  const endY = to.y + NODE_HEIGHT / 2;
  const bend = Math.max(72, (endX - startX) * 0.5);
  return `M ${startX} ${startY} C ${startX + bend} ${startY}, ${endX - bend} ${endY}, ${endX} ${endY}`;
}

export const WorkflowDagStage: React.FC<WorkflowDagStageProps> = ({ active = true, workflow, workflows = [], employees, pendingPanelVisible = false, pendingPanelWidth = 360 }) => {
  const [searchOpen, setSearchOpen] = useState(false);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [toolbarPosition, setToolbarPosition] = useState<Point | null>(null);
  const toolbarDrag = useRef<{ start: Point; origin: Point; moved: boolean } | null>(null);

  const [nodeQuery, setNodeQuery] = useState('');
  const [searchNodeId, setSearchNodeId] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const handleFind = (event: KeyboardEvent) => {
      if (useWeWorkStore.getState().topology !== 'workflowDag') return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f' && !document.querySelector('[role="dialog"]')) {
        event.preventDefault();
        setSearchOpen(true);
        requestAnimationFrame(() => { searchInputRef.current?.focus(); searchInputRef.current?.select(); });
      }
    };
    window.addEventListener('keydown', handleFind);
    return () => window.removeEventListener('keydown', handleFind);
  }, []);
  const [participationId, setParticipationId] = useState<string | null>(null);
  useEffect(() => { setWorkflowInfoOpen(false); setSearchOpen(false); setWorkflowCheckOpen(false); setNodeQuery(''); setSearchNodeId(null); setParticipationId(null); setSelectedNodeId(null); setInspectorOpen(false); setNodePanelVisible(false); setNodePanelExpanded(false); setEditHistory({ undo: [], redo: [] }); setNodeMenu(null); }, [workflow?.id]);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [positions, setPositions] = useState<NodePositions>({});
  const sharedPanel = useContext(WorkspacePanelContext);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [, setNodePanelVisible] = useState(false);
  const [nodePanelExpanded, setNodePanelExpanded] = useState(false);
  const [createNodeAt, setCreateNodeAt] = useState<Point | null>(null);
  const [deleteNodeId, setDeleteNodeId] = useState<string | null>(null);
  const [editHistory, setEditHistory] = useState<{ undo: WorkflowTemplate[]; redo: WorkflowTemplate[] }>({ undo: [], redo: [] });
  const [historySaving, setHistorySaving] = useState(false);
  const [nodeMenu, setNodeMenu] = useState<{ nodeId: string; x: number; y: number } | null>(null);
  const [workflowCheckOpen, setWorkflowCheckOpen] = useState(false);
  const [connectingFromNodeId, setConnectingFromNodeId] = useState<string | null>(null);
  const [newNodeLabel, setNewNodeLabel] = useState('');
  const [newNodeEmployeeId, setNewNodeEmployeeId] = useState('');
  const [canvasSize, setCanvasSize] = useState({ width: 1, height: 1 });
  const [zoom, setZoom] = useState(0.9);
  const [pan, setPan] = useState<Point>({ x: 24, y: 18 });
  const fittedWorkflowRef = useRef<string | null>(null);
  const preparingWorkflowRef = useRef(false);
  const removedLegacyPlaceholderRef = useRef<string | null>(null);
  const zoomRef = useRef(zoom);
  const panRef = useRef(pan);
  const positionsRef = useRef<NodePositions>({});
  const nodeMovedRef = useRef(false);
  const [workflowInfoOpen, setWorkflowInfoOpen] = useState(false);
  const [workflowInfoError, setWorkflowInfoError] = useState('');
  const [workflowInfoSaving, setWorkflowInfoSaving] = useState(false);
  const [workflowNameDraft, setWorkflowNameDraft] = useState(workflow?.name ?? '');
  const [workflowDescriptionDraft, setWorkflowDescriptionDraft] = useState(workflow?.description ?? '');
  const [createWorkflowOpen, setCreateWorkflowOpen] = useState(false);
  const [manageWorkTypesOpen, setManageWorkTypesOpen] = useState(false);
  const [newWorkflowName, setNewWorkflowName] = useState('');
  const [newWorkflowTypeId, setNewWorkflowTypeId] = useState('');
  const [newWorkflowSourceId, setNewWorkflowSourceId] = useState('');
  const [newWorkflowWorkId, setNewWorkflowWorkId] = useState('');
  const [workTypeName, setWorkTypeName] = useState('');
  const [editingWorkTypeId, setEditingWorkTypeId] = useState('');
  const [workTypeLeadId, setWorkTypeLeadId] = useState('');
  const [workTypeParticipantIds, setWorkTypeParticipantIds] = useState<string[]>([]);
  const [workTypePolicy, setWorkTypePolicy] = useState<'balanced' | 'manual'>('balanced');
  const [interaction, setInteraction] = useState<
    { kind: 'pan'; start: Point; origin: Point } |
    { kind: 'node'; nodeId: string; start: Point; origin: Point; moved: boolean } | null
  >(null);
  const {
    selectedTeamId, openWorkbench, selectEmployee, draggingWorkItemId, dragHoveredEmployeeId,
    setDragHoveredEmployeeId, dispatchWorkToEmployee, saveWorkflow, addWorkflowNode,
    teams, updateWorkflowNode, removeWorkflowNode, startWorkflow, continueWorkflowWork, createWorkflow, selectWorkflow, configureWorkType,
  } = useWeWorkStore();

  const team = teams.find((candidate) => candidate.id === selectedTeamId);
  const parents = workflow ? parentWorkflows(workflows, workflow) : [];
  const linkedTask = team && workflow?.workId ? findParticipationWork(team, workflow.workId) : undefined;
  const openWorkflow = (id: string) => { void selectWorkflow(selectedTeamId, id).then(() => setParticipationId(null)); };
  const execution = team?.workflowExecutions?.find(item => item.workflowId === workflow?.id);
  const workTypes = team?.workTypes ?? [];
  const historicalReferences = workflows.filter((candidate) => !candidate.temporary && candidate.workTypeId === newWorkflowTypeId);
  const availableDagWorks = [...(team?.pendingWorks ?? []), ...(team?.employees ?? []).flatMap((employee) => [employee.currentWorkItem, ...(employee.queuedWorkItems ?? [])].filter(Boolean))]
    .filter((work) => work && !work.workflowNodeId && !work.dagWorkflowId);

  const nodes = useMemo(() => workflow?.nodes ?? [], [workflow?.nodes]);
  const searchMatches = useMemo(() => {
    const query = nodeQuery.trim().toLocaleLowerCase();
    return nodes.filter(node => [node.label, node.roleName, employees.find(employee => employee.id === node.assignedEmployeeId)?.displayName, statusMeta[node.status].label].some(value => value?.toLocaleLowerCase().includes(query)));
  }, [nodes, employees, nodeQuery]);
  const searchIndex = searchMatches.findIndex(node => node.id === searchNodeId);
  const workflowHasStarted = nodes.some((node) => node.workItemId);
  const workflowStarted = execution?.enabled === true && execution.status === 'running';
  const workflowLocked = workflowStarted;
  const primaryModifier = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';
  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? null;
  const nodeDisplayMode = dagNodeDisplayMode(zoom);
  const connectedNodeIds = new Set(selectedNodeId ? [selectedNodeId, ...(selectedNode?.requires ?? []), ...nodes.filter(node => node.requires?.includes(selectedNodeId)).map(node => node.id)] : []);
  const workflowChecks = useMemo(() => nodes.flatMap(node => {
    const issues: Array<{ nodeId: string; level: 'error' | 'warning'; message: string }> = [];
    if (!node.assignedEmployeeId) issues.push({ nodeId: node.id, level: 'error', message: '尚未指派助手' });
    if (!node.goal?.trim()) issues.push({ nodeId: node.id, level: 'warning', message: '缺少明确的工作目标' });
    if (!node.outputRequirements?.trim()) issues.push({ nodeId: node.id, level: 'warning', message: '缺少输出和验收要求' });
    for (const dependency of node.requires ?? []) if (!nodes.some(candidate => candidate.id === dependency)) issues.push({ nodeId: node.id, level: 'error', message: '引用了不存在的上游节点' });
    return issues;
  }), [nodes]);

  useEffect(() => {
    if (!active || !team || workflow || preparingWorkflowRef.current) return;
    preparingWorkflowRef.current = true;
    void createWorkflow(selectedTeamId, { name: `${team.name} 工作流`, temporary: true }).finally(() => { preparingWorkflowRef.current = false; });
  }, [active, team?.id, workflow, selectedTeamId, createWorkflow]);

  useEffect(() => {
    if (!active || !workflow || removedLegacyPlaceholderRef.current === workflow.id || workflow.nodes.length !== 1) return;
    const [node] = workflow.nodes;
    const generatedPlaceholder = node.label === '阶段 1' && node.roleName === '待配置岗位' && !node.assignedEmployeeId && !node.workItemId && !(node.requires?.length) && !node.goal;
    if (!generatedPlaceholder) return;
    removedLegacyPlaceholderRef.current = workflow.id;
    removeWorkflowNode(selectedTeamId, node.id);
    window.setTimeout(() => { const current = useWeWorkStore.getState().teams.find(item => item.id === selectedTeamId)?.workflow; if (current) void saveWorkflow(selectedTeamId, current); }, 0);
  }, [active, workflow, selectedTeamId, removeWorkflowNode, saveWorkflow]);

  useEffect(() => {
    if (!workflow) return;
    const fallback = autoLayout(workflow.nodes);
    setPositions(Object.fromEntries(workflow.nodes.map((node) => [node.id, node.position ?? fallback[node.id]])));
    setWorkflowNameDraft(workflow.name);
    setWorkflowDescriptionDraft(workflow.description);
  }, [workflow?.id, workflow?.version, workflow?.nodes.length]);

  useEffect(() => {
    if (!canvasRef.current) return;
    const observer = new ResizeObserver(([entry]) => setCanvasSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(canvasRef.current);
    return () => observer.disconnect();
  }, [workflow?.id]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const preventPageZoom = (event: WheelEvent) => {
      const control = (event.target as Element).closest('nav, input, textarea, select, [aria-label="流程小地图"], [aria-label="画布查找"]');
      if (control) { if (event.ctrlKey || event.metaKey) event.preventDefault(); return; }
      event.preventDefault();
      if (!(event.ctrlKey || event.metaKey)) {
        const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? canvas.clientHeight : 1;
        const next = { x: panRef.current.x - event.deltaX * unit, y: panRef.current.y - event.deltaY * unit };
        panRef.current = next; setPan(next); return;
      }
      const previousZoom = zoomRef.current;
      const nextZoom = clampDagZoom(previousZoom * Math.exp(-Math.max(-100, Math.min(100, event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? canvas.clientHeight : 1))) * 0.002));
      if (nextZoom === previousZoom) return;
      const rect = canvas.getBoundingClientRect();
      const pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      const previousPan = panRef.current;
      const nextPan = panForZoom(previousPan, previousZoom, nextZoom, pointer);
      zoomRef.current = nextZoom;
      panRef.current = nextPan;
      setZoom(nextZoom);
      setPan(nextPan);
    };
    const preventGesture = (event: Event) => event.preventDefault();
    canvas.addEventListener('wheel', preventPageZoom, { passive: false });
    canvas.addEventListener('gesturestart', preventGesture, { passive: false });
    canvas.addEventListener('gesturechange', preventGesture, { passive: false });
    return () => {
      canvas.removeEventListener('wheel', preventPageZoom);
      canvas.removeEventListener('gesturestart', preventGesture);
      canvas.removeEventListener('gesturechange', preventGesture);
    };
  }, []);

  useEffect(() => { positionsRef.current = positions; }, [positions]);

  useEffect(() => {
    if (!inspectorOpen) return;
    setNodePanelVisible(true);
    const frame = window.requestAnimationFrame(() => setNodePanelExpanded(true));
    return () => window.cancelAnimationFrame(frame);
  }, [inspectorOpen]);

  useEffect(() => {
    if (workflow && fittedWorkflowRef.current !== workflow.id && nodes.length && canvasSize.width > 1 && nodes.every(node => positions[node.id])) { fitView(); fittedWorkflowRef.current = workflow.id; }
  }, [workflow?.id, positions, canvasSize.width, canvasSize.height]);

  if (!workflow) {
    return <div aria-label="正在准备空白任务图" className="workflow-canvas h-full w-full bg-slate-50" />;
  }

  const persistCurrentWorkflow = () => {
    const current = useWeWorkStore.getState().teams.find((team) => team.id === selectedTeamId)?.workflow;
    if (current) void saveWorkflow(selectedTeamId, current);
  };
  const persistAfterLocalChange = () => window.setTimeout(persistCurrentWorkflow, 0);
  const openNodeInspector = () => { setInspectorOpen(true); setNodePanelExpanded(true); sharedPanel?.openInspector(); };
  const closeNodePanel = () => { setNodePanelExpanded(false); setInspectorOpen(false); sharedPanel?.closeInspector(); };
  const snapshotWorkflow = () => structuredClone(useWeWorkStore.getState().teams.find((item) => item.id === selectedTeamId)?.workflow ?? workflow);
  const recordHistory = () => setEditHistory(current => ({ undo: [...current.undo.slice(-49), snapshotWorkflow()], redo: [] }));
  const restoreHistory = async (direction: 'undo' | 'redo') => {
    if (historySaving || workflowLocked) return;
    const target = editHistory[direction].at(-1);
    if (!target) return;
    const current = snapshotWorkflow();
    setHistorySaving(true);
    setEditHistory(history => direction === 'undo'
      ? { undo: history.undo.slice(0, -1), redo: [...history.redo.slice(-49), current] }
      : { undo: [...history.undo.slice(-49), current], redo: history.redo.slice(0, -1) });
    try {
      await saveWorkflow(selectedTeamId, { ...target, version: current.version });
      setSelectedNodeId(value => target.nodes.some(node => node.id === value) ? value : null);
    } finally { setHistorySaving(false); }
  };
  const duplicateNode = (nodeId: string) => {
    const source = nodes.find(node => node.id === nodeId);
    if (!source || workflowLocked) return;
    recordHistory();
    const origin = positions[source.id] ?? { x: 20, y: 20 };
    const position = { x: origin.x + 48, y: origin.y + 48 };
    const newId = addWorkflowNode(selectedTeamId, position);
    updateWorkflowNode(selectedTeamId, newId, { ...source, id: newId, label: `${source.label} 副本`, stepNumber: nodes.length + 1, status: 'ready', workItemId: undefined, inputDocumentIds: [], outputDocumentIds: [], blockedReason: undefined, position });
    setSelectedNodeId(newId); setNodeMenu(null); persistAfterLocalChange();
  };
  const updateNodeAndSave = (nodeId: string, patch: Partial<RoleNode>) => {
    recordHistory();
    updateWorkflowNode(selectedTeamId, nodeId, patch);
    persistAfterLocalChange();
  };
  const connectNodes = (targetNode: RoleNode) => {
    if (!connectingFromNodeId || connectingFromNodeId === targetNode.id) return;
    const requires = targetNode.requires ?? [];
    if (!requires.includes(connectingFromNodeId)) updateNodeAndSave(targetNode.id, { requires: [...requires, connectingFromNodeId] });
    setConnectingFromNodeId(null);
  };
  const applyAutoLayout = () => {
    recordHistory();
    const layout = autoLayout(nodes);
    setPositions(layout);
    void saveWorkflow(selectedTeamId, {
      ...workflow,
      nodes: workflow.nodes.map((node) => ({ ...node, position: layout[node.id] })),
    });
  };
  const openCreateNodeAtCenter = () => {
    if (workflowLocked) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const reserved = sharedPanel ? 16 : pendingPanelVisible || nodePanelExpanded ? pendingPanelWidth + 16 : 68;
    const left = navigationOpen ? 224 : 32;
    const centerX = left + Math.max(0, rect.width - reserved - left) / 2;
    setCreateNodeAt({ x: Math.max(20, (centerX - panRef.current.x) / zoomRef.current - NODE_WIDTH / 2), y: Math.max(20, (rect.height / 2 - panRef.current.y) / zoomRef.current - NODE_HEIGHT / 2) });
    setNewNodeLabel(`阶段 ${nodes.length + 1}`); setNewNodeEmployeeId(''); setConnectingFromNodeId(null);
  };
  const changeZoom = (value: number) => {
    const nextZoom = clampDagZoom(value);
    const right = sharedPanel ? 16 : pendingPanelVisible || nodePanelExpanded ? pendingPanelWidth + 16 : 68;
    const anchor = { x: 32 + Math.max(0, canvasSize.width - right - 32) / 2, y: 96 + Math.max(0, canvasSize.height - 168) / 2 };
    const nextPan = panForZoom(panRef.current, zoomRef.current, nextZoom, anchor);
    zoomRef.current = nextZoom; panRef.current = nextPan; setZoom(nextZoom); setPan(nextPan);
  };
  const mapWidth = Math.max(CANVAS_WIDTH, ...nodes.map(node => (positions[node.id]?.x ?? 0) + NODE_WIDTH + 80));
  const mapHeight = Math.max(CANVAS_HEIGHT, ...nodes.map(node => (positions[node.id]?.y ?? 0) + NODE_HEIGHT + 80));
  const mapRight = sharedPanel ? 16 : pendingPanelVisible || nodePanelExpanded ? pendingPanelWidth + 16 : 68;
  const navigateMap = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const worldX = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) * mapWidth;
    const worldY = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) * mapHeight;
    const nextPan = { x: 32 + Math.max(0, canvasSize.width - mapRight - 32) / 2 - worldX * zoom, y: 96 + Math.max(0, canvasSize.height - 168) / 2 - worldY * zoom };
    panRef.current = nextPan;
    setPan(nextPan);
  };
  const focusNode = (nodeId: string, keepSearchFocus = false) => {
    const point = positions[nodeId];
    if (!point) return;
    const nextZoom = 1;
    const nextPan = {
      x: 208 + Math.max(0, canvasSize.width - mapRight - 208) / 2 - (point.x + NODE_WIDTH / 2) * nextZoom,
      y: 184 + Math.max(0, canvasSize.height - 304) / 2 - (point.y + NODE_HEIGHT / 2) * nextZoom,
    };
    zoomRef.current = nextZoom; panRef.current = nextPan;
    setZoom(nextZoom); setPan(nextPan); setSelectedNodeId(nodeId); setSearchNodeId(nodeId);
    requestAnimationFrame(() => keepSearchFocus ? searchInputRef.current?.focus() : canvasRef.current?.focus());
  };
  const stepSearch = (direction: number) => {
    if (!searchMatches.length) return;
    const index = searchIndex < 0 ? (direction > 0 ? 0 : searchMatches.length - 1) : (searchIndex + direction + searchMatches.length) % searchMatches.length;
    focusNode(searchMatches[index].id, true);
  };
  const fitView = (reservedWidth = sharedPanel ? 16 : pendingPanelVisible || nodePanelExpanded ? pendingPanelWidth + 16 : 68) => {
    if (!canvasRef.current || nodes.length === 0) return;
    const points = nodes.map((node) => positions[node.id]).filter(Boolean);
    const minX = Math.min(...points.map((point) => point.x));
    const minY = Math.min(...points.map((point) => point.y));
    const maxX = Math.max(...points.map((point) => point.x + NODE_WIDTH));
    const maxY = Math.max(...points.map((point) => point.y + NODE_HEIGHT));
    const rect = canvasRef.current.getBoundingClientRect();
    // Floating controls overlay the canvas; only reserve breathing room around the graph.
    const left = 32, top = 96, bottom = 72;
    const availableWidth = Math.max(160, rect.width - reservedWidth - left - 24);
    const availableHeight = Math.max(160, rect.height - top - bottom);
    const nextZoom = clampDagZoom(Math.min(1, (availableWidth - 32) / (maxX - minX), (availableHeight - 32) / (maxY - minY)));
    zoomRef.current = nextZoom;
    setZoom(nextZoom);
    const nextPan = { x: left + (availableWidth - (maxX - minX) * nextZoom) / 2 - minX * nextZoom, y: top + (availableHeight - (maxY - minY) * nextZoom) / 2 - minY * nextZoom };
    panRef.current = nextPan; setPan(nextPan);
  };
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!interaction) return;
    if (interaction.kind === 'pan') {
      const nextPan = { x: interaction.origin.x + event.clientX - interaction.start.x, y: interaction.origin.y + event.clientY - interaction.start.y };
      panRef.current = nextPan; setPan(nextPan);
      return;
    }
    const moved = interaction.moved || Math.hypot(event.clientX - interaction.start.x, event.clientY - interaction.start.y) > 5;
    if (!moved) return;
    nodeMovedRef.current = true;
    if (!interaction.moved) setInteraction({ ...interaction, moved: true });
    setPositions((current) => {
      const next = { ...current, [interaction.nodeId]: {
      x: Math.max(20, interaction.origin.x + (event.clientX - interaction.start.x) / zoom),
      y: Math.max(20, interaction.origin.y + (event.clientY - interaction.start.y) / zoom),
      } };
      positionsRef.current = next;
      return next;
    });
  };
  const finishInteraction = () => {
    if (interaction?.kind === 'node') {
      if (nodeMovedRef.current) {
        recordHistory();
        const position = positionsRef.current[interaction.nodeId];
        if (position) void saveWorkflow(selectedTeamId, {
          ...workflow,
          nodes: workflow.nodes.map((node) => node.id === interaction.nodeId ? { ...node, position } : node),
        });
      } else {
        setSelectedNodeId(interaction.nodeId);
        openNodeInspector();
      }
    }
    nodeMovedRef.current = false;
    setInteraction(null);
  };
  const handleDagShortcut = (event: React.KeyboardEvent) => {
    const target = event.target as HTMLElement;
    if (target.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return;
    const key = event.key.toLowerCase();
    if ((event.metaKey || event.ctrlKey) && key === 's') { event.preventDefault(); void saveWorkflow(selectedTeamId, { ...workflow, temporary: false }); }
    else if ((event.metaKey || event.ctrlKey) && key === 'z') { event.preventDefault(); void restoreHistory(event.shiftKey ? 'redo' : 'undo'); }
    else if ((event.metaKey || event.ctrlKey) && key === 'd' && selectedNodeId && !workflowLocked) { event.preventDefault(); duplicateNode(selectedNodeId); }
    else if (event.shiftKey && key === 'l') { event.preventDefault(); applyAutoLayout(); }
    else if (event.shiftKey && key === 'v') { event.preventDefault(); setSearchOpen(false); setWorkflowCheckOpen(value => !value); }
    else if (event.shiftKey && event.code === 'Digit1') { event.preventDefault(); fitView(); }
    else if (!event.metaKey && !event.ctrlKey && !event.altKey && key === 'a') { event.preventDefault(); openCreateNodeAtCenter(); }
    else if (!event.metaKey && !event.ctrlKey && !event.altKey && key === 'c' && selectedNodeId && !workflowLocked) { event.preventDefault(); setConnectingFromNodeId(value => value ? null : selectedNodeId); }
    else if (!event.metaKey && !event.ctrlKey && !event.altKey && key === 'e' && selectedNodeId) { event.preventDefault(); sharedPanel ? openNodeInspector() : setInspectorOpen(value => !value); }
    else if (event.key === '-' && !event.metaKey && !event.ctrlKey) { event.preventDefault(); changeZoom(zoomRef.current - 0.1); }
    else if ((event.key === '+' || event.key === '=') && !event.metaKey && !event.ctrlKey) { event.preventDefault(); changeZoom(zoomRef.current + 0.1); }
    else if (event.key === '0' && !event.metaKey && !event.ctrlKey) { event.preventDefault(); changeZoom(1); }
  };

  return <div className="dag-participation-stage relative h-full w-full overflow-hidden" onKeyDown={handleDagShortcut}>
    {team && nodes.find(node => node.id === participationId) && <ParticipationDetail team={team} node={nodes.find(node => node.id === participationId)!} onBack={() => setParticipationId(null)} onOpenWorkflow={openWorkflow} onOpen={(employeeId, workId) => { setParticipationId(null); selectEmployee(employeeId); openWorkbench(employeeId, workId); }} />}
    <header className="absolute left-4 top-4 z-30 flex min-h-12 items-center gap-2 rounded-xl border border-slate-200 bg-white/95 px-2 py-1.5 shadow-lg backdrop-blur" style={{right:mapRight}}>
      <Button variant="ghost" type="button" aria-label="选择工作编排" aria-expanded={navigationOpen} onClick={()=>setNavigationOpen(value=>!value)} className="h-8 shrink-0 px-2"><Layers className="mr-1 h-3.5 w-3.5"/>编排</Button>
      <div className="min-w-0 flex-1"><h2 className="truncate text-xs font-bold text-slate-900">{workflow.name}</h2><p className="truncate text-[9px] text-slate-500">{execution?.status === 'blocked' ? '编排受阻 · 查看节点任务与原因' : execution && !execution.enabled ? '编排已暂停 · 已启动工作可继续' : workflow.workId ? `所属任务：${linkedTask?.title ?? '任务引用暂不可用'}` : '单击节点配置 · 双击查看任务'}</p></div>
      <nav aria-label="DAG 编排工具栏" onKeyDown={event => { if (event.key === 'Escape') { setConnectingFromNodeId(null); canvasRef.current?.focus(); } }} style={toolbarPosition ? { position: 'absolute', left: toolbarPosition.x - 16, top: toolbarPosition.y - 16 } : undefined} className={`flex shrink-0 items-center gap-1 ${toolbarPosition ? 'z-50 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg' : 'border-l border-slate-200 pl-2'}`}>
        <button type="button" aria-label="拖动工具栏" title="拖动可将工具栏移出顶部；双击收回" className="touch-none cursor-grab rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 active:cursor-grabbing"
          onDoubleClick={() => setToolbarPosition(null)}
          onPointerDown={event => {
            if (event.button !== 0) return;
            event.preventDefault(); event.stopPropagation();
            const toolbar = event.currentTarget.parentElement!;
            const root = toolbar.closest('.dag-participation-stage')!.getBoundingClientRect();
            const rect = toolbar.getBoundingClientRect();
            toolbarDrag.current = { start: { x: event.clientX, y: event.clientY }, origin: { x: rect.left - root.left, y: rect.top - root.top }, moved: false };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={event => {
            const drag = toolbarDrag.current;
            if (!drag) return;
            event.stopPropagation();
            const dx = event.clientX - drag.start.x, dy = event.clientY - drag.start.y;
            if (!drag.moved && Math.hypot(dx, dy) < 4) return;
            drag.moved = true;
            const toolbar = event.currentTarget.parentElement!;
            const root = toolbar.closest('.dag-participation-stage')!.getBoundingClientRect();
            setToolbarPosition({ x: Math.max(8, Math.min(root.width - toolbar.offsetWidth - 8, drag.origin.x + dx)), y: Math.max(8, Math.min(root.height - toolbar.offsetHeight - 8, drag.origin.y + dy)) });
          }}
          onPointerUp={event => { event.stopPropagation(); toolbarDrag.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
          onPointerCancel={() => { toolbarDrag.current = null; }}
        ><GripVertical className="h-4 w-4" /></button>
        {toolbarPosition && <button type="button" aria-label="工具栏收回顶部" title="收回顶部" className="rounded p-1 text-slate-500 hover:bg-slate-100" onClick={() => setToolbarPosition(null)}><Pin className="h-3.5 w-3.5" /></button>}
        {!workflowHasStarted && <Button variant="primary" type="button" aria-label="开始编排" title="开始编排" onClick={() => void startWorkflow(selectedTeamId)} className="flex h-9 w-9 items-center justify-center p-0"><PlayCircle className="h-[18px] w-[18px]" /></Button>}
        <Button variant="secondary" type="button" disabled={workflowLocked} title={workflowLocked ? '流程正在运行，请暂停后编辑' : '新增节点（A）'} onClick={openCreateNodeAtCenter} className="flex h-9 w-9 items-center justify-center p-0" aria-label="新增节点"><SquarePlus className="h-[18px] w-[18px]" /></Button>
        <Button variant="secondary" type="button" disabled={workflowLocked || !selectedNode} aria-label="连线" aria-pressed={Boolean(connectingFromNodeId)} title={workflowLocked ? '流程正在运行，请暂停后编辑' : !selectedNode ? '连线（C）· 先选择一个上游节点' : '连线（C）· Esc 取消'} onClick={() => setConnectingFromNodeId(current => current ? null : selectedNodeId)} className={`flex h-9 w-9 items-center justify-center p-0 ${connectingFromNodeId ? 'bg-sky-100 text-sky-700 ring-1 ring-sky-300' : ''}`}><GitBranch className="h-[18px] w-[18px]" /></Button>
        <Button variant="secondary" type="button" disabled={!selectedNode} aria-label="配置节点" aria-pressed={inspectorOpen} title={selectedNode ? '配置节点（E）' : '配置节点（E）· 先选择一个节点'} onClick={() => sharedPanel ? openNodeInspector() : setInspectorOpen(value => !value)} className={`flex h-9 items-center justify-center gap-1.5 px-2.5 ${inspectorOpen ? 'border-sky-200 bg-sky-50 text-sky-700' : ''}`}><Settings2 className="h-[17px] w-[17px]" /><span className="text-[10px] font-semibold">配置节点</span></Button>
        <Button variant="secondary" type="button" disabled={workflowLocked || !selectedNode} aria-label="删除节点" title={workflowLocked ? '流程正在运行，请暂停后编辑' : selectedNode ? `删除 ${selectedNode.label}（Delete / Backspace）` : '删除节点（Delete / Backspace）· 先选择一个节点'} onClick={() => setDeleteNodeId(selectedNodeId)} className="flex h-9 w-9 items-center justify-center p-0 text-rose-600 hover:border-rose-200 hover:bg-rose-50"><Trash2 className="h-[18px] w-[18px]" /></Button>

        <span aria-hidden="true" className="mx-1 h-4 w-px bg-slate-200" />
        <Button variant="secondary" type="button" disabled={workflowLocked || !editHistory.undo.length || historySaving} aria-label="撤销" title={`撤销（${primaryModifier}+Z）`} onClick={() => void restoreHistory('undo')} className="flex h-9 w-9 items-center justify-center p-0"><Undo2 className="h-[18px] w-[18px]" /></Button>
        <Button variant="secondary" type="button" disabled={workflowLocked || !editHistory.redo.length || historySaving} aria-label="重做" title={`重做（${primaryModifier}+Shift+Z）`} onClick={() => void restoreHistory('redo')} className="flex h-9 w-9 items-center justify-center p-0"><Redo2 className="h-[18px] w-[18px]" /></Button>
        <Button variant="secondary" type="button" aria-label="自动布局" title="自动布局（Shift+L）" onClick={applyAutoLayout} className="flex h-9 w-9 items-center justify-center p-0"><Sparkles className="h-[18px] w-[18px]" /></Button>
        <Button variant="secondary" type="button" aria-label="查找任务" title={`查找任务（${primaryModifier}+F）`} onClick={() => setSearchOpen(true)} className="flex h-9 w-9 items-center justify-center p-0"><Search className="h-[18px] w-[18px]" /></Button>
        <Button variant="secondary" type="button" aria-label="检查编排" aria-pressed={workflowCheckOpen} title="检查结构与运行记录（Shift+V）" onClick={() => { setSearchOpen(false); setWorkflowCheckOpen(value => !value); }} className={`relative flex h-9 w-9 items-center justify-center p-0 ${workflowCheckOpen ? 'bg-sky-50 text-sky-700' : ''}`}><ListChecks className="h-[18px] w-[18px]" />{workflowChecks.some(issue => issue.level === 'error') && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-rose-500" />}</Button>
        <Button variant="secondary" type="button" aria-label="保存当前编排" title={`${workflow.temporary ? '保存到当前团队' : '保存当前修改'}（${primaryModifier}+S）`} onClick={() => void saveWorkflow(selectedTeamId, { ...workflow, temporary: false })} className="flex h-9 w-9 items-center justify-center p-0"><Save className="h-[18px] w-[18px]" /></Button>
        <Button variant="secondary" type="button" aria-label="缩小" title="缩小（-）" onClick={() => changeZoom(zoomRef.current - 0.1)} className="flex h-9 w-9 items-center justify-center p-0"><Minus className="h-[18px] w-[18px]" /></Button>
        <button type="button" aria-label="实际大小 100%" title="恢复 100% 大小（0）" onClick={() => changeZoom(1)} className="h-9 min-w-12 rounded-lg px-2 text-center text-[11px] font-semibold text-slate-600 hover:bg-slate-100">{Math.round(zoom * 100)}%</button>
        <Button variant="secondary" type="button" aria-label="放大" title="放大（+）" onClick={() => changeZoom(zoomRef.current + 0.1)} className="flex h-9 w-9 items-center justify-center p-0"><Plus className="h-[18px] w-[18px]" /></Button>
        <Button variant="secondary" type="button" aria-label="适应画布" title="适应画布（Shift+1）" onClick={() => fitView()} className="flex h-9 w-9 items-center justify-center p-0"><Maximize2 className="h-[18px] w-[18px]" /></Button>
      </nav>
      {parents.map(parent => <button key={parent.id} type="button" className="hidden shrink-0 text-[10px] text-sky-700 hover:underline xl:block" onClick={() => openWorkflow(parent.id)}>返回 {parent.name}</button>)}
    </header>

    <div className="relative flex h-full w-full flex-col overflow-hidden">

    <div ref={canvasRef} tabIndex={0} aria-label="任务图画布" onKeyDown={(event) => { if (event.key === 'Escape') { setSearchOpen(false); setSelectedNodeId(null); setConnectingFromNodeId(null); setNodeMenu(null); } else if ((event.key === 'Delete' || event.key === 'Backspace') && selectedNodeId && !workflowLocked) { event.preventDefault(); setDeleteNodeId(selectedNodeId); } }} className={`workflow-canvas relative min-h-0 flex-1 overflow-hidden ${interaction?.kind === 'pan' ? 'cursor-grabbing' : 'cursor-grab'}`}
      onPointerDown={(event) => {
        if (event.target !== event.currentTarget) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        setSelectedNodeId(null);
        setNodeMenu(null);
        setConnectingFromNodeId(null);
        setInteraction({ kind: 'pan', start: { x: event.clientX, y: event.clientY }, origin: pan });
      }} onPointerMove={onPointerMove} onPointerUp={finishInteraction} onPointerCancel={() => setInteraction(null)}
      onDoubleClick={(event) => { if (workflowLocked || event.target !== event.currentTarget) return; const rect = event.currentTarget.getBoundingClientRect(); setCreateNodeAt({ x: (event.clientX - rect.left - pan.x) / zoom - NODE_WIDTH / 2, y: (event.clientY - rect.top - pan.y) / zoom - NODE_HEIGHT / 2 }); setNewNodeLabel(`阶段 ${nodes.length + 1}`); setNewNodeEmployeeId(''); }}>

      {navigationOpen && <nav aria-label="团队编排方案" className="absolute bottom-16 left-4 top-20 z-30 flex w-48 flex-col rounded-xl border border-slate-200 bg-white/95 p-2 shadow-lg backdrop-blur">
        <div className="px-2 pb-2 text-[10px] font-bold text-slate-500">编排与任务图</div>
        <div className="min-h-0 flex-1 overflow-y-auto"><WorkflowNavigation workflows={workflows} selectedId={workflow.id} onSelect={openWorkflow}
          onRename={item => { void selectWorkflow(selectedTeamId, item.id).then(() => { setWorkflowNameDraft(item.name); setWorkflowDescriptionDraft(item.description ?? ''); setWorkflowInfoError(''); setWorkflowInfoOpen(true); }); }}
          onSave={item => void saveWorkflow(selectedTeamId, { ...item, temporary: false })}
          onDuplicate={item => void createWorkflow(selectedTeamId, { name: `${item.name} 副本`, description: item.description, temporary: false, sourceWorkflowId: item.id, workTypeId: item.workTypeId, leadEmployeeId: item.leadEmployeeId, participantEmployeeIds: item.participantEmployeeIds })} /></div>
        <Button type="button" onClick={() => { setNewWorkflowName(`临时工作 ${workflows.length + 1}`); setNewWorkflowTypeId(workTypes[0]?.id ?? ''); setNewWorkflowSourceId(''); setNewWorkflowWorkId(''); setCreateWorkflowOpen(true); }} className="mt-2 flex h-8 items-center justify-center gap-1 border border-dashed border-slate-300 text-[10px] text-slate-600 hover:bg-slate-50"><Plus className="h-3 w-3" />新建工作编排</Button>
        <Button type="button" onClick={() => { const leadId = team?.employees.find((employee) => employee.isLead)?.id ?? ''; setEditingWorkTypeId(''); setWorkTypeName(''); setWorkTypeLeadId(leadId); setWorkTypeParticipantIds(leadId ? [leadId] : []); setWorkTypePolicy('balanced'); setManageWorkTypesOpen(true); }} className="mt-1 h-8 text-[10px] text-slate-500 hover:bg-slate-50"><Settings2 className="mr-1 inline h-3 w-3" />管理工作类型</Button>
      </nav>}

      {execution && (execution.status === 'blocked' || !execution.enabled) && <div className="absolute left-4 top-[80px] z-30 max-w-sm">
        <WorkflowWorkControl key={`${selectedTeamId}:${workflow.id}`} execution={execution}
          onControl={continueWork => continueWorkflowWork(selectedTeamId, workflow.id, continueWork)}
          onOpenWork={workId => {
            const node = nodes.find(item => item.workItemId === workId);
            if (node) { setSelectedNodeId(node.id); openNodeInspector(); }
          }} />
      </div>}

      {workflowInfoOpen && <>
        <div className="absolute inset-0 z-30" onClick={() => setWorkflowInfoOpen(false)} />
        <form aria-label="编辑编排信息" style={{ right: mapRight }} className="absolute top-20 z-40 w-72 max-w-[calc(100%-32px)] space-y-2 rounded-xl border border-slate-200 bg-white p-3 shadow-lg" onKeyDown={event => { event.stopPropagation(); if (event.key === 'Escape') setWorkflowInfoOpen(false); }} onSubmit={async event => { event.preventDefault(); if (!workflowNameDraft.trim() || workflowInfoSaving) return; recordHistory(); setWorkflowInfoSaving(true); try { await saveWorkflow(selectedTeamId, { ...workflow, name: workflowNameDraft.trim(), description: workflowDescriptionDraft }); setWorkflowInfoOpen(false); } catch (error) { setWorkflowInfoError(error instanceof Error ? error.message : String(error)); } finally { setWorkflowInfoSaving(false); } }}>
          <label className="block text-xs text-slate-600">名称<Input autoFocus required value={workflowNameDraft} onChange={event => setWorkflowNameDraft(event.target.value)} className="mt-1 w-full" /></label>
          <label className="block text-xs text-slate-600">说明<Textarea value={workflowDescriptionDraft} onChange={event => setWorkflowDescriptionDraft(event.target.value)} className="mt-1 min-h-20 w-full" /></label>
          {workflowInfoError && <p role="alert" className="text-xs text-rose-600">{workflowInfoError}</p>}
          <div className="flex justify-end gap-2"><Button type="button" onClick={() => setWorkflowInfoOpen(false)}>取消</Button><Button variant="primary" type="submit" disabled={workflowInfoSaving || !workflowNameDraft.trim()}>保存</Button></div>
        </form>
      </>}
      <div className="pointer-events-none absolute inset-0" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: '0 0' }}>
        <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width={CANVAS_WIDTH} height={CANVAS_HEIGHT} aria-hidden="true">
          <defs><marker id="dag-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M 0 0 L 8 4 L 0 8 z" fill="#94a3b8" /></marker></defs>
          {nodes.flatMap((node) => (node.requires ?? []).map((requiredId) => {
            const from = positions[requiredId]; const to = positions[node.id];
            if (!from || !to) return null;
            return <path key={`${requiredId}-${node.id}`} d={edgePath(from, to, nodeDisplayMode === 'avatar')} fill="none" stroke={selectedNodeId && (node.id === selectedNodeId || requiredId === selectedNodeId) ? '#0ea5e9' : '#94a3b8'} opacity={selectedNodeId && node.id !== selectedNodeId && requiredId !== selectedNodeId ? 0.35 : 1} strokeWidth={selectedNodeId && (node.id === selectedNodeId || requiredId === selectedNodeId) ? 2.5 : 1.8} vectorEffect="non-scaling-stroke" strokeLinecap="round" markerEnd="url(#dag-arrow)" />;
          }))}
        </svg>

        {nodes.map((node) => {
          const point = positions[node.id]; if (!point) return null;
          const assignedEmployee = employees.find((employee) => employee.id === node.assignedEmployeeId);
          const selected = selectedNodeId === node.id;
          const isAccepting = !!assignedEmployee && dragHoveredEmployeeId === assignedEmployee.id && !!draggingWorkItemId;
          const actualWork = team ? findParticipationWork(team, node.workItemId) : undefined;
          const executionBlocker = executionBlockerForWork(execution, actualWork?.id);
          const actualStatus = executionBlocker ? 'blocked' : actualWork ? actualWork.status === 'pending' ? 'waiting' : actualWork.status === 'running' ? 'running' : actualWork.status === 'blocked' ? 'blocked' : 'completed' : node.status;
          const meta = { ...statusMeta[actualStatus], label: actualWork?.cancelledAt ? '已取消' : executionBlocker ? '执行受阻'  : actualWork?.deliveryStatus === 'submitted' ? '已提交 · 待验收' : actualWork?.deliveryStatus === 'changes_requested' ? '需修改' : actualWork?.deliveryStatus === 'accepted' ? '已验收' : actualStatus === 'completed' ? '执行结束' : statusMeta[actualStatus].label };
          return <article data-dag-node={node.id} key={node.id} role="button" tabIndex={0} aria-label={`${node.label}${assignedEmployee ? `，负责人 ${assignedEmployee.displayName}` : '，尚未指派负责人'}`}
            className={`group pointer-events-auto absolute select-none transition-[box-shadow,border-color,opacity] ${nodeDisplayMode === 'card' ? `grid grid-rows-[20px_40px_16px_16px_minmax(44px,1fr)] gap-y-1 rounded-xl border bg-white p-3.5 shadow-sm hover:shadow-md ${selected ? 'border-sky-500 ring-2 ring-sky-100' : 'border-slate-200'}` : ''} ${isAccepting ? 'ring-4 ring-emerald-300' : ''}`}
            style={{ opacity: selectedNodeId && !connectedNodeIds.has(node.id) ? 0.35 : 1, left: point.x, top: point.y, width: NODE_WIDTH, height: NODE_HEIGHT, zIndex: selected ? 10 : 1 }}
            onPointerDown={(event) => { event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); nodeMovedRef.current = false; setSelectedNodeId(node.id); setInteraction({ kind: 'node', nodeId: node.id, start: { x: event.clientX, y: event.clientY }, origin: point, moved: false }); }}
            onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); setSelectedNodeId(node.id); const rect = canvasRef.current?.getBoundingClientRect(); if (rect) setNodeMenu({ nodeId: node.id, x: event.clientX - rect.left, y: event.clientY - rect.top }); }}
            onDoubleClick={() => setParticipationId(node.id)}
            onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedNodeId(node.id); openNodeInspector(); } }}
            onDragOver={(event) => { event.preventDefault(); if (assignedEmployee) setDragHoveredEmployeeId(assignedEmployee.id); }} onDragLeave={() => setDragHoveredEmployeeId(null)}
            onDrop={(event) => { event.preventDefault(); if (assignedEmployee && draggingWorkItemId) dispatchWorkToEmployee(draggingWorkItemId, assignedEmployee.id); }}>
            <button disabled={workflowStarted} type="button" aria-label={`连接到 ${node.label}`} title={workflowStarted ? '流程执行后依赖关系不可修改' : connectingFromNodeId ? '设为下游节点' : '输入端口'} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); connectNodes(node); }} style={nodeDisplayMode === 'avatar' ? {left:NODE_WIDTH/2-38-8} : undefined} className={`group/port absolute -left-2 top-1/2 -translate-y-1/2 h-4 w-4 rounded-full border-2 border-white bg-slate-400 shadow-sm transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-50 hover:scale-150 hover:bg-sky-500 hover:ring-4 hover:ring-sky-200 ${connectingFromNodeId && connectingFromNodeId !== node.id ? 'scale-125 cursor-crosshair ring-4 ring-sky-200' : ''}`}><span className="pointer-events-none absolute left-1/2 top-5 hidden -translate-x-1/2 whitespace-nowrap rounded bg-slate-900 px-1.5 py-1 text-[8px] font-semibold text-white shadow-lg group-hover/port:block">输入 · 来自上游</span></button>
            <button disabled={workflowStarted} type="button" aria-label={`从 ${node.label} 开始连线`} title={workflowStarted ? '流程执行后依赖关系不可修改' : '点击后选择下游节点的输入端口'} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); setConnectingFromNodeId((current) => current === node.id ? null : node.id); }} style={nodeDisplayMode === 'avatar' ? {right:NODE_WIDTH/2-38-8} : undefined} className={`group/port absolute -right-2 top-1/2 -translate-y-1/2 h-4 w-4 rounded-full border-2 border-white bg-sky-500 shadow-sm transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-50 hover:scale-150 hover:bg-sky-600 hover:ring-4 hover:ring-sky-200 ${connectingFromNodeId === node.id ? 'scale-125 ring-4 ring-sky-200' : ''}`}><span className="pointer-events-none absolute left-1/2 top-5 hidden -translate-x-1/2 whitespace-nowrap rounded bg-slate-900 px-1.5 py-1 text-[8px] font-semibold text-white shadow-lg group-hover/port:block">输出 · 交给下游</span></button>
            {selected && <div className="dag-node-actions" style={{ width: 280, minWidth: 280, transform: `scale(${1 / zoom})`, transformOrigin: 'bottom left', left: (Math.max(32, Math.min(point.x * zoom + pan.x, canvasSize.width - (sharedPanel ? 16 : pendingPanelVisible || nodePanelExpanded ? pendingPanelWidth + 16 : 68) - 296)) - (point.x * zoom + pan.x)) / zoom }} role="group" aria-label={`${node.label} 就地操作`} onPointerDown={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
              {(executionBlocker || node.blockedReason) && <p className="mb-2 text-xs text-amber-700">{executionBlocker ? workflowBlockerMessage(executionBlocker) : node.blockedReason}</p>}
              <div className="flex items-center gap-1">
                <Button type="button" onClick={() => setParticipationId(node.id)}>查看任务与依据</Button>
                {!workflowLocked && <Button variant="primary" type="button" onClick={() => openNodeInspector()}><Settings2 className="mr-1 h-3.5 w-3.5" />配置节点</Button>}
                {assignedEmployee && actualWork && <Button type="button" onClick={() => { selectEmployee(assignedEmployee.id); openWorkbench(assignedEmployee.id, actualWork.id); }}>补充说明</Button>}
              </div>
            </div>}
            {nodeDisplayMode === 'avatar' ? <>
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full">
                {assignedEmployee ? <EmployeeBotAvatar size={76} bodyColor={assignedEmployee.color} status={assignedEmployee.status} showBadge={false} /> : <div className="grid h-[76px] w-[76px] place-items-center rounded-full bg-slate-100 text-slate-400"><AlertCircle className="h-8 w-8" /></div>}
              </div>
              <div className="pointer-events-none absolute left-1/2 top-[138px] rounded-lg border border-slate-200 bg-white/95 px-2 py-1.5 text-center shadow-sm" style={{ width: Math.max(72, Math.min(156, 310 * zoom)), transform: `translateX(-50%) scale(${1 / zoom})`, transformOrigin: 'top center' }}>
                <strong className="block truncate text-[11px] text-slate-800">{node.label}</strong>
                <span className="mt-0.5 block truncate text-[10px]" style={{ color: meta.dot }}>{meta.label}</span>
              </div>
            </> : <>
            <div className="flex min-h-5 items-center justify-between gap-2"><span className="shrink-0 text-[10px] text-slate-400">工作任务</span>
              <span className={`flex min-w-0 items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[9px] font-semibold ${meta.badge}`}>{node.status === 'running' ? <PlayCircle className="h-2.5 w-2.5 shrink-0" /> : node.status === 'completed' ? <CheckCircle2 className="h-2.5 w-2.5 shrink-0" /> : node.status === 'ready' ? <Clock className="h-2.5 w-2.5 shrink-0" /> : <AlertCircle className="h-2.5 w-2.5 shrink-0" />}<span className="truncate">{meta.label}</span></span>
            </div>
            <h3 className="line-clamp-2 text-sm font-bold leading-5 text-slate-800">{actualWork?.title ?? node.label}</h3><p className="truncate text-[10px] leading-4 text-slate-400">岗位：{node.roleName}</p>
            <div className="flex min-w-0 items-center gap-2 overflow-hidden text-[9px] font-medium leading-4 text-slate-500"><span className="shrink-0 whitespace-nowrap">输入 {node.inputDocumentIds?.length ?? 0}</span><span className="shrink-0 whitespace-nowrap">输出 {node.outputDocumentIds?.length ?? 0}</span><span className="min-w-0 truncate">{node.workItemId ? node.blockedReason ?? '任务已绑定' : '尚未绑定任务'}</span></div>
            <div className="flex min-h-0 items-center gap-2 self-stretch border-t border-slate-100 pt-2">{assignedEmployee ? <><EmployeeBotAvatar size={30} bodyColor={assignedEmployee.color} status={assignedEmployee.status} showBadge={false} /><div className="min-w-0"><div className="truncate text-[11px] font-semibold text-slate-700">{assignedEmployee.displayName}</div><div className="truncate text-[9px] text-slate-400">{assignedEmployee.runtime}</div></div></> : <span className="flex items-center gap-1 text-[10px] font-medium text-rose-500"><AlertCircle className="h-3 w-3" />待指派助手</span>}</div>
            </>}
          </article>;
        })}
      </div>

      <div className="absolute bottom-4 z-20 h-[98px] w-[180px] overflow-hidden rounded-lg border border-slate-200 bg-white/95 p-2 shadow-sm transition-[right] duration-300" style={{ right: sharedPanel ? 16 : pendingPanelVisible || nodePanelExpanded ? pendingPanelWidth + 16 : 68 }} aria-label="流程小地图"><div className="relative h-full w-full cursor-move bg-slate-50"
        onPointerDown={(event) => { event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); navigateMap(event); }}
        onPointerMove={(event) => { event.stopPropagation(); if (event.currentTarget.hasPointerCapture(event.pointerId)) navigateMap(event); }}
        onPointerUp={(event) => { event.stopPropagation(); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
        onDoubleClick={event => event.stopPropagation()}>
        {nodes.map((node) => positions[node.id] && <i key={node.id} title={node.label} className={`pointer-events-none absolute rounded-[2px] ${selectedNodeId === node.id ? 'bg-sky-500' : 'bg-slate-300'}`} style={{ left: `${(positions[node.id].x / mapWidth) * 100}%`, top: `${(positions[node.id].y / mapHeight) * 100}%`, width: `${NODE_WIDTH / mapWidth * 100}%`, height: `${NODE_HEIGHT / mapHeight * 100}%` }} />)}
        <span className="pointer-events-none absolute rounded border border-sky-400 bg-sky-100/20" style={{ left: `${((32 - pan.x) / zoom / mapWidth) * 100}%`, top: `${((96 - pan.y) / zoom / mapHeight) * 100}%`, width: `${Math.max(0, (canvasSize.width - 32 - mapRight) / zoom / mapWidth) * 100}%`, height: `${Math.max(0, (canvasSize.height - 168) / zoom / mapHeight) * 100}%` }} /></div></div>
      {connectingFromNodeId ? <div className="pointer-events-none absolute bottom-4 left-1/2 z-30 -translate-x-1/2"><span className="flex items-center gap-1.5 whitespace-nowrap rounded-full bg-sky-600 px-3 py-1.5 text-[10px] font-semibold text-white shadow-lg"><MousePointer2 className="h-3 w-3" />请选择下游节点左侧的输入端口</span></div> : !selectedNodeId && !inspectorOpen && !createNodeAt && <div className="pointer-events-none absolute bottom-4 left-1/2 z-30 -translate-x-1/2"><span className="flex items-center gap-1.5 whitespace-nowrap rounded-full bg-white/90 px-3 py-1.5 text-[10px] text-slate-400 shadow-sm"><MousePointer2 className="h-3 w-3" />单击节点打开配置 · 双击查看任务 · 拖动节点调整位置</span></div>}

      {nodeMenu && <div role="menu" aria-label="节点操作" className="absolute z-50 w-40 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl" style={{ left: Math.max(8, Math.min(nodeMenu.x, canvasSize.width - 168)), top: Math.max(8, Math.min(nodeMenu.y, canvasSize.height - 132)) }} onPointerDown={event => event.stopPropagation()}>
        <button autoFocus role="menuitem" type="button" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-100" onClick={() => { setSelectedNodeId(nodeMenu.nodeId); openNodeInspector(); setNodeMenu(null); }}><PanelRight className="h-4 w-4" />编辑节点</button>
        <button role="menuitem" type="button" disabled={workflowLocked} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-40" onClick={() => duplicateNode(nodeMenu.nodeId)}><Copy className="h-4 w-4" />创建副本</button>
        <button role="menuitem" type="button" disabled={workflowLocked} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-rose-600 hover:bg-rose-50 disabled:opacity-40" onClick={() => { setDeleteNodeId(nodeMenu.nodeId); setNodeMenu(null); }}><Trash2 className="h-4 w-4" />删除节点</button>
      </div>}

      {searchOpen && <section aria-label="画布查找" className="absolute top-4 z-40 w-80 max-w-[calc(100%-224px)] rounded-xl border border-slate-200 bg-white p-3 shadow-lg" style={{ right: mapRight }} onPointerDown={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()} onWheel={event => event.stopPropagation()} onKeyDown={event => { event.stopPropagation(); if (event.key === 'Escape') { setSearchOpen(false); canvasRef.current?.focus(); } }}>
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 shrink-0 text-slate-400" />
          <input ref={searchInputRef} autoFocus type="search" aria-label="搜索任务或助手" placeholder="任务、助手、岗位或状态" value={nodeQuery} onChange={event => { setNodeQuery(event.target.value); setSearchNodeId(null); }} onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); stepSearch(event.shiftKey ? -1 : 1); } }} className="min-w-0 flex-1 rounded border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-sky-400" />
          <button type="button" aria-label="关闭查找" title="关闭（Esc）" className="rounded p-1 text-slate-500 hover:bg-slate-100" onClick={() => { setSearchOpen(false); canvasRef.current?.focus(); }}><X className="h-4 w-4" /></button>
        </div>
          <div className="mt-3 max-h-72 overflow-y-auto" aria-label="任务搜索结果">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs text-slate-500" role="status">{searchMatches.length ? `${searchIndex + 1} / ${searchMatches.length}` : '没有匹配的任务'}</p>
              <div className="flex gap-1">
                <button type="button" aria-label="上一个匹配" title="上一个（Shift+Enter）" disabled={!searchMatches.length} onClick={() => stepSearch(-1)} className="rounded p-1 hover:bg-slate-100 disabled:opacity-30"><ChevronUp className="h-4 w-4" /></button>
                <button type="button" aria-label="下一个匹配" title="下一个（Enter）" disabled={!searchMatches.length} onClick={() => stepSearch(1)} className="rounded p-1 hover:bg-slate-100 disabled:opacity-30"><ChevronDown className="h-4 w-4" /></button>
              </div>
            </div>
            {searchMatches.map(node => <button key={node.id} type="button" aria-current={node.id === searchNodeId ? 'true' : undefined} onClick={() => focusNode(node.id, true)} className={`mb-1 block w-full rounded-lg border p-3 text-left hover:border-sky-400 hover:bg-sky-50 focus-visible:outline-sky-500 ${node.id === searchNodeId ? 'border-sky-400 bg-sky-50' : 'border-slate-200'}`}><span className="block break-words text-sm font-semibold text-slate-800">{node.label}</span><span className="mt-1 block text-xs text-slate-500">{employees.find(employee => employee.id === node.assignedEmployeeId)?.displayName ?? '待指派助手'} · {node.roleName} · {statusMeta[node.status].label}</span></button>)}
          </div>
      </section>}

      {workflowCheckOpen && <section aria-label="编排检查" className="absolute top-20 z-40 flex max-h-[calc(100%-160px)] w-80 max-w-[calc(100%-32px)] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl" style={{ right: mapRight }} onPointerDown={event => event.stopPropagation()} onKeyDown={event => { event.stopPropagation(); if (event.key === 'Escape') setWorkflowCheckOpen(false); }}>
        <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3"><div><strong className="text-xs text-slate-800">编排检查</strong><p className="mt-0.5 text-[9px] text-slate-400">结构问题与运行记录可直接定位到节点</p></div><button type="button" aria-label="关闭编排检查" onClick={() => setWorkflowCheckOpen(false)} className="rounded p-1 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button></header>
        <div className="min-h-0 overflow-y-auto p-3">
          <div className={`rounded-lg border p-3 ${workflowChecks.some(issue => issue.level === 'error') ? 'border-rose-200 bg-rose-50' : workflowChecks.length ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}><div className="flex items-center gap-2 text-xs font-semibold text-slate-700"><ListChecks className="h-4 w-4" />{workflowChecks.length ? `${workflowChecks.length} 项需要完善` : '结构检查通过'}</div><p className="mt-1 text-[9px] text-slate-500">{nodes.length} 个节点 · {nodes.reduce((sum, node) => sum + (node.requires?.length ?? 0), 0)} 条依赖</p></div>
          {workflowChecks.length > 0 && <div className="mt-3 space-y-1">{workflowChecks.map((issue, index) => { const node = nodes.find(item => item.id === issue.nodeId); return <button type="button" key={`${issue.nodeId}:${issue.message}:${index}`} onClick={() => { focusNode(issue.nodeId); openNodeInspector(); setWorkflowCheckOpen(false); }} className="flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left hover:bg-slate-50"><AlertCircle className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${issue.level === 'error' ? 'text-rose-500' : 'text-amber-500'}`} /><span className="min-w-0"><strong className="block truncate text-[10px] text-slate-700">{node?.label ?? '未知节点'}</strong><span className="text-[9px] text-slate-500">{issue.message}</span></span></button>; })}</div>}
          <div className="mt-4 border-t border-slate-100 pt-3"><div className="mb-2 flex items-center gap-2 text-[10px] font-semibold text-slate-600"><History className="h-3.5 w-3.5" />本次编排运行</div>{execution?.runs.length ? <div className="space-y-1">{execution.runs.map(run => { const node = nodes.find(item => item.workItemId === run.workId); const employee = employees.find(item => item.id === run.employeeId); return <button type="button" key={run.runId} onClick={() => node && focusNode(node.id)} disabled={!node} className="block w-full rounded-lg border border-slate-100 px-2.5 py-2 text-left hover:border-sky-200 hover:bg-sky-50 disabled:opacity-50"><strong className="block truncate text-[10px] text-slate-700">{node?.label ?? run.workId}</strong><span className="block truncate text-[9px] text-slate-400">{employee?.displayName ?? run.employeeId} · {run.runId}</span></button>; })}</div> : <p className="rounded-lg bg-slate-50 px-3 py-3 text-[9px] text-slate-400">尚无运行记录。启动编排后，节点执行会显示在这里。</p>}</div>
        </div>
      </section>}

      {createNodeAt && <Dialog open onClose={() => setCreateNodeAt(null)} title="创建流程节点" description="节点将放置在画布选定位置"><form className="dag-panel-content p-5" onSubmit={(event) => { event.preventDefault(); recordHistory(); const employee = employees.find((item) => item.id === newNodeEmployeeId); const nodeId = addWorkflowNode(selectedTeamId, createNodeAt); updateWorkflowNode(selectedTeamId, nodeId, { label: newNodeLabel.trim() || `阶段 ${nodes.length + 1}`, assignedEmployeeId: employee?.id, roleName: employee?.roleName ?? '待配置岗位' }); setCreateNodeAt(null); setSelectedNodeId(nodeId); openNodeInspector(); persistAfterLocalChange(); }}>

        <label className="mt-5 block text-[11px] font-semibold text-slate-600">节点名称<Input autoFocus value={newNodeLabel} onChange={(event) => setNewNodeLabel(event.target.value)} className="mt-1.5 w-full px-3 py-2.5 outline-none" /></label>
        <fieldset className="mt-4"><legend className="text-[11px] font-semibold text-slate-600">选择负责角色</legend><div className="mt-2 grid grid-cols-2 gap-2">{employees.map((employee) => <Button key={employee.id} type="button" onClick={() => setNewNodeEmployeeId(employee.id)} className={`flex items-center gap-2 rounded-xl border p-2.5 text-left transition-colors ${newNodeEmployeeId === employee.id ? 'border-sky-400 bg-sky-50' : 'border-slate-200 hover:bg-slate-50'}`}><EmployeeBotAvatar size={32} bodyColor={employee.color} status={employee.status} showBadge={false} /><span className="min-w-0"><strong className="block truncate text-[10px] text-slate-700">{employee.displayName}</strong><small className="block truncate text-[9px] text-slate-400">{employee.roleName}</small></span></Button>)}</div></fieldset>
        <Button variant="primary" type="submit" className="mt-5 h-10 w-full text-xs">创建节点</Button>
      </form></Dialog>}
      {deleteNodeId && <Dialog open onClose={() => setDeleteNodeId(null)} title="删除节点" description={`确定删除“${nodes.find(node => node.id === deleteNodeId)?.label ?? '该节点'}”吗？下游节点会同时移除对它的依赖。`}>
        <DialogFooter><Button type="button" onClick={() => setDeleteNodeId(null)}>取消</Button><Button variant="danger" type="button" onClick={() => { recordHistory(); removeWorkflowNode(selectedTeamId, deleteNodeId); persistAfterLocalChange(); setDeleteNodeId(null); setSelectedNodeId(null); setInspectorOpen(false); closeNodePanel(); }}>删除节点</Button></DialogFooter>
      </Dialog>}
      <Dialog open={createWorkflowOpen} onClose={() => setCreateWorkflowOpen(false)} title="新建工作编排" description="先按工作类型查找历史编排方案；一个具体任务最多关联一个 DAG。"><form className="space-y-4 p-5" onSubmit={(event) => { event.preventDefault(); if (!newWorkflowName.trim() || !newWorkflowTypeId) return; void createWorkflow(selectedTeamId, { name: newWorkflowName.trim(), temporary: true, workTypeId: newWorkflowTypeId, sourceWorkflowId: newWorkflowSourceId || undefined, workId: newWorkflowWorkId || undefined }).then(() => setCreateWorkflowOpen(false)); }}>
        <label className="block text-[11px] font-semibold text-slate-600">工作名称<Input autoFocus value={newWorkflowName} onChange={(event) => setNewWorkflowName(event.target.value)} className="mt-1.5 w-full" /></label>
        <label className="block text-[11px] font-semibold text-slate-600">工作类型<NativeSelect value={newWorkflowTypeId} onChange={(event) => { setNewWorkflowTypeId(event.target.value); setNewWorkflowSourceId(''); }} className="mt-1.5 w-full"><option value="">请选择团队工作类型</option>{workTypes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</NativeSelect></label>
        <label className="block text-[11px] font-semibold text-slate-600">关联任务（可选）<NativeSelect value={newWorkflowWorkId} onChange={(event) => { const id = event.target.value; setNewWorkflowWorkId(id); const task = availableDagWorks.find((work) => work?.id === id); if (task) setNewWorkflowName(task.title); }} className="mt-1.5 w-full"><option value="">不关联任务</option>{availableDagWorks.map((work) => <option key={work!.id} value={work!.id}>{work!.title}</option>)}</NativeSelect></label>
        <label className="block text-[11px] font-semibold text-slate-600">历史编排参考<NativeSelect value={newWorkflowSourceId} onChange={(event) => setNewWorkflowSourceId(event.target.value)} className="mt-1.5 w-full"><option value="">没有合适参考，从空白图开始</option>{historicalReferences.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</NativeSelect><span className="mt-1 block text-[9px] font-normal text-slate-400">这里只显示同一工作类型下已沉淀的团队编排。</span></label>
        <DialogFooter><Button type="button" variant="ghost" onClick={() => setCreateWorkflowOpen(false)}>取消</Button><Button type="submit" variant="primary" disabled={!newWorkflowName.trim() || !newWorkflowTypeId}>创建工作图</Button></DialogFooter>
      </form></Dialog>
      <Dialog open={manageWorkTypesOpen} onClose={() => setManageWorkTypesOpen(false)} title="管理工作类型" description="由团队负责人维护参与范围与分配方式；# 上下文自动绑定该类型。" size="lg"><form className="space-y-4 p-5" onSubmit={(event) => { event.preventDefault(); if (!workTypeName.trim() || !workTypeParticipantIds.length) return; void configureWorkType(selectedTeamId, { id: editingWorkTypeId || `type-${Date.now()}`, name: workTypeName.trim(), leadEmployeeId: workTypeLeadId || undefined, participantEmployeeIds: workTypeParticipantIds, assignmentPolicy: workTypePolicy, assignmentWeights: {} }).then(() => setManageWorkTypesOpen(false)); }}>
        {workTypes.length > 0 && <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="text-[10px] font-bold text-slate-500">已配置类型（点击编辑）</div><div className="mt-2 flex flex-wrap gap-2">{workTypes.map((item) => <button type="button" key={item.id} onClick={() => { setEditingWorkTypeId(item.id); setWorkTypeName(item.name); setWorkTypeLeadId(item.leadEmployeeId ?? ''); setWorkTypeParticipantIds(item.participantEmployeeIds); setWorkTypePolicy(item.assignmentPolicy); }} className={`rounded-full border bg-white px-2.5 py-1 text-[10px] ${editingWorkTypeId === item.id ? 'border-sky-400 text-sky-700' : 'border-slate-200 text-slate-600'}`}>#{item.name} · {item.assignmentPolicy === 'balanced' ? '均衡分配' : '手动分配'}</button>)}</div></div>}
        <label className="block text-[11px] font-semibold text-slate-600">类型名称<Input autoFocus value={workTypeName} onChange={(event) => setWorkTypeName(event.target.value)} placeholder="例如：数据工作" className="mt-1.5 w-full" /></label>
        <label className="block text-[11px] font-semibold text-slate-600">工作牵头人<NativeSelect value={workTypeLeadId} onChange={(event) => { const id = event.target.value; setWorkTypeLeadId(id); if (id) setWorkTypeParticipantIds((current) => [...new Set([...current, id])]); }} className="mt-1.5 w-full"><option value="">未指定</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.displayName}</option>)}</NativeSelect></label>
        <fieldset><legend className="text-[11px] font-semibold text-slate-600">工作范围内成员</legend><div className="mt-2 grid grid-cols-2 gap-2">{employees.map((employee) => { const checked = workTypeParticipantIds.includes(employee.id); return <label key={employee.id} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-[10px] ${checked ? 'border-sky-200 bg-sky-50 text-sky-700' : 'border-slate-200 text-slate-500'}`}><input type="checkbox" checked={checked} onChange={() => setWorkTypeParticipantIds((current) => checked ? current.filter((id) => id !== employee.id) : [...current, employee.id])} />{employee.displayName}</label>; })}</div></fieldset>
        <label className="block text-[11px] font-semibold text-slate-600">分配方式<NativeSelect value={workTypePolicy} onChange={(event) => setWorkTypePolicy(event.target.value as 'balanced' | 'manual')} className="mt-1.5 w-full"><option value="balanced">均衡分配（按当前负载选择成员）</option><option value="manual">手动指定</option></NativeSelect></label>
        <DialogFooter><Button type="button" variant="ghost" onClick={() => setManageWorkTypesOpen(false)}>取消</Button><Button type="submit" variant="primary" disabled={!workTypeName.trim() || !workTypeParticipantIds.length}>{editingWorkTypeId ? '更新工作类型' : '保存工作类型'}</Button></DialogFooter>
      </form></Dialog>
    </div>

    {nodePanelExpanded && selectedNode && (sharedPanel?.target || !sharedPanel) && createPortal(<aside className={sharedPanel ? "flex h-full min-h-0 flex-col overflow-hidden bg-white" : "absolute bottom-4 right-4 top-4 z-40 flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg"} style={sharedPanel ? undefined : { width: pendingPanelWidth }} aria-label="DAG 配置">
      <header className="flex items-center justify-between border-b p-4"><strong className="text-sm">{selectedNode ? '节点配置' : '编排配置'}</strong><Button aria-label="关闭配置" onClick={closeNodePanel}><X size={16} /></Button></header>
      <div className="min-h-0 flex-1 overflow-y-auto">
<div key={selectedNode?.id ?? 'workflow'} className="dag-panel-content">
      {selectedNode ? <div className="space-y-4 p-4">
        <label className="block text-[10px] font-semibold text-slate-500">节点名称<Input disabled={workflowStarted} name={`node-label-${selectedNode.id}`} value={selectedNode.label} onFocus={recordHistory} onChange={(event) => updateWorkflowNode(selectedTeamId, selectedNode.id, { label: event.target.value })} onBlur={persistCurrentWorkflow} className="mt-1.5 w-full px-3 py-2 text-[11px] outline-none" /></label>
        <label className="block text-[10px] font-semibold text-slate-500">岗位 / 职责<Input disabled={workflowStarted} name={`node-role-${selectedNode.id}`} value={selectedNode.roleName} onFocus={recordHistory} onChange={(event) => updateWorkflowNode(selectedTeamId, selectedNode.id, { roleName: event.target.value })} onBlur={persistCurrentWorkflow} className="mt-1.5 w-full px-3 py-2 text-[11px] outline-none" /></label>
        <label className="block text-[10px] font-semibold text-slate-500">工作目标<Textarea disabled={workflowStarted} name={`node-goal-${selectedNode.id}`} value={selectedNode.goal ?? ''} onFocus={recordHistory} onChange={(event) => updateWorkflowNode(selectedTeamId, selectedNode.id, { goal: event.target.value })} onBlur={persistCurrentWorkflow} placeholder="描述该节点要产出的结果" className="mt-1.5 min-h-20 w-full resize-none px-3 py-2 text-[11px] outline-none" /></label>
        <label className="block text-[10px] font-semibold text-slate-500">输入要求<Textarea disabled={Boolean(selectedNode.workItemId)} name={`node-input-${selectedNode.id}`} value={selectedNode.inputRequirements ?? ''} onFocus={recordHistory} onChange={(event) => updateWorkflowNode(selectedTeamId, selectedNode.id, { inputRequirements: event.target.value })} onBlur={persistCurrentWorkflow} placeholder="说明必须从上游获得的资料、格式或字段" className="mt-1.5 min-h-16 w-full resize-none px-3 py-2 text-[11px] outline-none" /></label>
        <label className="block text-[10px] font-semibold text-slate-500">输出要求<Textarea disabled={Boolean(selectedNode.workItemId)} name={`node-output-requirements-${selectedNode.id}`} value={selectedNode.outputRequirements ?? ''} onFocus={recordHistory} onChange={(event) => updateWorkflowNode(selectedTeamId, selectedNode.id, { outputRequirements: event.target.value })} onBlur={persistCurrentWorkflow} placeholder="说明交付物、格式与验收条件" className="mt-1.5 min-h-16 w-full resize-none px-3 py-2 text-[11px] outline-none" /></label>
        <label className="block text-[10px] font-semibold text-slate-500">输出去向<NativeSelect disabled={Boolean(selectedNode.workItemId)} name={`node-output-${selectedNode.id}`} value={selectedNode.outputPersistence ?? 'handoff'} onChange={(event) => updateNodeAndSave(selectedNode.id, { outputPersistence: event.target.value as RoleNode['outputPersistence'] })} className="mt-1.5 w-full px-3 py-2 text-[11px]"><option value="handoff">传递给下游节点</option><option value="database">传递并沉淀到流程数据库</option></NativeSelect></label>
        {selectedNode.workItemId && <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-[10px] text-slate-600"><div className="font-semibold text-slate-700">执行数据</div><div className="mt-1">输入文档 {selectedNode.inputDocumentIds?.length ?? 0} · 输出文档 {selectedNode.outputDocumentIds?.length ?? 0}</div>{selectedNode.blockedReason && <div className="mt-1 text-amber-700">{selectedNode.blockedReason}</div>}<div className="mt-1 truncate text-slate-400">工作项 {selectedNode.workItemId}</div></div>}
        <label className="block text-[10px] font-semibold text-slate-500">负责人<NativeSelect disabled={workflowStarted} name={`node-assignee-${selectedNode.id}`} value={selectedNode.assignedEmployeeId ?? ''} onChange={(event) => updateNodeAndSave(selectedNode.id, { assignedEmployeeId: event.target.value || undefined })} className="mt-1.5 w-full px-3 py-2 text-[11px]"><option value="">未指派</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.displayName}</option>)}</NativeSelect></label>
        <label className="block text-[10px] font-semibold text-slate-500">状态<NativeSelect disabled={Boolean(selectedNode.workItemId)} name={`node-status-${selectedNode.id}`} value={selectedNode.status} onChange={(event) => updateNodeAndSave(selectedNode.id, { status: event.target.value as RoleNode['status'] })} className="mt-1.5 w-full px-3 py-2 text-[11px]"><option value="waiting">等待上游</option><option value="ready">就绪</option><option value="running">执行中</option><option value="blocked">阻塞</option><option value="completed">已完成</option></NativeSelect>{selectedNode.workItemId && <span className="mt-1 block text-[9px] font-normal text-slate-400">由关联工作项自动更新</span>}</label>
        <fieldset disabled={workflowStarted}><legend className="text-[10px] font-semibold text-slate-500">上游依赖</legend><div className="mt-2 space-y-1.5">{nodes.filter((candidate) => candidate.id !== selectedNode.id).map((candidate) => { const active = selectedNode.requires?.includes(candidate.id) ?? false; return <label key={candidate.id} className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-[10px] ${workflowStarted ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'} ${active ? 'border-sky-200 bg-sky-50 text-sky-700' : 'border-slate-200 text-slate-500'}`}><input name={`node-dependency-${selectedNode.id}`} type="checkbox" checked={active} onChange={() => updateNodeAndSave(selectedNode.id, { requires: active ? (selectedNode.requires ?? []).filter((id) => id !== candidate.id) : [...(selectedNode.requires ?? []), candidate.id] })} />{candidate.label}</label>; })}</div></fieldset>
        <Button disabled={workflowStarted} type="button" onClick={() => setDeleteNodeId(selectedNode.id)} className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-rose-200 text-[11px] font-semibold text-rose-600 hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5" />删除节点</Button>
      </div> : null}
      </div></div>
    </aside>, sharedPanel?.target ?? canvasRef.current!.parentElement!)}
    </div>
  </div>;
};
