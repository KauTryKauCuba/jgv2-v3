import { useTranslation } from "react-i18next";
import { useScrollStack } from "@/hooks/use-scroll-stack";
import { getStackOffset, getStackStyle } from "@/lib/landing/badge-stack";

type Person = {
  id: string;
  name: string;
  /** Translation key under landing.jobseeker.badges. */
  roleKey: string;
  photo: string;
  top?: string;
  right?: string;
  bottom?: string;
  left?: string;
  duration: string;
  delay: string;
};

// Sample jobseekers, as in the redesign. Photos are placeholder avatars.
const PEOPLE: Person[] = [
  { id: "graphic-designer", name: "Farah Aina", roleKey: "graphicDesigner", photo: "https://i.pravatar.cc/300?img=47", top: "6%", left: "3%", duration: "5.4s", delay: "0s" },
  { id: "hr-manager", name: "Ahmad Rahman", roleKey: "hrManager", photo: "https://i.pravatar.cc/300?img=12", top: "16%", right: "4%", duration: "6.1s", delay: "0.6s" },
  { id: "software-engineer", name: "Wei Ling Tan", roleKey: "softwareEngineer", photo: "https://i.pravatar.cc/300?img=32", top: "52%", left: "1%", duration: "5.8s", delay: "1.1s" },
  { id: "sales-executive", name: "Priya Kumar", roleKey: "salesExecutive", photo: "https://i.pravatar.cc/300?img=45", top: "58%", right: "2%", duration: "6.4s", delay: "0.3s" },
  { id: "warehouse-supervisor", name: "Danial Hafiz", roleKey: "warehouseSupervisor", photo: "https://i.pravatar.cc/300?img=14", bottom: "4%", left: "16%", duration: "5.6s", delay: "1.4s" },
  { id: "customer-service", name: "Nurul Izzati", roleKey: "customerService", photo: "https://i.pravatar.cc/300?img=25", bottom: "8%", right: "15%", duration: "6.7s", delay: "0.8s" },
  { id: "warehouse-assistant", name: "Chee Keong Lim", roleKey: "warehouseAssistant", photo: "https://i.pravatar.cc/300?img=53", top: "34%", left: "9%", duration: "6.0s", delay: "0.5s" },
  { id: "marketing-executive", name: "Siti Batrisyia", roleKey: "marketingExecutive", photo: "https://i.pravatar.cc/300?img=48", bottom: "22%", right: "10%", duration: "6.3s", delay: "0.2s" },
];

// "How it works" sits between the hero and the ribbon on this page, so the
// badges need extra downward travel (and more scroll room) to still converge
// at the ribbon instead of vanishing mid-section.
const EXTRA_DY = 560;
const SCROLL_DISTANCE = 950;

/** Jobseeker cards that bob around the hero and stack behind the ribbon on scroll. */
export function JobPostingBadges() {
  const { t } = useTranslation("common");
  const { ref, progress } = useScrollStack(SCROLL_DISTANCE);

  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute inset-0 z-[1] mx-auto hidden max-w-[1300px] md:block"
    >
      {PEOPLE.map((person, i) => (
        <div
          key={person.id}
          className="absolute will-change-transform"
          style={{
            top: person.top,
            left: person.left,
            right: person.right,
            bottom: person.bottom,
            ...getStackStyle(progress, getStackOffset(i, EXTRA_DY)),
          }}
        >
          <div
            className="float-bob flex items-center gap-[10px] rounded-[14px] border border-[#EAEDF2] bg-white p-[8px] shadow-[0_8px_20px_rgba(20,27,46,0.1)] lg:py-[9px] lg:pr-[16px]"
            style={{ animationDuration: person.duration, animationDelay: person.delay }}
          >
            <span className="relative block h-[30px] w-[30px] shrink-0 overflow-hidden rounded-full lg:h-[34px] lg:w-[34px]">
              <img src={person.photo} alt="" className="h-full w-full object-cover" />
            </span>
            <span className="hidden flex-col lg:flex">
              <span className="whitespace-nowrap text-xs text-[#141B2E]">{person.name}</span>
              <span className="whitespace-nowrap text-xs text-[#9AA3B2]">
                {t(`landing.jobseeker.badges.${person.roleKey}`)}
              </span>
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
