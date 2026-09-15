import { employeeFrameColor } from '../../domain/employeeColor';
import React from 'react';
import { EmployeeBot, employeeStateForStatus, type EmployeeBotStatus } from './EmployeeBot';
import { useReducedEffects } from '../../hooks/useReducedEffects';

export interface EmployeeBotAvatarProps {
  size?: number;
  bodyColor?: string;
  frameColor?: string;
  status?: EmployeeBotStatus;
  isHovered?: boolean;
  isSelected?: boolean;
  showBadge?: boolean;
  className?: string;
  paused?: boolean;
}

export const EmployeeBotAvatar: React.FC<EmployeeBotAvatarProps> = ({
  size = 120,
  bodyColor = '#2563eb',
  frameColor,
  status = 'idle',
  isHovered = false,
  isSelected = false,
  className = '',
  paused = false,
}) => {
  const reducedEffects = useReducedEffects();
  return (
    <div
      className={`relative inline-flex items-center justify-center select-none transition-all duration-300 ${className} ${
        isHovered ? 'scale-110 -translate-y-1' : ''
      } ${isSelected ? 'scale-105' : ''}`}
      style={{ width: size, height: size }}
    >
      {/* Visual Selection Ring */}
      {isSelected && (
        <div
          className="absolute -inset-1 rounded-full border-2 border-rose-500/80 shadow-md shadow-rose-500/20 pointer-events-none z-10"
        />
      )}

      {/* Official Frozen 2D EmployeeBot Component */}
      <EmployeeBot
        state={employeeStateForStatus(status)}
        size={size}
        bodyColor={bodyColor}
        frameColor={frameColor ?? employeeFrameColor(bodyColor)}
        effectColor={frameColor ?? employeeFrameColor(bodyColor)}
        eyeColor="#ffffff"
        paused={paused || reducedEffects}
      />
    </div>
  );
};
