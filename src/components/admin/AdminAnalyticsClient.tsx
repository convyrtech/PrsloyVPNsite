"use client";

import { useCallback, useEffect, useState } from "react";
import { Link } from "@/i18n/routing";
import {
  clearStoredAdminSecret,
  getStoredAdminSecret,
  storeAdminSecret,
} from "@/lib/admin-secret-storage";

type AggregateRow = { label: string; count: number };
type FunnelRow = { step: string; source: string; count: number };

type Aggregate = {
  env: string;
  date: string;
  totalPageviews: number;
  totalRevenueRub: number;
  pageviews: AggregateRow[];
  utmSources: AggregateRow[];
  funnel: FunnelRow[];
  methods: AggregateRow[];
  revenue: AggregateRow[];
};

type ApiResponse = {
  ok?: boolean;
  error?: string;
  aggregate?: Aggregate;
};

type Env = "prod" | "preview" | "dev";
type LoadState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "loaded"; aggregate: Aggregate }
  | { kind: "error"; message: string };

// Match the analytics module's Moscow-day bucket (todayKey in lib/analytics),
// not a UTC slice — otherwise the default view requests "yesterday" during
// the 00:00–03:00 MSK window and shows an empty day. Inlined (not imported
// from lib/analytics) to keep server-only KV code out of the client bundle.
const MSK_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Moscow",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function todayIso(): string {
  return MSK_DATE_FORMATTER.format(new Date());
}

