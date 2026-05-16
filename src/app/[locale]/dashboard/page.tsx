import { getTranslations, setRequestLocale } from "next-intl/server";
import { DashboardClient, type DashboardCopy } from "@/components/auth/DashboardClient";

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "dashboard_page" });

  const keys = [
    "label",
    "title",
    "setup_title",
    "setup_body",
    "auth_required_label",
    "auth_required_body",
    "login_link",
    "register_link",
    "verify_title",
    "verify_body",
    "verify_resend",
    "verify_sent",
    "verify_error",
    "email_label",
    "email_status_label",
    "email_verified",
    "email_pending",
    "access_label",
    "access_active",
    "access_pending",
    "key_label",
    "key_ready",
    "key_not_issued",
    "vpn_section_label",
    "key_ready_body",
    "key_pending_body",
    "pipeline_label",
    "progress_email",
    "progress_invite",
    "progress_access",
    "state_done",
    "state_current",
    "state_waiting",
    "updated_label",
    "copy_key",
    "copy_done",
    "copy_error",
    "setup_link",
    "ready_hint_label",
    "pending_hint_label",
    "account_label",
    "logout",
  ] as const;

  const copy = Object.fromEntries(keys.map((key) => [key, t(key)])) as DashboardCopy;

  return <DashboardClient locale={locale} copy={copy} />;
}
