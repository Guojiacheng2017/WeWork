import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import * as THREE from "three";
import type { WeWorkEmployee, WorkItem } from "../domain/wework";
import {
  CAMERA_FOV,
  TABLE_RADIUS,
  TABLE_THICKNESS,
  cycleSeatIndex,
  cyclicEmployeeOffset,
  getEmployeeWorldPosition,
  getCameraAzimuth,
  getCameraPolar,
  getCameraRadius,
  getEyeLevelSeatVisibility,
  projectEmployeeAnchor,
  type EmployeeProjection,
  type StageMode,
} from "../domain/weworkStage";
import { WeWorkEmployeeAvatar } from "./WeWorkEmployeeAvatar";

type StageSeat =
  | { key: string; kind: "employee"; employee: WeWorkEmployee }
  | { key: "add-employee"; kind: "add" };

type ProjectionFrame = { projections: EmployeeProjection[]; settled: boolean; eyeLevelProgress: number; ready: boolean };

const ADD_EMPLOYEE_SEAT: StageSeat = { key: "add-employee", kind: "add" };

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
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
  const { camera, size } = useThree();
  const polar = useRef(getCameraPolar(mode));
  const radius = useRef(getCameraRadius(mode));
  const azimuth = useRef(Math.PI);
  const lastFrame = useRef<ProjectionFrame | null>(null);
  const perspectiveCamera = camera as THREE.PerspectiveCamera;

  useFrame((_, delta) => {
    const targetPolar = getCameraPolar(mode);
    const targetRadius = getCameraRadius(mode);
    const rawTargetAzimuth = getCameraAzimuth(selectedIndex, seatCount);
    const targetAzimuth = shortestAngleTarget(azimuth.current, rawTargetAzimuth);
    if (reducedMotion) {
      polar.current = targetPolar;
      radius.current = targetRadius;
      azimuth.current = targetAzimuth;
    } else {
      polar.current = THREE.MathUtils.damp(polar.current, targetPolar, 4.8, delta);
      radius.current = THREE.MathUtils.damp(radius.current, targetRadius, 4.8, delta);
      azimuth.current = THREE.MathUtils.damp(azimuth.current, targetAzimuth, 6.5, delta);
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
    const settled = Math.abs(polar.current - targetPolar) < 0.002
      && Math.abs(radius.current - targetRadius) < 0.002
      && Math.abs(targetAzimuth - azimuth.current) < 0.002;
    const previous = lastFrame.current;
    const changed = !previous || previous.settled !== settled
      || Math.abs(previous.eyeLevelProgress - eyeLevelProgress) > 0.002
      || previous.projections.length !== projections.length
      || projections.some((point, index) => {
      const prior = previous.projections[index];
      return !prior || Math.abs(point.x - prior.x) > 0.35 || Math.abs(point.y - prior.y) > 0.35 || Math.abs(point.size - prior.size) > 0.25;
    });
    if (changed) {
      const next = { projections, settled, eyeLevelProgress, ready: true };
      lastFrame.current = next;
      onProjection(next);
    }
  });

  return null;
}

function TableScene() {
  return (
    <>
      <color attach="background" args={["#f4f7fb"]} />
      <mesh position={[0, -TABLE_THICKNESS / 2, 0]}>
        <cylinderGeometry args={[TABLE_RADIUS, TABLE_RADIUS, TABLE_THICKNESS, 96]} />
        <meshBasicMaterial color="#ffffff" toneMapped={false} />
      </mesh>
    </>
  );
}

const STATUS_LABEL: Record<WeWorkEmployee["status"], string> = {
  idle: "空闲",
  working: "工作中",
  blocked: "阻塞",
  success: "已完成",
  error: "异常",
};

