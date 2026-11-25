import { useTranslation } from "react-i18next";
import { AssistantCard } from "../assistant-card";
import { AiFillMockup } from "./ai-fill-mockup";
import { InterviewMockup } from "./interview-mockup";
import { JobPostMockup } from "./job-post-mockup";
import { ManageJobMockup } from "./manage-job-mockup";
import { PosterMockup } from "./poster-mockup";

// Steps 2 and 4 sit on a full-width band, a soft take on the teal-to-gold gradient.
const EMPLOYER_BAND = {
  color: "var(--band-employer)",
  gradient: "var(--band-gradient-employer)",
  fadeEdges: true,
  startWidth: 45,
  durationMs: 1400,
};

const STEPS = [
  { id: "setup", visual: <AiFillMockup /> },
  { id: "writeJobs", visual: <JobPostMockup />, reverse: true, band: EMPLOYER_BAND },
  { id: "track", visual: <ManageJobMockup /> },
  { id: "interview", visual: <InterviewMockup />, reverse: true, band: EMPLOYER_BAND },
  { id: "poster", visual: <PosterMockup /> },
] as const;

/** The employer landing page's numbered 1–5 journey, each with a live mockup. */
export function EmployerSteps() {
  const { t } = useTranslation("common");

  return (
    <>
      {STEPS.map((step, i) => {
        const k = `landing.employer.steps.${step.id}`;
        return (
          <AssistantCard
            key={step.id}
            step={i + 1}
            eyebrow={t(`${k}.eyebrow`)}
            headline={t(`${k}.headline`)}
            bullets={[1, 2, 3].map((n) => ({
              title: t(`${k}.bullet${n}Title`),
              detail: t(`${k}.bullet${n}Detail`),
            }))}
            visual={step.visual}
            reverse={"reverse" in step ? step.reverse : false}
            band={"band" in step ? step.band : undefined}
          />
        );
      })}
    </>
  );
}
