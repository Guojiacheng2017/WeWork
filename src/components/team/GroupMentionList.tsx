import { UserRound } from 'lucide-react';
import type { WeWorkEmployee } from '../../domain/wework';
import { WeWorkEmployeeAvatar } from '../WeWorkEmployeeAvatar';

export function GroupMentionList({ employees, suggestions, selectedIndex, onSelect, className = '' }: {
  employees: WeWorkEmployee[];
  suggestions: { id: string; displayName: string }[];
  selectedIndex: number;
  onSelect: (suggestion: { id: string; displayName: string }) => void;
  className?: string;
}) {
  if (!suggestions.length) return null;
  return <div role="listbox" aria-label="提及助手" className={`max-h-48 shrink-0 overflow-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg ${className}`}>
    {suggestions.map((suggestion, index) => {
      const employee = employees.find((item) => item.id === suggestion.id);
      return <button key={suggestion.id} type="button" role="option" aria-selected={index === selectedIndex} onMouseDown={(event) => event.preventDefault()} onClick={() => onSelect(suggestion)} className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-sky-700 ${index === selectedIndex ? 'bg-sky-50' : ''}`}>
        <span className="grid h-7 w-7 shrink-0 place-items-center">{suggestion.id === 'all' ? <UserRound className="h-5 w-5" /> : employee ? <WeWorkEmployeeAvatar employee={employee} overview /> : null}</span>
        <span>@{suggestion.displayName}</span>{suggestion.id === 'all' && <span className="text-slate-400">全体助手</span>}
      </button>;
    })}
  </div>;
}
