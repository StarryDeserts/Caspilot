import type { CSSProperties } from 'react';

export interface CaspilotMarkProps {
  size?: number;
  mono?: boolean;
  title?: string;
  className?: string;
  style?: CSSProperties;
}

export function CaspilotMark({
  size = 24,
  mono = false,
  title = 'Caspilot',
  className,
  style,
}: CaspilotMarkProps) {
  const accent = mono ? 'currentColor' : 'var(--accent)';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      role="img"
      aria-label={title}
      className={className}
      style={style}
    >
      <path
        d="M34.4 13.2 A16 16 0 1 0 34.4 34.8"
        fill="none"
        stroke="currentColor"
        strokeWidth={3}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      <polygon points="24,24 40.5,21.7 44,24 40.5,26.3" fill={accent} />
      <circle cx="24" cy="24" r="2.1" fill="currentColor" />
      <rect x="43.2" y="22.4" width="2" height="3.2" rx="1" fill={accent} />
    </svg>
  );
}
