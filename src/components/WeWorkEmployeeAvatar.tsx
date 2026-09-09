import { employeeFrameColor } from '../domain/employeeColor';
import type { WeWorkEmployee } from "../domain/wework";
import { EmployeeBot, employeeStateForStatus } from "./employee/EmployeeBot";

export function WeWorkEmployeeAvatar({ employee, className = "", overview = false, paused = false }: { employee: WeWorkEmployee; className?: string; overview?: boolean; paused?: boolean }) {
  const state = employeeStateForStatus(overview ? "idle" : employee.status);
  const frameColor = employeeFrameColor(employee.color);

  return (
    <span
      aria-hidden="true"
      className={["wework-employee-avatar", className].filter(Boolean).join(" ")}
      data-status={employee.status}
    >
      <EmployeeBot
        bodyColor={employee.color}
        className="wework-employee-avatar__bot"
        effectColor={frameColor}
        eyeColor="#ffffff"
        frameColor={frameColor}
        size={360}
        state={state}
        paused={overview || paused}
      />
    </span>
  );
}
