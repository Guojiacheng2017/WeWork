import { employeeWorkStatus, employeeRingState } from '../domain/employeeWorkStatus';
import { Button } from './ui';
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import * as THREE from "three";
import type { WeWorkEmployee, WorkItem } from "../domain/wework";
import {
  CAMERA_FOV,
  TABLE_RADIUS,
  TABLE_THICKNESS,
  cycleSeatIndex,
  getEmployeeWorldPosition,
  getCameraAzimuth,
  getCameraPolar,
  getCameraRadius,
  getAnimatedSeatPresentation,
  stageAnimationDelta,
  isStageCameraSettled,
  projectEmployeeAnchor,
  type EmployeeProjection,
  type StageMode,
} from "../domain/weworkStage";
import { WeWorkEmployeeAvatar } from "./WeWorkEmployeeAvatar";

type StageSeat =
  | { key: string; kind: "employee"; employee: WeWorkEmployee }
  | { key: "add-employee"; kind: "add" };

type ProjectionFrame = { projections: EmployeeProjection[]; settled: boolean; eyeLevelProgress: number; azimuth: number; ready: boolean };

const ADD_EMPLOYEE_SEAT: StageSeat = { key: "add-employee", kind: "add" };

function useSystemReducedMotion() {
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return reduced;
}

function employeeSeatKey(employeeId: string) {
  return `employee:${employeeId}`;
}

function shortestAngleTarget(current: number, target: number) {
  return current + Math.atan2(Math.sin(target - current), Math.cos(target - current));
}

function StageCamera({
  seatCount,
  mode,
  selectedIndex,
  reducedMotion,
  onProjection,
}: {
  seatCount: number;
  mode: StageMode;
  selectedIndex: number;
  reducedMotion: boolean;
  onProjection: (frame: ProjectionFrame) => void;
}) {
  const { camera, invalidate, size } = useThree();
  const polar = useRef(getCameraPolar(mode));
  const radius = useRef(getCameraRadius(mode));
  const azimuth = useRef(getCameraAzimuth(selectedIndex, seatCount));
  const lastFrame = useRef<ProjectionFrame | null>(null);
  const perspectiveCamera = camera as THREE.PerspectiveCamera;

  useEffect(() => {
    lastFrame.current = null;
    invalidate();
  }, [invalidate, mode, reducedMotion, seatCount, selectedIndex, size.height, size.width]);

  useFrame((_, elapsed) => {
    const delta = stageAnimationDelta(elapsed);
    const targetPolar = getCameraPolar(mode);
    const targetRadius = getCameraRadius(mode);
    const rawTargetAzimuth = getCameraAzimuth(selectedIndex, seatCount);
    const targetAzimuth = shortestAngleTarget(azimuth.current, rawTargetAzimuth);
    if (reducedMotion) {
      polar.current = targetPolar;
      radius.current = targetRadius;
      azimuth.current = targetAzimuth;
    } else {
      polar.current = THREE.MathUtils.damp(polar.current, targetPolar, 7.5, delta);
      radius.current = THREE.MathUtils.damp(radius.current, targetRadius, 7.5, delta);
      azimuth.current = THREE.MathUtils.damp(azimuth.current, targetAzimuth, 8.5, delta);
    }

    perspectiveCamera.position.setFromSphericalCoords(radius.current, polar.current, azimuth.current);
    perspectiveCamera.lookAt(0, 0, 0);
    perspectiveCamera.updateMatrixWorld();

    const projections = Array.from({ length: seatCount }, (_, index) => projectEmployeeAnchor(
      getEmployeeWorldPosition(index, seatCount),
      perspectiveCamera,
      size.width,
      size.height,
    ));
    const topDownPolar = getCameraPolar("topDown");
    const eyeLevelPolar = getCameraPolar("eyeLevel");
    const eyeLevelProgress = THREE.MathUtils.clamp(
      (polar.current - topDownPolar) / (eyeLevelPolar - topDownPolar),
      0,
      1,
    );
    const settled = isStageCameraSettled(
      { polar: polar.current, radius: radius.current, azimuth: azimuth.current },
      { polar: targetPolar, radius: targetRadius, azimuth: targetAzimuth },
    );
    const previous = lastFrame.current;
    const changed = !previous || previous.settled !== settled
      || Math.abs(previous.eyeLevelProgress - eyeLevelProgress) > 0.002
      || previous.projections.length !== projections.length
      || projections.some((point, index) => {
      const prior = previous.projections[index];
      return !prior || Math.abs(point.x - prior.x) > 0.35 || Math.abs(point.y - prior.y) > 0.35 || Math.abs(point.size - prior.size) > 0.25;
    });
    if (changed) {
      const next = { projections, settled, eyeLevelProgress, azimuth: azimuth.current, ready: true };
      lastFrame.current = next;
      onProjection(next);
    }
    if (!settled) invalidate();
  });

  return null;
}

