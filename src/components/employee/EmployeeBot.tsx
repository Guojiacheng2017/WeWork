import type { ComponentType } from 'react';
import type { WeWorkEmployee } from '../../domain/wework';
// @ts-expect-error EmployeeBot is a frozen JavaScript source module.
import { EmployeeBot as FrozenEmployeeBot } from '../../2d/EmployeeBot.mjs';

export type EmployeeBotState = 'idle' | 'listening' | 'thinking' | 'searching' | 'working' | 'success' | 'error' | 'sleeping';
export type EmployeeBotStatus = WeWorkEmployee['status'] | 'thinking' | 'searching' | 'can-accept';

export type EmployeeBotProps = {
  state?: EmployeeBotState;
  stateSignal?: number;
  size?: number;
  className?: string;
  bodyColor?: string;
  frameColor?: string;
  eyeColor?: string;
  effectColor?: string;
  paused?: boolean;
};

const STATUS_STATE: Record<EmployeeBotStatus, EmployeeBotState> = {
  idle: 'idle',
  working: 'working',
  blocked: 'thinking',
  success: 'success',
  error: 'error',
  thinking: 'thinking',
  searching: 'searching',
  'can-accept': 'listening',
};

export const EmployeeBot = FrozenEmployeeBot as ComponentType<EmployeeBotProps>;

export function employeeStateForStatus(status: EmployeeBotStatus): EmployeeBotState {
  return STATUS_STATE[status];
}
