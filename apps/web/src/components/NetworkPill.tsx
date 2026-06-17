export function NetworkPill({ network }: { network: string }) {
  return (
    <div className="network-pill">
      <span className="pill-dot" />
      {network}
    </div>
  );
}