export function AdminAnalyticsClient({ locale }: { locale: string }) {
  const [secret, setSecret] = useState("");
  const [date, setDate] = useState(todayIso());
  const [env, setEnv] = useState<Env>("prod");
  const [state, setState] = useState<LoadState>({ kind: "idle" });

  useEffect(() => {
    const stored = getStoredAdminSecret();
    if (stored) setSecret(stored);
  }, []);

  const load = useCallback(
    async (token: string, d: string, e: Env) => {
      if (!token) return;
      setState({ kind: "loading" });
      try {
        const res = await fetch(
          `/api/admin/analytics?date=${encodeURIComponent(d)}&env=${e}`,
          {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
          }
        );
        const data = (await res.json().catch(() => ({}))) as ApiResponse;
        if (res.status === 401) {
          clearStoredAdminSecret();
          setState({ kind: "error", message: "Неверный ADMIN_SECRET." });
          return;
        }
        if (!res.ok || !data.ok || !data.aggregate) {
          setState({
            kind: "error",
            message: data.error ?? "Не получилось загрузить.",
          });
          return;
        }
        setState({ kind: "loaded", aggregate: data.aggregate });
      } catch {
        setState({ kind: "error", message: "Сеть." });
      }
    },
    []
  );

  // Refresh on visibility return so the dashboard stays fresh without
  // a manual reload — matches the pattern used in AdminUsersClient.
  useEffect(() => {
    if (state.kind !== "loaded") return;
    function onVisible() {
      if (document.visibilityState === "visible") {
        void load(secret, date, env);
      }
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [state.kind, secret, date, env, load]);

  function onSubmitSecret(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const value = secret.trim();
    if (!value) return;
    storeAdminSecret(value);
    void load(value, date, env);
  }

  return (
    <main className="px-lg sm:px-xl py-xl sm:py-2xl max-w-5xl mx-auto flex flex-col gap-xl text-text-primary">
      <NavTabs locale={locale} />

      <header className="flex flex-col gap-sm">
        <SeparatorLabel label="ANALYTICS" />
        <h1 className="font-display text-display-md text-text-display">Аналитика.</h1>
        <p className="font-body text-body-sm text-text-secondary max-w-2xl">
          Счётчики по дням: трафик, источники, воронка, способ оплаты. Данные —
          live из KV. Дев/превью отделены префиксом окружения.
        </p>
      </header>

      <Controls
        secret={secret}
        setSecret={setSecret}
        date={date}
        setDate={(d) => {
          setDate(d);
          if (state.kind === "loaded") void load(secret, d, env);
        }}
        envValue={env}
        setEnv={(e) => {
          setEnv(e);
          if (state.kind === "loaded") void load(secret, date, e);
        }}
        onRefresh={() => void load(secret, date, env)}
        onSubmit={onSubmitSecret}
        loading={state.kind === "loading"}
      />

      {state.kind === "error" && (
        <p role="alert" className="font-body text-body-sm text-accent">
          {state.message}
        </p>
      )}

      {state.kind === "loaded" && <AggregateView aggregate={state.aggregate} />}
    </main>
  );
}

function NavTabs({ locale }: { locale: string }) {
  const en = locale === "en";
  return (
    <nav className="flex flex-wrap gap-sm font-mono text-label uppercase tracking-[0.08em]
                    [&_a]:inline-flex [&_a]:items-center [&_a]:min-h-[44px] [&_a]:border [&_a]:px-md
                    [&_a]:transition-colors">
      <Link
        href="/admin/users"
        className="border-border-visible text-text-secondary hover:border-text-display"
      >
        {en ? "Users" : "Пользователи"}
      </Link>
      <Link
        href="/admin/grant"
        className="border-border-visible text-text-secondary hover:border-text-display"
      >
        {en ? "Grant" : "Выдать"}
      </Link>
      <span
        className="inline-flex items-center min-h-[44px] border border-text-display px-md text-text-display"
        aria-current="page"
      >
        {en ? "Analytics" : "Аналитика"}
      </span>
    </nav>
  );
}

function Controls(props: {
  secret: string;
  setSecret: (s: string) => void;
  date: string;
  setDate: (d: string) => void;
  envValue: Env;
  setEnv: (e: Env) => void;
  onRefresh: () => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  loading: boolean;
}) {
  return (
    <form
      onSubmit={props.onSubmit}
      className="flex flex-col sm:flex-row gap-md flex-wrap items-stretch sm:items-end"
    >
      <Field label="ADMIN_SECRET" className="flex-1 min-w-[240px]">
        <input
          type="password"
          value={props.secret}
          onChange={(e) => props.setSecret(e.target.value)}
          autoComplete="current-password"
          required
          className="bg-surface border border-border-visible rounded-full px-lg min-h-[44px]
                     font-mono text-body-sm text-text-display
                     focus:outline-none focus:border-text-display transition-colors"
        />
      </Field>
      <Field label="DATE">
        <input
          type="date"
          value={props.date}
          onChange={(e) => props.setDate(e.target.value)}
          className="bg-surface border border-border-visible rounded-full px-lg min-h-[44px]
                     font-mono text-body-sm text-text-display
                     focus:outline-none focus:border-text-display transition-colors"
        />
      </Field>
      <Field label="ENV">
        <select
          value={props.envValue}
          onChange={(e) => props.setEnv(e.target.value as Env)}
          className="bg-surface border border-border-visible rounded-full px-lg min-h-[44px]
                     font-mono text-body-sm text-text-display
                     focus:outline-none focus:border-text-display transition-colors"
        >
          <option value="prod">prod</option>
          <option value="preview">preview</option>
          <option value="dev">dev</option>
        </select>
      </Field>
      <div className="flex gap-sm">
        <button
          type="submit"
          disabled={props.loading}
          className="inline-flex items-center min-h-[44px] px-lg
                     bg-text-display text-black font-mono text-label uppercase tracking-[0.08em]
                     rounded-full hover:opacity-90 active:scale-[0.98]
                     transition disabled:opacity-60 disabled:cursor-wait"
        >
          [ {props.loading ? "ЗАГРУЗКА..." : "ЗАГРУЗИТЬ"} ]
        </button>
        <button
          type="button"
          onClick={props.onRefresh}
          disabled={props.loading}
          className="inline-flex items-center min-h-[44px] px-lg
                     border border-border-visible font-mono text-label uppercase tracking-[0.08em]
                     text-text-display rounded-full hover:border-text-display
                     transition disabled:opacity-60"
        >
          [ ОБНОВИТЬ ]
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`flex flex-col gap-xs ${className ?? ""}`}>
      <span className="font-mono text-label uppercase tracking-[0.12em] text-text-disabled">
        {label}
      </span>
      {children}
    </label>
  );
}

function AggregateView({ aggregate }: { aggregate: Aggregate }) {
  return (
    <section className="flex flex-col gap-2xl">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-xl">
        <HeroNumber
          label={`Всего pageview за ${aggregate.date} · env ${aggregate.env}`}
          value={aggregate.totalPageviews}
        />
        <HeroNumber
          label={`Выручка за ${aggregate.date}, ₽`}
          value={aggregate.totalRevenueRub}
        />
      </div>

      <CountTable
        title="REVENUE BY SOURCE, ₽"
        columnLabel="Источник"
        rows={aggregate.revenue}
        empty="Платежей пока нет."
      />

      <CountTable
        title="PAGEVIEWS"
        columnLabel="Путь"
        rows={aggregate.pageviews}
        empty="Нет визитов за дату."
      />

      <CountTable
        title="UTM SOURCES"
        columnLabel="Источник"
        rows={aggregate.utmSources}
        empty="Нет атрибутированных источников."
      />

      <FunnelTable rows={aggregate.funnel} />

      <CountTable
        title="PAYMENT METHODS"
        columnLabel="Метод"
        rows={aggregate.methods}
        empty="Нет инициированных платежей."
      />
    </section>
  );
}

function HeroNumber({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-xs">
      <span className="font-mono text-label uppercase tracking-[0.16em] text-text-secondary">
        {label}
      </span>
      <span className="font-mono text-display-md text-text-display">
        {value.toLocaleString("ru-RU")}
      </span>
    </div>
  );
}

function SeparatorLabel({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-md font-mono text-label uppercase tracking-[0.16em]">
      <span className="text-text-display">{label}</span>
      <span className="flex-1 h-px bg-border-visible/40" />
    </div>
  );
}

function CountTable({
  title,
  columnLabel,
  rows,
  empty,
}: {
  title: string;
  columnLabel: string;
  rows: AggregateRow[];
  empty: string;
}) {
  return (
    <div className="flex flex-col gap-md">
      <SeparatorLabel label={title} />
      {rows.length === 0 ? (
        <p className="font-body text-body-sm text-text-disabled">{empty}</p>
      ) : (
        <ul className="flex flex-col">
          <li className="flex justify-between font-mono text-label uppercase tracking-[0.1em] text-text-disabled py-sm border-b border-border-visible/40">
            <span>{columnLabel}</span>
            <span>Кол-во</span>
          </li>
          {rows.map((row) => (
            <li
              key={row.label}
              className="flex justify-between font-mono text-body-sm text-text-display py-sm border-b border-border-visible/20"
            >
              <span className="truncate pr-md">{row.label}</span>
              <span>{row.count.toLocaleString("ru-RU")}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FunnelTable({ rows }: { rows: FunnelRow[] }) {
  return (
    <div className="flex flex-col gap-md">
      <SeparatorLabel label="FUNNEL" />
      {rows.length === 0 ? (
        <p className="font-body text-body-sm text-text-disabled">
          Воронка пока пуста.
        </p>
      ) : (
        <ul className="flex flex-col">
          <li className="grid grid-cols-[1fr_1fr_auto] gap-md font-mono text-label uppercase tracking-[0.1em] text-text-disabled py-sm border-b border-border-visible/40">
            <span>Шаг</span>
            <span>Источник</span>
            <span>Кол-во</span>
          </li>
          {rows.map((row) => (
            <li
              key={`${row.step}:${row.source}`}
              className="grid grid-cols-[1fr_1fr_auto] gap-md font-mono text-body-sm text-text-display py-sm border-b border-border-visible/20"
            >
              <span>{row.step}</span>
              <span>{row.source}</span>
              <span>{row.count.toLocaleString("ru-RU")}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
