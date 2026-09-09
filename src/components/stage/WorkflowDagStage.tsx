import { Button, Input, NativeSelect, Textarea } from '../ui';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle, CheckCircle2, Clock, Focus, Maximize2, Minus, MousePointer2,
  PlayCircle, Plus, RotateCcw, Settings2, ShieldCheck, Sparkles, Trash2, X,
} from 'lucide-react';
import { WeWorkEmployee, RoleNode, WorkflowTemplate } from '../../domain/wework';
import { useWeWorkStore } from '../../state/weworkStore';
import { EmployeeBotAvatar } from '../employee/EmployeeBotAvatar';
import { PendingWorkBar } from '../layout/PendingWorkBar';
import { clampDagZoom, DAG_MAX_ZOOM, DAG_MIN_ZOOM, dagNodeDisplayMode } from './workflowSemanticZoom';

interface WorkflowDagStageProps {
  workflow?: WorkflowTemplate;
  employees: WeWorkEmployee[];
  pendingPanelWidth: number;
  onPendingPanelWidthChange: (width: number) => void;
  onOpenTeamChat: () => void;
}
type Point = { x: number; y: number };
type NodePositions = Record<string, Point>;

const NODE_WIDTH = 236;
const NODE_HEIGHT = 150;
const CANVAS_WIDTH = 1800;
const CANVAS_HEIGHT = 980;

