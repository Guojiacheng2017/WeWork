export const EMPLOYEE_COLORS = ['#0BA5EC', '#8B5CF6', '#10B981', '#F59E0B', '#EC4899', '#6366F1', '#14B8A6', '#F97316'];
export function randomEmployeeColor(existing: string[] = []) {
 const unused = EMPLOYEE_COLORS.filter(color => !existing.some(value => value.toLowerCase() === color.toLowerCase()));
 const colors = unused.length ? unused : EMPLOYEE_COLORS;
 return colors[Math.floor(Math.random() * colors.length)];
}
export function validateEmployeeColor(color: string) {
 if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error('助手颜色必须为六位十六进制色值');
 return color.toUpperCase();
}

export function employeeFrameColor(color: string) {
 const match = /^#([0-9a-f]{6})$/i.exec(color);
 if (!match) return color;
 const value = Number.parseInt(match[1], 16);
 const channel = (shift: number) => Math.round(((value >> shift) & 255) * 0.7).toString(16).padStart(2, '0');
 return `#${channel(16)}${channel(8)}${channel(0)}`;
}
