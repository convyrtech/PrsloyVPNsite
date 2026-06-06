"use client";

import { Link } from "@/i18n/routing";

// Branded error boundary for the locale segment (default Next error page is
// unstyled — bad trust signal for ad-landed users). RU body for the primary
// audience; Latin mono labels stay brand-neutral.
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-black gap-lg px-lg text-center">
      <p className="font-mono text-label uppercase text-text-disabled">[ ERROR ]</p>
      <h1 className="font-display text-display-md text-text-display">ЧТО-ТО СЛОМАЛОСЬ.</h1>
      <p className="font-body text-body-sm text-text-secondary max-w-md leading-[1.6]">
        Что-то пошло не так на нашей стороне. Обнови страницу — если повторится, напиши в поддержку.
      </p>
      <div className="mt-sm flex flex-col sm:flex-row items-center gap-sm">
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center justify-center
                     bg-text-display text-black rounded-full px-xl min-h-[48px]
                     font-mono text-label uppercase tracking-[0.08em]
                     hover:opacity-90 active:scale-[0.98] transition duration-150 ease-out-nothing"
        >
          [ ОБНОВИТЬ ]
        </button>
        <Link
          href="/"
          className="inline-flex items-center justify-center
                     border border-border-visible text-text-display rounded-full px-xl min-h-[48px]
                     font-mono text-label uppercase tracking-[0.08em]
                     hover:border-text-display transition-colors"
        >
          [ PRSLOY ]
        </Link>
      </div>
    </main>
  );
}
