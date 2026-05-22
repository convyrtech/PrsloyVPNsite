"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/routing";

type PaymentResult = "success" | "failed";

export function PaymentResultBanner() {
  const t = useTranslations("payment_result");
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [result, setResult] = useState<PaymentResult | null>(null);

  useEffect(() => {
    const raw = searchParams.get("payment");
    if (raw !== "success" && raw !== "failed") return;
    setResult(raw);
    // Strip the query so a hard refresh does not re-trigger the banner.
    router.replace(pathname);
  }, [searchParams, router, pathname]);

  if (!result) return null;

  const isSuccess = result === "success";
  const tone = isSuccess
    ? "border-success/60 bg-success/[0.06]"
    : "border-accent/60 bg-accent/[0.06]";
  const dotTone = isSuccess
    ? "bg-success shadow-[0_0_12px_rgba(74,158,92,0.7)]"
    : "bg-accent";

  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-start gap-md rounded-[8px] border p-lg ${tone}`}
    >
      <span
        aria-hidden="true"
        className={`mt-[6px] inline-block h-[8px] w-[8px] rounded-full ${dotTone}`}
      />
      <div className="flex flex-1 flex-col gap-xs">
        <span className="font-mono text-label uppercase tracking-[0.16em] text-text-display">
          {isSuccess ? t("success_title") : t("failed_title")}
        </span>
        <p className="font-body text-body-sm text-text-secondary leading-[1.55]">
          {isSuccess ? t("success_body") : t("failed_body")}
        </p>
      </div>
      <button
        type="button"
        onClick={() => setResult(null)}
        aria-label={t("dismiss")}
        className="font-mono text-label uppercase tracking-[0.12em] text-text-display hover:opacity-80
                   px-sm py-xs"
      >
        ✕
      </button>
    </div>
  );
}