const statusMeta: Record<RoleNode['status'], { label: string; dot: string; badge: string }> = {
  completed: { label: '已完成', dot: '#10b981', badge: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  running: { label: '执行中', dot: '#0ea5e9', badge: 'border-sky-200 bg-sky-50 text-sky-700' },
  ready: { label: '就绪', dot: '#f59e0b', badge: 'border-amber-200 bg-amber-50 text-amber-700' },
  waiting: { label: '等待', dot: '#94a3b8', badge: 'border-slate-200 bg-slate-50 text-slate-500' },
  blocked: { label: '阻塞', dot: '#f43f5e', badge: 'border-rose-200 bg-rose-50 text-rose-700' },
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

function edgePath(from: Point, to: Point) {
  const startX = from.x + NODE_WIDTH;
  const startY = from.y + NODE_HEIGHT / 2;
  const endX = to.x;
  const endY = to.y + NODE_HEIGHT / 2;
  const bend = Math.max(72, (endX - startX) * 0.5);
  return `M ${startX} ${startY} C ${startX + bend} ${startY}, ${endX - bend} ${endY}, ${endX} ${endY}`;
}

export const WorkflowDagStage: React.FC<WorkflowDagStageProps> = ({ workflow, employees, pendingPanelWidth, onPendingPanelWidthChange, onOpenTeamChat }) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [positions, setPositions] = useState<NodePositions>({});
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [nodePanelVisible, setNodePanelVisible] = useState(false);
  const [nodePanelExpanded, setNodePanelExpanded] = useState(false);
  const [pendingPanelVisible, setPendingPanelVisible] = useState(true);
  const [createNodeAt, setCreateNodeAt] = useState<Point | null>(null);
  const [connectingFromNodeId, setConnectingFromNodeId] = useState<string | null>(null);
  const [sideResize, setSideResize] = useState<{ startX: number; startWidth: number } | null>(null);
  const [newNodeLabel, setNewNodeLabel] = useState('');
  const [newNodeEmployeeId, setNewNodeEmployeeId] = useState('');
  const [canvasSize, setCanvasSize] = useState({ width: 1, height: 1 });
  const [zoom, setZoom] = useState(0.9);
  const [pan, setPan] = useState<Point>({ x: 24, y: 18 });
  const zoomRef = useRef(zoom);
  const panRef = useRef(pan);
  const positionsRef = useRef<NodePositions>({});
  const nodeMovedRef = useRef(false);
  const [workflowNameDraft, setWorkflowNameDraft] = useState(workflow?.name ?? '');
  const [workflowDescriptionDraft, setWorkflowDescriptionDraft] = useState(workflow?.description ?? '');
  const [interaction, setInteraction] = useState<
    { kind: 'pan'; start: Point; origin: Point } |
    { kind: 'node'; nodeId: string; start: Point; origin: Point; moved: boolean } | null
  >(null);
  const {
    selectedTeamId, openWorkbench, selectEmployee, draggingWorkItemId, dragHoveredEmployeeId,
    setDragHoveredEmployeeId, dispatchWorkToEmployee, saveWorkflow, addWorkflowNode,
    updateWorkflowNode, removeWorkflowNode,
  } = useWeWorkStore();

  const nodes = useMemo(() => workflow?.nodes ?? [], [workflow?.nodes]);
  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? null;
  const nodeDisplayMode = dagNodeDisplayMode(zoom);

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
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const preventPageZoom = (event: WheelEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      const previousZoom = zoomRef.current;
      const nextZoom = clampDagZoom(previousZoom - event.deltaY * 0.002);
      if (nextZoom === previousZoom) return;
      const rect = canvas.getBoundingClientRect();
      const pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      const previousPan = panRef.current;
      const worldPoint = { x: (pointer.x - previousPan.x) / previousZoom, y: (pointer.y - previousPan.y) / previousZoom };
      const nextPan = { x: pointer.x - worldPoint.x * nextZoom, y: pointer.y - worldPoint.y * nextZoom };
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

  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  useEffect(() => { panRef.current = pan; }, [pan]);
  useEffect(() => { positionsRef.current = positions; }, [positions]);

  useEffect(() => {
    if (!inspectorOpen) return;
    setNodePanelVisible(true);
    const frame = window.requestAnimationFrame(() => setNodePanelExpanded(true));
    const timer = window.setTimeout(() => fitView(pendingPanelWidth + 16), 0);
    return () => { window.cancelAnimationFrame(frame); window.clearTimeout(timer); };
  }, [inspectorOpen]);

  if (!workflow) {
    return <div className="flex h-full w-full flex-col items-center justify-center bg-slate-50 text-slate-400">
      <ShieldCheck className="mb-2 h-12 w-12 text-slate-300" strokeWidth={1.5} />
      <p className="text-sm font-medium">当前团队尚未配置流程 DAG</p>
      <Button variant="primary" type="button" onClick={() => { addWorkflowNode(selectedTeamId); const created = useWeWorkStore.getState().teams.find(team => team.id === selectedTeamId)?.workflow; if(created) void saveWorkflow(selectedTeamId, created); }} className="mt-4 flex items-center gap-1.5 px-3 py-2 text-xs"><Plus className="h-4 w-4" />创建流程</Button>
    </div>;
  }

  const persistCurrentWorkflow = () => {
    const current = useWeWorkStore.getState().teams.find((team) => team.id === selectedTeamId)?.workflow;
    if (current) void saveWorkflow(selectedTeamId, current);
  };
  const persistAfterLocalChange = () => window.setTimeout(persistCurrentWorkflow, 0);
  const closeNodePanel = () => setNodePanelExpanded(false);
  const updateNodeAndSave = (nodeId: string, patch: Partial<RoleNode>) => {
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
    const layout = autoLayout(nodes);
    setPositions(layout);
    void saveWorkflow(selectedTeamId, {
      ...workflow,
      nodes: workflow.nodes.map((node) => ({ ...node, position: layout[node.id] })),
    });
  };
  const resetView = () => { setZoom(0.9); setPan({ x: 24, y: 18 }); };
  const fitView = (reservedWidth = pendingPanelVisible || nodePanelExpanded ? pendingPanelWidth + 16 : 68) => {
    if (!canvasRef.current || nodes.length === 0) return;
    const points = nodes.map((node) => positions[node.id]).filter(Boolean);
    const minX = Math.min(...points.map((point) => point.x));
    const minY = Math.min(...points.map((point) => point.y));
    const maxX = Math.max(...points.map((point) => point.x + NODE_WIDTH));
    const maxY = Math.max(...points.map((point) => point.y + NODE_HEIGHT));
    const rect = canvasRef.current.getBoundingClientRect();
    const availableWidth = Math.max(320, rect.width - reservedWidth);
    const nextZoom = clampDagZoom(Math.min((availableWidth - 100) / (maxX - minX), (rect.height - 100) / (maxY - minY)));
    setZoom(nextZoom);
    setPan({ x: (availableWidth - (maxX - minX) * nextZoom) / 2 - minX * nextZoom, y: (rect.height - (maxY - minY) * nextZoom) / 2 - minY * nextZoom });
  };
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!interaction) return;
    if (interaction.kind === 'pan') {
      setPan({ x: interaction.origin.x + event.clientX - interaction.start.x, y: interaction.origin.y + event.clientY - interaction.start.y });
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
        const position = positionsRef.current[interaction.nodeId];
        if (position) void saveWorkflow(selectedTeamId, {
          ...workflow,
          nodes: workflow.nodes.map((node) => node.id === interaction.nodeId ? { ...node, position } : node),
        });
      } else {
        if (!inspectorOpen) window.setTimeout(() => fitView(), 0);
        setInspectorOpen(true);
      }
    }
    nodeMovedRef.current = false;
    setInteraction(null);
  };

  return <div className="relative h-full w-full overflow-hidden bg-white" onPointerMove={(event) => { if (sideResize) onPendingPanelWidthChange(Math.max(300, Math.min(520, sideResize.startWidth + sideResize.startX - event.clientX))); }} onPointerUp={() => setSideResize(null)} onPointerCancel={() => setSideResize(null)}>
    <header className="absolute left-4 top-4 z-30 max-w-[calc(100%-440px)] rounded-xl border border-slate-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur">
      <h2 className="truncate text-sm font-bold text-slate-900">{workflow.name}</h2>
    </header>

    <div className="relative flex h-full w-full flex-col overflow-hidden">
    <div className="relative flex h-full w-full flex-col overflow-hidden">

    <div ref={canvasRef} className={`workflow-canvas relative min-h-0 flex-1 overflow-hidden ${interaction?.kind === 'pan' ? 'cursor-grabbing' : 'cursor-grab'}`}
      onPointerDown={(event) => {
        if (event.target !== event.currentTarget) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        setSelectedNodeId(null);
        setConnectingFromNodeId(null);
        setInteraction({ kind: 'pan', start: { x: event.clientX, y: event.clientY }, origin: pan });
      }} onPointerMove={onPointerMove} onPointerUp={finishInteraction} onPointerCancel={() => setInteraction(null)}
      onDoubleClick={(event) => { if (event.target !== event.currentTarget) return; const rect = event.currentTarget.getBoundingClientRect(); setCreateNodeAt({ x: (event.clientX - rect.left - pan.x) / zoom - NODE_WIDTH / 2, y: (event.clientY - rect.top - pan.y) / zoom - NODE_HEIGHT / 2 }); setNewNodeLabel(`阶段 ${nodes.length + 1}`); setNewNodeEmployeeId(''); }}>

      <div className="absolute left-4 top-[68px] z-30 flex items-center gap-2">
        <Button variant="secondary" type="button" onClick={applyAutoLayout} className="flex h-9 items-center gap-1.5 px-3 text-[11px]"><Sparkles className="h-3.5 w-3.5" />自动布局</Button>
        <Button variant="secondary" type="button" onClick={() => { setSelectedNodeId(null); setInspectorOpen(true); }} className="flex h-9 items-center gap-1.5 px-3 text-[11px]"><Settings2 className="h-3.5 w-3.5" />编辑流程</Button>
      </div>

      <div className="pointer-events-none absolute inset-0" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: '0 0' }}>
        <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width={CANVAS_WIDTH} height={CANVAS_HEIGHT} aria-hidden="true">
          <defs><marker id="dag-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M 0 0 L 8 4 L 0 8 z" fill="#94a3b8" /></marker></defs>
          {nodes.flatMap((node) => (node.requires ?? []).map((requiredId) => {
            const from = positions[requiredId]; const to = positions[node.id];
            if (!from || !to) return null;
            return <path key={`${requiredId}-${node.id}`} d={edgePath(from, to)} fill="none" stroke="#94a3b8" strokeWidth="1.6" markerEnd="url(#dag-arrow)" />;
          }))}
        </svg>

        {nodes.map((node, index) => {
          const point = positions[node.id]; if (!point) return null;
          const assignedEmployee = employees.find((employee) => employee.id === node.assignedEmployeeId);
          const selected = selectedNodeId === node.id;
          const isAccepting = !!assignedEmployee && dragHoveredEmployeeId === assignedEmployee.id && !!draggingWorkItemId;
          const meta = statusMeta[node.status];
          return <article key={node.id} role="button" tabIndex={0} aria-label={`${node.label}${assignedEmployee ? `，负责人 ${assignedEmployee.displayName}` : '，尚未指派负责人'}`}
            className={`group pointer-events-auto absolute flex select-none flex-col transition-all ${nodeDisplayMode === 'card' ? `rounded-xl border bg-white p-3.5 shadow-sm hover:shadow-md ${selected ? 'border-sky-500 ring-2 ring-sky-100' : 'border-slate-200'}` : ''} ${isAccepting ? 'ring-4 ring-emerald-300' : ''}`}
            style={{ left: point.x, top: point.y, width: NODE_WIDTH, height: NODE_HEIGHT }}
            onPointerDown={(event) => { event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); nodeMovedRef.current = false; setSelectedNodeId(node.id); setInteraction({ kind: 'node', nodeId: node.id, start: { x: event.clientX, y: event.clientY }, origin: point, moved: false }); }}
            onDoubleClick={() => { if (assignedEmployee) { selectEmployee(assignedEmployee.id); openWorkbench(assignedEmployee.id); } }}
            onKeyDown={(event) => { if (event.key === 'Enter') { setSelectedNodeId(node.id); if (!inspectorOpen) window.setTimeout(() => fitView(), 0); setInspectorOpen(true); } }}
            onDragOver={(event) => { event.preventDefault(); if (assignedEmployee) setDragHoveredEmployeeId(assignedEmployee.id); }} onDragLeave={() => setDragHoveredEmployeeId(null)}
            onDrop={(event) => { event.preventDefault(); if (assignedEmployee && draggingWorkItemId) dispatchWorkToEmployee(draggingWorkItemId, assignedEmployee.id); }}>
            <button type="button" aria-label={`连接到 ${node.label}`} title={connectingFromNodeId ? '设为下游节点' : '输入端口'} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); connectNodes(node); }} className={`group/port absolute -left-2 top-[67px] h-4 w-4 rounded-full border-2 border-white bg-slate-400 shadow-sm transition-all duration-150 hover:scale-150 hover:bg-sky-500 hover:ring-4 hover:ring-sky-200 ${connectingFromNodeId && connectingFromNodeId !== node.id ? 'scale-125 cursor-crosshair ring-4 ring-sky-200' : ''}`}><span className="pointer-events-none absolute left-1/2 top-5 hidden -translate-x-1/2 whitespace-nowrap rounded bg-slate-900 px-1.5 py-1 text-[8px] font-semibold text-white shadow-lg group-hover/port:block">输入 · 下游</span></button>
            <button type="button" aria-label={`从 ${node.label} 开始连线`} title="点击后选择下游节点的输入端口" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); setConnectingFromNodeId((current) => current === node.id ? null : node.id); }} className={`group/port absolute -right-2 top-[67px] h-4 w-4 rounded-full border-2 border-white bg-sky-500 shadow-sm transition-all duration-150 hover:scale-150 hover:bg-sky-600 hover:ring-4 hover:ring-sky-200 ${connectingFromNodeId === node.id ? 'scale-125 ring-4 ring-sky-200' : ''}`}><span className="pointer-events-none absolute left-1/2 top-5 hidden -translate-x-1/2 whitespace-nowrap rounded bg-slate-900 px-1.5 py-1 text-[8px] font-semibold text-white shadow-lg group-hover/port:block">输出 · 上游</span></button>
            {nodeDisplayMode === 'avatar' ? <>
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white p-2 shadow-lg ring-2 ring-white transition-transform group-hover:scale-110">
                {assignedEmployee ? <EmployeeBotAvatar size={76} bodyColor={assignedEmployee.color} status={assignedEmployee.status} showBadge={false} /> : <div className="grid h-[76px] w-[76px] place-items-center rounded-full bg-slate-100 text-slate-400"><AlertCircle className="h-8 w-8" /></div>}
              </div>
              <div className="pointer-events-none absolute left-1/2 top-[138px] z-50 hidden w-56 -translate-x-1/2 rounded-xl border border-slate-200 bg-white p-3 text-left shadow-xl group-hover:block" style={{ transform: `translateX(-50%) scale(${1 / zoom})`, transformOrigin: 'top center' }}>
                <div className="flex items-center justify-between gap-2"><strong className="truncate text-xs text-slate-900">{node.label}</strong><span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-semibold ${meta.badge}`}>{meta.label}</span></div>
                <p className="mt-1 text-[10px] text-slate-500">岗位：{node.roleName}</p>
                <p className="mt-2 border-t border-slate-100 pt-2 text-[10px] font-semibold text-slate-700">{assignedEmployee?.displayName ?? '待指派助手'}</p>
              </div>
            </> : <>
            <div className="flex items-center justify-between"><span className="text-[10px] font-bold tracking-[0.12em] text-slate-400">STEP {String(index + 1).padStart(2, '0')}</span>
              <span className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-semibold ${meta.badge}`}>{node.status === 'running' ? <PlayCircle className="h-2.5 w-2.5" /> : node.status === 'completed' ? <CheckCircle2 className="h-2.5 w-2.5" /> : node.status === 'ready' ? <Clock className="h-2.5 w-2.5" /> : <AlertCircle className="h-2.5 w-2.5" />}{meta.label}</span>
            </div>
            <h3 className="mt-2 truncate text-xs font-bold text-slate-800">{node.label}</h3><p className="mt-1 truncate text-[10px] text-slate-400">岗位：{node.roleName}</p>
            <div className="mt-auto flex items-center gap-2 border-t border-slate-100 pt-2.5">{assignedEmployee ? <><EmployeeBotAvatar size={30} bodyColor={assignedEmployee.color} status={assignedEmployee.status} showBadge={false} /><div className="min-w-0"><div className="truncate text-[11px] font-semibold text-slate-700">{assignedEmployee.displayName}</div><div className="truncate text-[9px] text-slate-400">{assignedEmployee.runtime}</div></div></> : <span className="flex items-center gap-1 text-[10px] font-medium text-rose-500"><AlertCircle className="h-3 w-3" />待指派助手</span>}</div>
            </>}
          </article>;
        })}
      </div>

      <div className="absolute bottom-4 left-4 z-30 flex h-9 items-center overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <button type="button" aria-label="缩小" onClick={() => setZoom((value) => Math.max(DAG_MIN_ZOOM, value - 0.1))} className="grid h-full w-9 place-items-center text-slate-500 hover:bg-slate-50"><Minus className="h-3.5 w-3.5" /></button><span className="w-12 text-center text-[10px] font-semibold text-slate-600">{Math.round(zoom * 100)}%</span>
        <button type="button" aria-label="放大" onClick={() => setZoom((value) => Math.min(DAG_MAX_ZOOM, value + 0.1))} className="grid h-full w-9 place-items-center text-slate-500 hover:bg-slate-50"><Plus className="h-3.5 w-3.5" /></button><span className="h-5 w-px bg-slate-200" />
        <button type="button" aria-label="适应画布" onClick={() => fitView()} className="grid h-full w-9 place-items-center text-slate-500 hover:bg-slate-50"><Maximize2 className="h-3.5 w-3.5" /></button><button type="button" aria-label="重置视图" onClick={resetView} className="grid h-full w-9 place-items-center text-slate-500 hover:bg-slate-50"><RotateCcw className="h-3.5 w-3.5" /></button>
      </div>
      <div className="absolute bottom-4 z-20 h-[98px] w-[180px] overflow-hidden rounded-lg border border-slate-200 bg-white/95 p-2 shadow-sm transition-[right] duration-300" style={{ right: pendingPanelVisible || nodePanelExpanded ? pendingPanelWidth + 16 : 68 }} aria-label="流程小地图"><div className="relative h-full w-full cursor-move bg-slate-50"
        onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); const rect = event.currentTarget.getBoundingClientRect(); const worldX = ((event.clientX - rect.left) / rect.width) * CANVAS_WIDTH; const worldY = ((event.clientY - rect.top) / rect.height) * CANVAS_HEIGHT; setPan({ x: canvasSize.width / 2 - worldX * zoom, y: canvasSize.height / 2 - worldY * zoom }); }}
        onPointerMove={(event) => { if (!event.currentTarget.hasPointerCapture(event.pointerId)) return; const rect = event.currentTarget.getBoundingClientRect(); const worldX = ((event.clientX - rect.left) / rect.width) * CANVAS_WIDTH; const worldY = ((event.clientY - rect.top) / rect.height) * CANVAS_HEIGHT; setPan({ x: canvasSize.width / 2 - worldX * zoom, y: canvasSize.height / 2 - worldY * zoom }); }}>
        {nodes.map((node) => positions[node.id] && <i key={node.id} className="absolute h-2.5 w-5 rounded-[2px] bg-slate-300" style={{ left: `${(positions[node.id].x / CANVAS_WIDTH) * 100}%`, top: `${(positions[node.id].y / CANVAS_HEIGHT) * 100}%` }} />)}
        <span className="pointer-events-none absolute rounded border border-sky-400 bg-sky-100/20" style={{ left: `${Math.max(0, (-pan.x / zoom / CANVAS_WIDTH) * 100)}%`, top: `${Math.max(0, (-pan.y / zoom / CANVAS_HEIGHT) * 100)}%`, width: `${Math.min(100, (canvasSize.width / zoom / CANVAS_WIDTH) * 100)}%`, height: `${Math.min(100, (canvasSize.height / zoom / CANVAS_HEIGHT) * 100)}%` }} /></div></div>
      {connectingFromNodeId ? <div className="pointer-events-none absolute bottom-4 left-1/2 z-30 -translate-x-1/2"><span className="flex items-center gap-1.5 whitespace-nowrap rounded-full bg-sky-600 px-3 py-1.5 text-[10px] font-semibold text-white shadow-lg"><MousePointer2 className="h-3 w-3" />请选择下游节点左侧的输入端口</span></div> : !selectedNodeId && !inspectorOpen && !createNodeAt && <div className="pointer-events-none absolute bottom-4 left-1/2 z-30 -translate-x-1/2"><span className="flex items-center gap-1.5 whitespace-nowrap rounded-full bg-white/90 px-3 py-1.5 text-[10px] text-slate-400 shadow-sm"><MousePointer2 className="h-3 w-3" />拖拽节点调整布局 · 点击端口连接依赖 · 双击空白处创建节点</span></div>}

      {createNodeAt && <div className="absolute inset-0 z-50 grid place-items-center bg-slate-900/10" onPointerDown={(event) => event.stopPropagation()}><form className="dag-panel-content w-[380px] rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl" onSubmit={(event) => { event.preventDefault(); const employee = employees.find((item) => item.id === newNodeEmployeeId); const nodeId = addWorkflowNode(selectedTeamId, createNodeAt); updateWorkflowNode(selectedTeamId, nodeId, { label: newNodeLabel.trim() || `阶段 ${nodes.length + 1}`, assignedEmployeeId: employee?.id, roleName: employee?.roleName ?? '待配置岗位' }); setCreateNodeAt(null); setSelectedNodeId(nodeId); setInspectorOpen(true); persistAfterLocalChange(); }}>
        <div className="flex items-start justify-between"><div><h3 className="text-sm font-bold text-slate-900">创建流程节点</h3><p className="mt-1 text-[11px] text-slate-400">节点将放置在刚才双击的位置</p></div><Button variant="ghost" type="button" aria-label="取消创建节点" onClick={() => setCreateNodeAt(null)} className="grid h-7 w-7 place-items-center"><X className="h-4 w-4" /></Button></div>
        <label className="mt-5 block text-[11px] font-semibold text-slate-600">节点名称<Input autoFocus value={newNodeLabel} onChange={(event) => setNewNodeLabel(event.target.value)} className="mt-1.5 w-full px-3 py-2.5 outline-none" /></label>
        <fieldset className="mt-4"><legend className="text-[11px] font-semibold text-slate-600">选择负责角色</legend><div className="mt-2 grid grid-cols-2 gap-2">{employees.map((employee) => <Button key={employee.id} type="button" onClick={() => setNewNodeEmployeeId(employee.id)} className={`flex items-center gap-2 rounded-xl border p-2.5 text-left transition-colors ${newNodeEmployeeId === employee.id ? 'border-sky-400 bg-sky-50' : 'border-slate-200 hover:bg-slate-50'}`}><EmployeeBotAvatar size={32} bodyColor={employee.color} status={employee.status} showBadge={false} /><span className="min-w-0"><strong className="block truncate text-[10px] text-slate-700">{employee.displayName}</strong><small className="block truncate text-[9px] text-slate-400">{employee.roleName}</small></span></Button>)}</div></fieldset>
        <Button variant="primary" type="submit" className="mt-5 h-10 w-full text-xs">创建节点</Button>
      </form></div>}
    </div>

    </div>

    <>{(pendingPanelVisible || nodePanelExpanded) && <div role="separator" aria-label="调整 DAG 与协作抽屉宽度" aria-orientation="vertical" onPointerDown={(event) => { event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); setSideResize({ startX: event.clientX, startWidth: pendingPanelWidth }); }} className="group absolute bottom-4 top-4 z-50 w-2 cursor-col-resize" style={{ right: pendingPanelWidth + 12 }}><span className="absolute bottom-1/2 left-1/2 h-12 w-1 -translate-x-1/2 translate-y-1/2 rounded-full bg-slate-300 transition-colors group-hover:bg-sky-400" /></div>}
    <aside className="dag-side-workspace pointer-events-auto absolute bottom-4 right-4 top-4 z-40 transition-[width] duration-300 ease-out" style={{ width: pendingPanelVisible || nodePanelExpanded ? pendingPanelWidth : 52 }} aria-label="DAG 右侧工作区">
      <PendingWorkBar embedded onExpandedChange={setPendingPanelVisible} onOpenTeamChat={onOpenTeamChat} auxiliaryDrawer={{
        visible: nodePanelVisible,
        expanded: nodePanelExpanded,
        title: selectedNode ? '节点配置' : '流程配置',
        subtitle: '修改会自动保存',
        onOpen: () => { setNodePanelVisible(true); setInspectorOpen(true); setNodePanelExpanded(true); },
        onClose: closeNodePanel,
        onCollapsed: () => { setNodePanelVisible(false); setInspectorOpen(false); },
        content: <div key={selectedNode?.id ?? 'workflow'} className="dag-panel-content">
      {selectedNode ? <div className="space-y-4 p-4">
        <label className="block text-[10px] font-semibold text-slate-500">节点名称<Input name={`node-label-${selectedNode.id}`} value={selectedNode.label} onChange={(event) => updateWorkflowNode(selectedTeamId, selectedNode.id, { label: event.target.value })} onBlur={persistCurrentWorkflow} className="mt-1.5 w-full px-3 py-2 text-[11px] outline-none" /></label>
        <label className="block text-[10px] font-semibold text-slate-500">岗位 / 职责<Input name={`node-role-${selectedNode.id}`} value={selectedNode.roleName} onChange={(event) => updateWorkflowNode(selectedTeamId, selectedNode.id, { roleName: event.target.value })} onBlur={persistCurrentWorkflow} className="mt-1.5 w-full px-3 py-2 text-[11px] outline-none" /></label>
        <label className="block text-[10px] font-semibold text-slate-500">负责人<NativeSelect name={`node-assignee-${selectedNode.id}`} value={selectedNode.assignedEmployeeId ?? ''} onChange={(event) => updateNodeAndSave(selectedNode.id, { assignedEmployeeId: event.target.value || undefined })} className="mt-1.5 w-full px-3 py-2 text-[11px]"><option value="">未指派</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.displayName}</option>)}</NativeSelect></label>
        <label className="block text-[10px] font-semibold text-slate-500">状态<NativeSelect name={`node-status-${selectedNode.id}`} value={selectedNode.status} onChange={(event) => updateNodeAndSave(selectedNode.id, { status: event.target.value as RoleNode['status'] })} className="mt-1.5 w-full px-3 py-2 text-[11px]"><option value="waiting">等待上游</option><option value="ready">就绪</option><option value="running">执行中</option><option value="blocked">阻塞</option><option value="completed">已完成</option></NativeSelect></label>
        <fieldset><legend className="text-[10px] font-semibold text-slate-500">上游依赖</legend><div className="mt-2 space-y-1.5">{nodes.filter((candidate) => candidate.id !== selectedNode.id).map((candidate) => { const active = selectedNode.requires?.includes(candidate.id) ?? false; return <label key={candidate.id} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-[10px] ${active ? 'border-sky-200 bg-sky-50 text-sky-700' : 'border-slate-200 text-slate-500'}`}><input name={`node-dependency-${selectedNode.id}`} type="checkbox" checked={active} onChange={() => updateNodeAndSave(selectedNode.id, { requires: active ? (selectedNode.requires ?? []).filter((id) => id !== candidate.id) : [...(selectedNode.requires ?? []), candidate.id] })} />{candidate.label}</label>; })}</div></fieldset>
        <Button type="button" onClick={() => { removeWorkflowNode(selectedTeamId, selectedNode.id); persistAfterLocalChange(); setSelectedNodeId(null); closeNodePanel(); }} className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-rose-200 text-[11px] font-semibold text-rose-600 hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5" />删除节点</Button>
      </div> : <div className="space-y-4 p-4">
        <label className="block text-[10px] font-semibold text-slate-500">流程名称<Input name="workflow-name" value={workflowNameDraft} onChange={(event) => setWorkflowNameDraft(event.target.value)} onBlur={() => void saveWorkflow(selectedTeamId, { ...workflow, name: workflowNameDraft })} className="mt-1.5 w-full px-3 py-2 text-[11px] outline-none" /></label>
        <label className="block text-[10px] font-semibold text-slate-500">流程说明<Textarea name="workflow-description" value={workflowDescriptionDraft} onChange={(event) => setWorkflowDescriptionDraft(event.target.value)} onBlur={() => void saveWorkflow(selectedTeamId, { ...workflow, description: workflowDescriptionDraft })} className="mt-1.5 min-h-24 w-full resize-none px-3 py-2 text-[11px] outline-none" /></label>
        <Button type="button" onClick={applyAutoLayout} className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"><Focus className="h-3.5 w-3.5" />重新整理节点</Button>
      </div>}
      </div>,
      }} />
    </aside></>
    </div>
  </div>;
};
