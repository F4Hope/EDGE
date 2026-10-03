export function EdgeMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand-lockup" aria-label="EDGE Sports Intelligence">
      <div className={compact ? "edge-wordmark compact" : "edge-wordmark"}>EDGE</div>
      {!compact && <div className="edge-subtitle">SPORTS INTELLIGENCE</div>}
    </div>
  );
}