function TableScene() {
  return (
    <>
      <color attach="background" args={["#eef0f2"]} />
      <mesh position={[0, -TABLE_THICKNESS / 2, 0]}>
        <cylinderGeometry args={[TABLE_RADIUS, TABLE_RADIUS, TABLE_THICKNESS, 96]} />
        <meshBasicMaterial color="#ffffff" toneMapped={false} />
      </mesh>
    </>
  );
}

export function WeWorkStage3D({
  employees,
  deliveries,
  mode,
  selectedEmployeeId,
  onModeChange,
  onSelectEmployee,
  onOpenEmployee,
  onAddEmployee,
  draggedWork,
  onAssignWork,
  hideAddSeat = false,
  onFocusSettled,
}: {
  employees: WeWorkEmployee[];
  deliveries?: import('../domain/wework').WeWorkTeam['collaborationDeliveries'];
  mode: StageMode;
  selectedEmployeeId: string | null;
  onModeChange: (mode: StageMode) => void;
  onSelectEmployee: (employeeId: string) => void;
  onOpenEmployee: () => void;
  onAddEmployee: () => void;
  draggedWork?: WorkItem | null;
  onAssignWork?: (work: WorkItem, employee: WeWorkEmployee) => void;
  hideAddSeat?: boolean;
  onFocusSettled?: (employeeId: string) => void;
}) {
  const reducedMotion = useSystemReducedMotion();
  const seats = useMemo<StageSeat[]>(() => [
    ...employees.map((employee) => ({ key: employeeSeatKey(employee.id), kind: "employee" as const, employee })),
    ...(hideAddSeat ? [] : [ADD_EMPLOYEE_SEAT]),
  ], [employees, hideAddSeat]);
  const fallbackSeatKey = selectedEmployeeId ? employeeSeatKey(selectedEmployeeId) : seats[0]?.key ?? '';
  const [selectedSeatKey, setSelectedSeatKey] = useState(fallbackSeatKey);
  const selectedSeatKeyRef = useRef(fallbackSeatKey);
  const selectedIndex = Math.max(0, seats.findIndex((seat) => seat.key === (hideAddSeat && selectedEmployeeId ? employeeSeatKey(selectedEmployeeId) : selectedSeatKey)));
  const [frame, setFrame] = useState<ProjectionFrame>({
    projections: seats.map((_, index) => {
      const angle = index / Math.max(1, seats.length) * Math.PI * 2;
      return { x: 400 + Math.sin(angle) * 260, y: 360 - Math.cos(angle) * 260, size: 96, visible: true, depth: 10 };
    }),
    settled: true,
    eyeLevelProgress: mode === "eyeLevel" ? 1 : 0,
    azimuth: getCameraAzimuth(selectedIndex, seats.length),
    ready: false,
  });
  const onProjection = useCallback((next: ProjectionFrame) => setFrame(next), []);
  const supportsWebGL = typeof window !== "undefined"
    && typeof window.WebGLRenderingContext !== "undefined"
    && typeof window.ResizeObserver !== "undefined";

  useEffect(() => {
    const targetAngle = getCameraAzimuth(selectedIndex, seats.length);
    const angleDifference = Math.abs(Math.atan2(Math.sin(frame.azimuth - targetAngle), Math.cos(frame.azimuth - targetAngle)));
    if (mode === 'eyeLevel' && selectedEmployeeId && (frame.ready && frame.settled && frame.eyeLevelProgress > 0.99 && angleDifference < 0.01 || !supportsWebGL)) onFocusSettled?.(selectedEmployeeId);
  }, [mode, selectedEmployeeId, selectedIndex, seats.length, frame, supportsWebGL, onFocusSettled]);

  useEffect(() => {
    if (selectedEmployeeId) {
      const key = employeeSeatKey(selectedEmployeeId);
      selectedSeatKeyRef.current = key;
      setSelectedSeatKey(key);
    }
  }, [selectedEmployeeId]);

  useEffect(() => {
    if (mode === "topDown") {
      selectedSeatKeyRef.current = fallbackSeatKey;
      setSelectedSeatKey(fallbackSeatKey);
    }
  }, [fallbackSeatKey, mode]);

  const selectSeat = (seat: StageSeat) => {
    selectedSeatKeyRef.current = seat.key;
    setSelectedSeatKey(seat.key);
    if (seat.kind === "employee" && seat.employee.id !== selectedEmployeeId) onSelectEmployee(seat.employee.id);
  };

  const workbenchOpening = useRef(false);
  const openEmployeeWorkbench = (source: HTMLElement, color: string) => {
    if (onFocusSettled && selectedEmployeeId) { onFocusSettled(selectedEmployeeId); return; }
    if (workbenchOpening.current) return;
    const transitionDocument = document as Document & {
      startViewTransition?: (update: () => void | Promise<void>) => { finished: Promise<void> };
    };
    if (reducedMotion || !transitionDocument.startViewTransition) {
      onOpenEmployee();
      return;
    }
    workbenchOpening.current = true;
    const rect = source.getBoundingClientRect();
    const transitionShell = document.createElement("div");
    transitionShell.className = "employee-workbench-transition-shell";
    transitionShell.style.left = `${rect.left}px`;
    transitionShell.style.top = `${rect.top}px`;
    transitionShell.style.width = `${rect.width}px`;
    transitionShell.style.height = `${rect.height}px`;
    transitionShell.style.background = color;
    transitionShell.style.viewTransitionName = "employee-workbench";
    document.body.append(transitionShell);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      transitionDocument.startViewTransition(() => {
        transitionShell.remove();
        flushSync(() => onOpenEmployee());
      }).finished.catch(() => {}).finally(() => {
        workbenchOpening.current = false;
        transitionShell.remove();
      });
    }));
  };

  const activateSeat = (seat: StageSeat, selected: boolean, source: HTMLElement) => {
    if (!selected) {
      selectSeat(seat);
      return;
    }
    if (seat.kind === "add") {
      onAddEmployee();
    } else if (mode === "topDown") {
      onModeChange("eyeLevel");
    } else {
      openEmployeeWorkbench(source, seat.employee.color);
    }
  };

  const selectRelative = (delta: number) => {
    if (!employees.length) return;
    const current = employees.findIndex((employee) => employeeSeatKey(employee.id) === selectedSeatKeyRef.current);
    const next = cycleSeatIndex(current, employees.length, delta);
    selectSeat(seats[next]);
  };

  const positionWorkTooltip = (button: HTMLButtonElement) => {
    const stage = button.closest('.wework-stage')?.getBoundingClientRect();
    const rect = button.getBoundingClientRect();
    if (!stage) return;
    const center = rect.left + rect.width / 2;
    const target = Math.max(stage.left + 127, Math.min(stage.right - 127, center));
    button.style.setProperty('--work-tooltip-offset', `${target - center}px`);
    button.dataset.tooltipBelow = String(rect.top - stage.top < 150);
  };

  if (!employees.length) {
    return <div className="wework-stage wework-stage--empty flex-col gap-3 p-6 text-center"><strong>团队还没有助手</strong><p className="text-xs text-slate-400">添加第一位成员，开始分派任务与协作。</p><Button variant="primary" type="button" onClick={onAddEmployee} className="px-4 py-2 text-xs">添加助手</Button></div>;
  }

  return (
    <section
      aria-label="助手协作区"
      data-preserve-motion
      className="wework-stage"
      data-mode={mode}
      data-settled={frame.settled || undefined}
      tabIndex={0}
      onClick={(event) => {
        if (!(event.target as HTMLElement).closest("button")) event.currentTarget.focus({ preventScroll: true });
        if (mode === "topDown") return;
        const target = event.target as HTMLElement;
        if (target.closest(".wework-stage__employee-button, .wework-stage__control")) return;
        onModeChange("topDown");
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          selectRelative(event.key === "ArrowLeft" ? -1 : 1);
        }
      }}
    >
      {supportsWebGL ? (
        <Canvas camera={{ fov: CAMERA_FOV, near: 0.1, far: 50 }} dpr={[1, 1.5]} frameloop="demand">
          <TableScene />
          <StageCamera
            mode={mode}
            onProjection={onProjection}
            reducedMotion={reducedMotion}
            seatCount={seats.length}
            selectedIndex={selectedIndex}
          />
        </Canvas>
      ) : <canvas aria-hidden="true" />}

      <div className="wework-stage__overlay" data-ready={frame.ready || undefined}>
        {seats.map((seat, index) => {
          const projection = frame.projections[index];
          if (!projection) return null;
          const selected = index === selectedIndex;
          const workStatus=seat.kind==='employee'?employeeWorkStatus(seat.employee,deliveries):null;
          const presentation = getAnimatedSeatPresentation(index, seats.length, frame.azimuth, frame.eyeLevelProgress);
          const stageVisible = projection.visible && presentation.opacity > 0.01;
          return (
            <div
              aria-hidden={stageVisible ? undefined : true}
              className={`wework-stage__employee${seat.kind === "add" ? " wework-stage__employee--add" : ""}`}
              data-selected={selected || undefined}
              data-work-status={seat.kind === 'employee' ? employeeRingState(seat.employee, deliveries) : undefined}
              key={seat.key}
              style={{
                left: projection.x,
                top: projection.y,
                width: projection.size * presentation.scale,
                opacity: stageVisible ? presentation.opacity : 0,
                pointerEvents: stageVisible ? "auto" : "none",
                visibility: stageVisible ? "visible" : "hidden",
                zIndex: Math.round(1000 - projection.depth * 10),
              }}
            >
              <button
                aria-current={selected ? "true" : undefined}
                aria-label={seat.kind === "add" ? "助手入职" : `${seat.employee.displayName} · ${seat.employee.roleName}`}
                aria-describedby={seat.kind==='employee'?`work-${seat.employee.id}`:undefined}
                className="wework-stage__employee-button ww-employee-control"
                onMouseEnter={(event) => positionWorkTooltip(event.currentTarget)}
                onFocus={(event) => positionWorkTooltip(event.currentTarget)}
                tabIndex={stageVisible ? 0 : -1}
                onClick={(event) => activateSeat(seat, selected, event.currentTarget)}
                onDragOver={(event) => {
                  if (seat.kind === "employee" && draggedWork) {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                  }
                }}
                onDrop={(event) => {
                  if (seat.kind !== "employee") return;
                  event.preventDefault();
                  if (!draggedWork) return;
                  onAssignWork?.(draggedWork, seat.employee);
                }}
                type="button"
              >
                {seat.kind === "add" ? (
                  <span className="wework-stage__avatar wework-stage__add-avatar">
                    <span className="wework-stage__add-surface"><Plus aria-hidden="true" /></span>
                  </span>
                ) : (
                  <>
                    <span aria-hidden="true" className="wework-stage__status-ring"><span/></span>
                    <span className="wework-stage__avatar"><WeWorkEmployeeAvatar employee={seat.employee} overview={mode === "topDown"} paused={frame.settled} /></span>
                    <span id={`work-${seat.employee.id}`} role="tooltip" className="wework-stage__work-tooltip"><strong>{workStatus?.label}</strong><span>{seat.employee.currentWorkItem?.title || '当前工作'}</span><small>{workStatus?.detail}</small></span>
                    <span className="wework-stage__identity">
                      <strong>{seat.employee.displayName}</strong>
                      <small title={seat.employee.roleName}>{seat.employee.roleName}</small>
                    </span>
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
