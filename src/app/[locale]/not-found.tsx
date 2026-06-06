import { Link } from "@/i18n/routing";

export default function NotFound() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-black gap-lg px-lg text-center">
      <p className="font-mono text-label uppercase text-text-disabled">
        [ 404 · NOT FOUND ]
      </p>
      <h1 className="font-display text-display-md text-text-display">
        NOTHING HERE.
      </h1>
      {/* The only tier-1 on this screen — a path back into the funnel. */}
      <Link
        href="/"
        className="mt-sm inline-flex items-center justify-center
                   bg-text-display text-black rounded-full px-xl min-h-[48px]
                   font-mono text-label uppercase tracking-[0.08em]
                   hover:opacity-90 active:scale-[0.98] transition duration-150 ease-out-nothing"
      >
        [ PRSLOY ]
      </Link>
    </main>
  );
}
