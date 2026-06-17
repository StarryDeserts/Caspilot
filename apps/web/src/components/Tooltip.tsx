import type { ReactNode } from 'react';

export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="tooltip-wrap">
      {children}
      <span className="tip" role="tooltip">
        {label}
      </span>
    </div>
  );
}
