import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { gradientFrameClass } from "@/lib/landing/form-styles";
import { orpc } from "@/utils/orpc";

const AI_PROVIDER_ORDER = ["mimo", "perplexity", "icreat"] as const;
const AI_PROVIDER_META: Record<string, { label: string; bg: string; text: string; iconBg: string; iconText: string }> = {
  mimo: { label: "MiMo", bg: "bg-[#F1ECFB]", text: "text-[#7C5CD1]", iconBg: "bg-[#7C5CD1]", iconText: "text-white" },
  perplexity: { label: "Perplexity", bg: "bg-brand-gold-soft", text: "text-brand-gold-dark", iconBg: "bg-brand-gold-dark", iconText: "text-white" },
  // icreat.ai hosts the image model the Poster Generator uses.
  icreat: { label: "icreat (Seedream)", bg: "bg-[#FDECEC]", text: "text-[#C2452F]", iconBg: "bg-[#C2452F]", iconText: "text-white" },
};

// Official brand marks (via Simple Icons, CC0-licensed monochrome vendor
// logos) for the providers that have one — nominative use to identify which
// service was actually called, not an endorsement claim. MiMo has no
// published logo mark of its own (it's a research model, not a branded
// consumer product), so it keeps the monogram fallback below.
function PerplexityLogo({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M22.3977 7.0896h-2.3106V.0676l-7.5094 6.3542V.1577h-1.1554v6.1966L4.4904 0v7.0896H1.6023v10.3976h2.8882V24l6.932-6.3591v6.2005h1.1554v-6.0469l6.9318 6.1807v-6.4879h2.8882V7.0896zm-3.4657-4.531v4.531h-5.355l5.355-4.531zm-13.2862.0676 4.8691 4.4634H5.6458V2.6262zM2.7576 16.332V8.245h7.8476l-6.1149 6.1147v1.9723H2.7576zm2.8882 5.0404v-3.8852h.0001v-2.6488l5.7763-5.7764v7.0111l-5.7764 5.2993zm12.7086.0248-5.7766-5.1509V9.0618l5.7766 5.7766v6.5588zm2.8882-5.0652h-1.733v-1.9723L13.3948 8.245h7.8478v8.087z" />
    </svg>
  );
}

const PROVIDER_LOGOS: Record<string, (props: { className?: string }) => React.ReactElement> = {
  perplexity: PerplexityLogo,
};

// Real vendor mark when one's available (Perplexity above);
// otherwise falls back to a plain monogram — e.g. MiMo, which has no
// published logo of its own.
function ProviderIcon({ provider, className = "" }: { provider: string; className?: string }) {
  const meta = AI_PROVIDER_META[provider];
  const Logo = PROVIDER_LOGOS[provider];
  if (Logo) {
    return (
      <span
        className={`flex shrink-0 items-center justify-center rounded-full bg-white ring-1 ring-inset ring-black/[0.06] ${meta?.text ?? "text-[#4B5468]"} ${className}`}
      >
        <Logo className="h-[65%] w-[65%]" />
      </span>
    );
  }
  const letter = (meta?.label?.[0] ?? provider[0] ?? "?").toUpperCase();
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full text-[10px] ${meta?.iconBg ?? "bg-[#9AA3B2]"} ${meta?.iconText ?? "text-white"} ${className}`}
    >
      {letter}
    </span>
  );
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return <p className="rounded-[12px] bg-[#F8FAFB] p-[14px] text-xs text-[#9AA3B2]">{children}</p>;
}

/**
 * The redesign's AiUsageCard (My Profile): this account's AI calls by
 * provider and model, with an estimated cost (ai.usageByProvider).
 */
export function AiUsageCard() {
  const { t } = useTranslation("common");
  const { data: aiUsage = [] } = useQuery({ ...orpc.ai.usageByProvider.queryOptions(), meta: { suppressErrorToast: true } });
  const totalCostUsd = aiUsage.reduce((sum, u) => sum + (u.costUsd ?? 0), 0);
  const hasUnknownCost = aiUsage.some((u) => u.costUsd === null && u.calls > 0);

  return (
    <div className={`animate-fade-in-up ${gradientFrameClass("teal")}`} style={{ animationDelay: "60ms" }}>
      <div className="flex h-full flex-col gap-[14px] rounded-[19px] bg-white p-[16px] sm:p-[22px]">
        <div className="flex items-center justify-between gap-[8px]">
          <p className="text-sm text-[#141B2E]">{t("dashboard.aiUsage.title")}</p>
          {aiUsage.length > 0 && (
            <span className="text-xs text-[#4B5468]">
              ~${totalCostUsd.toFixed(2)}
              {hasUnknownCost ? "+" : ""}
            </span>
          )}
        </div>

        {aiUsage.length === 0 ? (
          <EmptyRow>{t("dashboard.aiUsage.empty")}</EmptyRow>
        ) : (
          <div className="flex flex-col gap-[8px]">
            {AI_PROVIDER_ORDER.filter((provider) => aiUsage.some((u) => u.provider === provider)).map((provider) => {
              const rows = aiUsage.filter((u) => u.provider === provider);
              const meta = AI_PROVIDER_META[provider]!;
              return (
                <div key={provider} className="flex flex-col gap-[6px] rounded-[12px] border border-[#EAEDF2] bg-[#F8FAFB] p-[12px]">
                  <span className={`flex w-fit items-center gap-[6px] rounded-full py-[3px] pr-[10px] pl-[4px] text-xs ${meta.bg} ${meta.text}`}>
                    <ProviderIcon provider={provider} className="h-[18px] w-[18px]" />
                    {meta.label}
                  </span>
                  {rows.map((usage) => (
                    <div key={usage.model ?? "unknown"} className="flex items-center justify-between gap-[8px] pl-[2px]">
                      <span className="text-xs text-[#4B5468]">{usage.model ?? t("dashboard.aiUsage.unknownModel")}</span>
                      <span className="shrink-0 text-xs text-[#9AA3B2]">
                        {t("dashboard.aiUsage.calls", { count: usage.calls })}
                        {usage.totalTokens > 0
                          ? ` · ${t("dashboard.aiUsage.tokens", { tokens: usage.totalTokens.toLocaleString("en-US") })}`
                          : ""}
                        {usage.costUsd !== null ? ` · ~$${usage.costUsd.toFixed(3)}` : ` · ${t("dashboard.aiUsage.costNa")}`}
                      </span>
                    </div>
                  ))}
                </div>
              );
            })}
            <p className="text-[11px] text-[#9AA3B2]">{t("dashboard.aiUsage.note")}</p>
          </div>
        )}
      </div>
    </div>
  );
}
