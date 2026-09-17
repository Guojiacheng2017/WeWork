import type { WeWorkEmployee } from '../../domain/wework';

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

export function EmployeeBot({ size = 120, className = '', bodyColor = '#2563eb', frameColor = '#1e3a8a', eyeColor = '#fff', state = 'idle' }: EmployeeBotProps) {
  const resting = state === 'sleeping';
  return <svg viewBox="0 0 120 120" width={size} height={size} className={`employee-bot ${className}`} role="img" aria-label={`助手: ${state}`}>
    <path d="M60 18v12" stroke={frameColor} strokeWidth="5" strokeLinecap="round" />
    <circle cx="60" cy="15" r="6" fill={bodyColor} />
    <rect x="15" y="30" width="90" height="72" rx="24" fill={bodyColor} />
    <rect x="28" y="44" width="64" height="40" rx="14" fill={frameColor} />
    {resting ? <path d="M39 64h10m22 0h10" stroke={eyeColor} strokeWidth="4" strokeLinecap="round" /> : <><rect x="40" y="55" width="9" height="18" rx="4.5" fill={eyeColor} /><rect x="71" y="55" width="9" height="18" rx="4.5" fill={eyeColor} /></>}
    <path d={state === 'error' ? 'M49 94q11-7 22 0' : 'M49 91q11 7 22 0'} fill="none" stroke={eyeColor} strokeWidth="3" strokeLinecap="round" />
  </svg>;
}



export function employeeStateForStatus(status: EmployeeBotStatus): EmployeeBotState {
  return STATUS_STATE[status];
}
