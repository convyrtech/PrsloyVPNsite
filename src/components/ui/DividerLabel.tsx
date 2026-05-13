export function DividerLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-md">
      <div className="h-px flex-1 bg-border-visible/40" />
      <span className="font-mono text-label uppercase tracking-[0.16em] text-text-disabled">
        {children}
      </span>
      <div className="h-px flex-1 bg-border-visible/40" />
    </div>
  );
}
