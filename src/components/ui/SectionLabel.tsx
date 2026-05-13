export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-md">
      <span className="inline-block w-[28px] h-px bg-border-visible" />
      <span className="font-mono text-label uppercase tracking-[0.16em] text-text-disabled">
        {children}
      </span>
    </div>
  );
}