export function WeWorkStage3D({
  employees,
  mode,
  selectedEmployeeId,
  onModeChange,
  onSelectEmployee,
  onOpenEmployee,
  onAddEmployee,
  draggedWork,
  onAssignWork,
}: {
  employees: WeWorkEmployee[];
  mode: StageMode;
  selectedEmployeeId: string | null;
  onModeChange: (mode: StageMode) => void;
  onSelectEmployee: (employeeId: string) => void;
  onOpenEmployee: () => void;
  onAddEmployee: () => void;
  draggedWork?: WorkItem | null;
  onAssignWork?: (work: WorkItem, employee: WeWorkEmployee) => void;
}) {
  const reducedMotion = useReducedMotion();
  const seats = useMemo<StageSeat[]>(() => [
    ...employees.map((employee) => ({ key: employeeSeatKey(employee.id), kind: "employee" as const, employee })),
    ADD_EMPLOYEE_SEAT,
  ], [employees]);
  const fallbackSeatKey = selectedEmployeeId ? employeeSeatKey(selectedEmployeeId) : seats[0].key;
  const [selectedSeatKey, setSelectedSeatKey] = useState(fallbackSeatKey);
  const selectedSeatKeyRef = useRef(fallbackSeatKey);
  const selectedIndex = Math.max(0, seats.findIndex((seat) => seat.key === selectedSeatKey));
  const [frame, setFrame] = useState<ProjectionFrame>({
    projections: seats.map((_, index) => {
      const angle = index / Math.max(1, seats.length) * Math.PI * 2;
      return { x: 400 + Math.sin(angle) * 260, y: 360 - Math.cos(angle) * 260, size: 96, visible: true, depth: 10 };
    }),
    settled: true,
    eyeLevelProgress: mode === "eyeLevel" ? 1 : 0,
    ready: false,
  });
  const onProjection = useCallback((next: ProjectionFrame) => setFrame(next), []);
  const supportsWebGL = typeof window !== "undefined"
    && typeof window.WebGLRenderingContext !== "undefined"
    && typeof window.ResizeObserver !== "undefined";

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

  const openEmployeeWorkbench = (source: HTMLElement, color: string) => {
    const transitionDocument = document as Document & {
      startViewTransition?: (update: () => void | Promise<void>) => { finished: Promise<void> };
    };
    if (!transitionDocument.startViewTransition) {
      onOpenEmployee();
      return;
    }
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
      }).finished.finally(() => {
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

  if (!employees.length) {
    return <div className="wework-stage wework-stage--empty">当前团队暂无 Employee</div>;
  }

  return (
    <section
      aria-label="Employee 办公室舞台"
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
        <Canvas camera={{ fov: CAMERA_FOV, near: 0.1, far: 50 }} dpr={[1, 1.5]}>
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
          const offset = cyclicEmployeeOffset(index, selectedIndex, seats.length);
          const selected = index === selectedIndex;
          const seatVisibility = getEyeLevelSeatVisibility(index, selectedIndex, seats.length);
          const targetEyeScale = selected ? 1.34 : Math.abs(offset) === 1 ? 0.9 : 0.7;
          const eyeScale = THREE.MathUtils.lerp(1, targetEyeScale, frame.eyeLevelProgress);
          const opacity = THREE.MathUtils.lerp(1, seatVisibility.opacity, frame.eyeLevelProgress);
          const stageVisible = projection.visible && (frame.eyeLevelProgress < 0.98 || seatVisibility.visible);
          return (
            <div
              aria-hidden={stageVisible ? undefined : true}
              className={`wework-stage__employee${seat.kind === "add" ? " wework-stage__employee--add" : ""}`}
              data-selected={selected || undefined}
              key={seat.key}
              style={{
                left: projection.x,
                top: projection.y,
                width: projection.size * eyeScale,
                opacity: stageVisible ? opacity : 0,
                pointerEvents: stageVisible ? "auto" : "none",
                visibility: stageVisible ? "visible" : "hidden",
                zIndex: Math.round(1000 - projection.depth * 10),
              }}
            >
              <button
                aria-current={selected ? "true" : undefined}
                aria-label={seat.kind === "add" ? "助手入职" : `${seat.employee.displayName} · ${seat.employee.roleName}`}
                className="wework-stage__employee-button"
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
                    <span className="wework-stage__avatar"><WeWorkEmployeeAvatar employee={seat.employee} overview={mode === "topDown"} /></span>
                    <span className="wework-stage__identity">
                      <strong>{seat.employee.displayName}</strong>
                      {mode === "eyeLevel" ? <small>{seat.employee.roleName} · {STATUS_LABEL[seat.employee.status]}</small> : null}
                    </span>
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>
      <button aria-label="上一个 employee" className="wework-stage__control wework-stage__control--left" onClick={() => selectRelative(-1)} type="button"><ChevronLeft /></button>
      <button aria-label="下一个 employee" className="wework-stage__control wework-stage__control--right" onClick={() => selectRelative(1)} type="button"><ChevronRight /></button>
    </section>
  );
}
