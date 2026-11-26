import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

// The redesign's InterviewCountdown: "Starts in 1d 4h", ticking every second.
export function InterviewCountdown({
  scheduledAt,
  className = "mt-[4px] text-xs text-[#7C5CD1]",
}: {
  scheduledAt: string;
  className?: string;
}) {
  const { t } = useTranslation("common");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const diffMs = new Date(scheduledAt).getTime() - now;
  if (diffMs <= 0) return null;

  const totalSeconds = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  let label: string;
  if (days > 0) label = `${days}${t("dashboard.countdown.d")} ${hours}${t("dashboard.countdown.h")}`;
  else if (hours > 0) label = `${hours}${t("dashboard.countdown.h")} ${minutes}${t("dashboard.countdown.m")}`;
  else if (minutes > 0) label = `${minutes}${t("dashboard.countdown.m")} ${seconds}${t("dashboard.countdown.s")}`;
  else label = `${seconds}${t("dashboard.countdown.s")}`;

  return <p className={className}>{t("dashboard.countdown.startsIn", { time: label })}</p>;
}
