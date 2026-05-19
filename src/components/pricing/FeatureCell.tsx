export function FeatureCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-text-secondary mb-1">
        {label}
      </div>
      <div className="font-mono text-body-sm text-text-display tracking-[0.02em]">
        {value}
      </div>
    </div>
  );
}
