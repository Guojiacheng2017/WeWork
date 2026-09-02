import type { WeWorkEmployee } from "../domain/wework";
import { EmployeeBot, employeeStateForStatus } from "./employee/EmployeeBot";

function darkenHex(color: string, factor = 0.7) {
  const match = /^#([0-9a-f]{6})$/i.exec(color);
  if (!match) return color;
  const value = Number.parseInt(match[1], 16);
  const channel = (shift: number) => Math.round(((value >> shift) & 0xff) * factor).toString(16).padStart(2, "0");
  return `#${channel(16)}${channel(8)}${channel(0)}`;
}

export function WeWorkEmployeeAvatar({ employee, className = "", overview = false }: { employee: WeWorkEmployee; className?: string; overview?: boolean }) {
  const state = employeeStateForStatus(overview ? "idle" : employee.status);
  const frameColor = darkenHex(employee.color);

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
        paused={overview}
      />
    </span>
  );
}
