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

// The redesign's JobseekerOnboardingBadges: an onboarding-only set, kept
// separate from the landing page's JobPostingBadges. Positioned within its
// own fixed-height wrapper, since the hero here grows tall with the form.
const PEOPLE: Person[] = [
	{ id: "graphic-designer", name: "Farah Aina", roleKey: "graphicDesigner", photo: "https://i.pravatar.cc/300?img=47", top: "4%", left: "2%", duration: "5.4s", delay: "0s" },
	{ id: "hr-manager", name: "Ahmad Rahman", roleKey: "hrManager", photo: "https://i.pravatar.cc/300?img=12", top: "4%", right: "2%", duration: "6.1s", delay: "0.6s" },
	{ id: "software-engineer", name: "Wei Ling Tan", roleKey: "softwareEngineer", photo: "https://i.pravatar.cc/300?img=32", bottom: "6%", left: "8%", duration: "5.8s", delay: "1.1s" },
	{ id: "sales-executive", name: "Priya Kumar", roleKey: "salesExecutive", photo: "https://i.pravatar.cc/300?img=45", bottom: "6%", right: "8%", duration: "6.4s", delay: "0.3s" },
];

export function JobseekerOnboardingBadges() {
	const { t } = useTranslation("common");
	const { ref, progress } = useScrollStack();

	return (
		<div
			ref={ref}
			aria-hidden
			className="pointer-events-none absolute inset-x-0 top-0 z-[1] mx-auto hidden h-[300px] max-w-[1300px] md:block"
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
						...getStackStyle(progress, getStackOffset(i)),
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
