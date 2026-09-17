export function WeWorkLogoMark({ size = 32, className = '' }: { size?: number; className?: string }) {
  return <svg viewBox="0 0 64 64" width={size} height={size} role="img" aria-label="WeWork" className={className}>
    <rect x="4" y="4" width="56" height="56" rx="16" fill="#2563eb" />
    <path d="m16 23 7 20 9-14 9 14 7-20" fill="none" stroke="white" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}

