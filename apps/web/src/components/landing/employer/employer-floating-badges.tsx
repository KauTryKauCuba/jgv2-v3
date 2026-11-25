import { useTranslation } from "react-i18next";
import { type FloatingBadge, FloatingBadges } from "../floating-badges";

type BadgeConfig = Omit<FloatingBadge, "label"> & { labelKey: string };

const BADGES: BadgeConfig[] = [
  { id: "blue-collar", labelKey: "manufacturing", src: "/employer-types/blue-collar.jpg", top: "6%", left: "3%", duration: "5.4s", delay: "0s" },
  { id: "white-collar", labelKey: "corporate", src: "/employer-types/white-collar.jpg", top: "16%", right: "4%", duration: "6.1s", delay: "0.6s" },
  { id: "construction", labelKey: "construction", src: "/employer-types/construction.jpg", top: "52%", left: "1%", duration: "5.8s", delay: "1.1s" },
  { id: "office", labelKey: "technology", src: "/employer-types/office.jpg", top: "58%", right: "2%", duration: "6.4s", delay: "0.3s" },
  { id: "retail", labelKey: "retail", src: "/employer-types/retail.jpg", bottom: "4%", left: "16%", duration: "5.6s", delay: "1.4s" },
  { id: "delivery", labelKey: "logistics", src: "/employer-types/delivery.jpg", bottom: "8%", right: "15%", duration: "6.7s", delay: "0.8s" },
  { id: "oil-gas", labelKey: "oilGas", src: "/employer-types/oil-gas.jpg", top: "34%", left: "9%", duration: "6.0s", delay: "0.5s" },
  { id: "manufacturing", labelKey: "warehousing", src: "/employer-types/manufacturing.jpg", bottom: "22%", right: "10%", duration: "6.3s", delay: "0.2s" },
];

export function EmployerFloatingBadges() {
  const { t } = useTranslation("common");
  return (
    <FloatingBadges
      badges={BADGES.map(({ labelKey, ...badge }) => ({
        ...badge,
        label: t(`landing.employer.industries.${labelKey}`),
      }))}
    />
  );
}
