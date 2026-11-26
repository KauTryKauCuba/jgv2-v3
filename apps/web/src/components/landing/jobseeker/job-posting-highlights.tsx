import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { sampleJobAdFill } from "@/data/landing/sample-job-ads";
import { buildDisplayPostings, type JobPosting } from "@/data/landing/sample-job-postings";
import { useScrollReveal } from "@/hooks/use-scroll-reveal";
import { getRevealOffset, getRevealStyle } from "@/lib/landing/card-reveal";
import { gradientFrameClass } from "@/lib/landing/form-styles";
import { locationLabel } from "@/lib/landing/job-format";
import { SearchIcon } from "../icons";
import { type FeaturedJobAd, FeaturedJobAds } from "./featured-job-ads";
import { JobPostingDetails, PostingCard } from "./job-posting-details";

const K = "landing.jobseeker.jobs";
const ALL = "all";

/** A live job ad from the API; its job details come from the matching posting. */
export type LiveJobAd = {
  id: string;
  jobPostingId: string;
  mediaType: "image" | "video";
  mediaUrl: string;
  companyVerified: boolean;
};

const filterPillClass =
  "flex h-[30px] shrink-0 items-center justify-center whitespace-nowrap rounded-full px-[14px] text-sm transition-colors";

/**
 * "Jobs posted on JobGiga": cards that fade down out of the ribbon, featured
 * job ads, then a sticky search and filter bar over a job list and a details
 * panel. Sample listings fill the list until there are 6 real postings.
 * TODO(api): pass real postings and ads from oRPC. Apply, Save, Report and
 * the screening questions come back with login (only a signed-in jobseeker
 * sees them on a real posting).
 */
export function JobPostingHighlights({
  postings = [],
  jobAds = [],
}: {
  postings?: JobPosting[];
  jobAds?: LiveJobAd[];
}) {
  const { t } = useTranslation("common");
  const { ref, progress } = useScrollReveal();
  const [searchQuery, setSearchQuery] = useState("");
  const [locationQuery, setLocationQuery] = useState("");
  const [locationFilter, setLocationFilter] = useState(ALL);
  const [typeFilter, setTypeFilter] = useState(ALL);
  // Visual only for now — there's no per-jobseeker "viewed" tracking yet.
  const [postingsTab, setPostingsTab] = useState<"all" | "new">("all");

  const allPostings = useMemo(() => buildDisplayPostings(postings), [postings]);
  const locations = useMemo(() => Array.from(new Set(allPostings.map((p) => p.location))), [allPostings]);
  const jobTypes = useMemo(() => Array.from(new Set(allPostings.map((p) => p.employmentType))), [allPostings]);

  const filteredPostings = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const locQuery = locationQuery.trim().toLowerCase();
    return allPostings.filter((posting) => {
      const matchesQuery =
        !query || posting.title.toLowerCase().includes(query) || posting.company.toLowerCase().includes(query);
      // Matches the shown (translated) label too, so "Jarak jauh" finds remote roles in Malay.
      const matchesLocationQuery =
        !locQuery ||
        posting.location.toLowerCase().includes(locQuery) ||
        locationLabel(posting.location, t).toLowerCase().includes(locQuery);
      const matchesLocation = locationFilter === ALL || posting.location === locationFilter;
      const matchesType = typeFilter === ALL || posting.employmentType === typeFilter;
      return matchesQuery && matchesLocationQuery && matchesLocation && matchesType;
    });
  }, [allPostings, searchQuery, locationQuery, locationFilter, typeFilter, t]);

  // Derived: if the selected posting drops out of the results, the first one shows instead.
  const [selectedId, setSelectedId] = useState(allPostings[0]?.id);
  const selectedPosting = filteredPostings.find((p) => p.id === selectedId) ?? filteredPostings[0];
  const detailRef = useRef<HTMLDivElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Below lg the details panel stacks under the list, so bring it into view.
  function selectPosting(id: string) {
    setSelectedId(id);
    if (!window.matchMedia("(min-width: 1024px)").matches) {
      requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  }

  // Real ads take their details from the listed posting (skipped if it isn't
  // listed); sample ads fill the remaining slots and open their sample listing.
  const featuredAds = useMemo<FeaturedJobAd[]>(() => {
    const byId = new Map(allPostings.map((p) => [p.id, p]));
    const real = jobAds.flatMap((ad) => {
      const posting = byId.get(ad.jobPostingId);
      if (!posting) return [];
      return [
        {
          ...ad,
          jobTitle: posting.title,
          companyName: posting.company,
          companyLogoUrl: posting.logoUrl,
          location: locationLabel(posting.location, t),
          jobType: t(`landing.jobs.employmentType.${posting.employmentType}`),
        },
      ];
    });
    const samples = sampleJobAdFill(
      real.length,
      real.map((a) => a.companyName),
    ).map((sample) => {
      const listing = allPostings.find(
        (p) => p.sample && p.company === sample.company && p.title === sample.jobTitle,
      );
      return {
        id: `sample-${sample.company}-${sample.jobTitle}`,
        jobPostingId: listing?.id ?? "",
        mediaType: "image" as const,
        mediaUrl: sample.artwork,
        companyVerified: false,
        jobTitle: sample.jobTitle,
        companyName: sample.company,
        companyLogoUrl: sample.companyLogoUrl,
        location: locationLabel(sample.location, t),
        jobType: t(`landing.jobs.employmentType.${sample.employmentType}`),
        selectable: !!listing,
      };
    });
    return [...real, ...samples];
  }, [jobAds, allPostings, t]);

  // A featured job opens in the details panel: filters are cleared so it's
  // in the results, then the results scroll into view.
  function openFeaturedJob(id: string) {
    setSearchQuery("");
    setLocationQuery("");
    setLocationFilter(ALL);
    setTypeFilter(ALL);
    setSelectedId(id);
    const wide = window.matchMedia("(min-width: 1024px)").matches;
    requestAnimationFrame(() =>
      (wide ? resultsRef : detailRef).current?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  }

  // useScrollReveal stays at 0 under reduced motion ("collapsed and hidden"
  // here), so show the cards fully settled instead.
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(reduce.matches);
    sync();
    reduce.addEventListener("change", sync);
    return () => reduce.removeEventListener("change", sync);
  }, []);
  const revealProgress = reducedMotion ? 1 : progress;

  return (
    <div className="shell relative z-[1] -mt-[32px] pt-[clamp(32px,5vh,56px)] pb-[128px]">
      <div className="relative z-[1] mx-auto max-w-[720px] text-center">
        {/* Block wrapper so the pill and the inline-block heading never share a line. */}
        <div>
          <span className="inline-flex items-center rounded-full bg-brand-gold-soft px-[14px] py-[7px] text-xs text-brand-gold-dark">
            {t(`${K}.eyebrow`)}
          </span>
        </div>
        <h2
          className="mt-[16px] font-sans font-semibold text-[#141B2E]"
          style={{
            fontSize: "clamp(34px, 4vw, 56px)",
            lineHeight: 1.08,
            letterSpacing: "-0.02em",
            backgroundImage: "var(--brand-gradient-jobseeker)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
            display: "inline-block",
            paddingBottom: "0.08em",
          }}
        >
          {t(`${K}.title`)}
        </h2>
      </div>

      <div
        ref={ref}
        className="relative z-0 mt-[128px] grid grid-cols-1 items-stretch gap-[12px] sm:grid-cols-2 lg:grid-cols-4"
      >
        {filteredPostings.map((posting, i) => (
          <div
            key={posting.id}
            className="will-change-transform"
            style={getRevealStyle(revealProgress, getRevealOffset(i))}
          >
            <PostingCard posting={posting} />
          </div>
        ))}
      </div>

      {filteredPostings.length === 0 && (
        <div className="mt-[12px] rounded-[14px] border border-[#EAEDF2] bg-white p-[22px] text-center">
          <p className="text-sm text-[#4B5468]">{t(`${K}.noMatches`)}</p>
        </div>
      )}

      <FeaturedJobAds ads={featuredAds} onSelect={openFeaturedJob} />

      <div
        className={`z-30 mx-auto flex w-full flex-col gap-[14px] bg-brand-gold-page py-[14px] lg:sticky lg:top-0 ${
          featuredAds.length > 0 ? "mt-[56px]" : "mt-[64px]"
        }`}
      >
        <div
          role="radiogroup"
          aria-label={t(`${K}.filterLabel`)}
          className="scrollbar-hide mx-auto flex w-fit max-w-full items-center gap-[4px] overflow-x-auto rounded-full border border-black/[0.1] p-[3px]"
        >
          {[ALL, ...locations].map((location) => (
            <button
              key={location}
              data-db="job.cityId"
              type="button"
              role="radio"
              aria-checked={locationFilter === location}
              onClick={() => setLocationFilter(location)}
              className={`${filterPillClass} ${
                locationFilter === location ? "bg-brand-gold text-[#141B2E]" : "text-[#4B5468] hover:bg-black/[0.03]"
              }`}
            >
              {location === ALL ? t(`${K}.allLocations`) : locationLabel(location, t)}
            </button>
          ))}

          <span className="mx-[4px] h-[20px] w-px shrink-0 bg-black/[0.1]" />

          {[ALL, ...jobTypes].map((type) => (
            <button
              key={type}
              data-db="job.employmentType"
              type="button"
              role="radio"
              aria-checked={typeFilter === type}
              onClick={() => setTypeFilter(type)}
              className={`${filterPillClass} ${
                typeFilter === type ? "bg-brand-gold-dark text-white" : "text-[#4B5468] hover:bg-black/[0.03]"
              }`}
            >
              {type === ALL ? t(`${K}.allTypes`) : t(`landing.jobs.employmentType.${type}`)}
            </button>
          ))}
        </div>

        <div
          id="job-search"
          className="flex scroll-mt-[90px] flex-col rounded-[29px] border border-black/[0.1] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:h-[58px] sm:flex-row sm:items-center"
        >
          <div className="flex h-[58px] shrink-0 items-center gap-[10px] px-[18px] sm:flex-1">
            <SearchIcon className="h-[16px] w-[16px] shrink-0 text-[#9AA3B2]" />
            <input
              type="text"
              data-db="search.jobs"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t(`${K}.searchPlaceholder`)}
              aria-label={t(`${K}.searchPlaceholder`)}
              className="h-full w-full bg-transparent text-sm text-[#141B2E] outline-none placeholder:text-[#9AA3B2]"
            />
          </div>

          <span className="mx-[6px] hidden h-[26px] w-px shrink-0 bg-black/[0.1] sm:block" />
          <span className="mx-[18px] block h-px shrink-0 bg-black/[0.1] sm:hidden" />

          <div className="flex h-[58px] shrink-0 items-center gap-[10px] px-[18px] sm:flex-1">
            <SearchIcon className="h-[16px] w-[16px] shrink-0 text-[#9AA3B2]" />
            <input
              type="text"
              data-db="job.cityId"
              value={locationQuery}
              onChange={(e) => setLocationQuery(e.target.value)}
              placeholder={t(`${K}.locationPlaceholder`)}
              aria-label={t(`${K}.locationPlaceholder`)}
              className="h-full w-full bg-transparent text-sm text-[#141B2E] outline-none placeholder:text-[#9AA3B2]"
            />
          </div>
        </div>
      </div>

      {selectedPosting && (
        <div
          ref={resultsRef}
          // Clears the sticky search bar above when a featured job scrolls here.
          className="relative z-0 mx-auto mt-[32px] grid w-full scroll-mt-[16px] grid-cols-1 gap-[16px] lg:scroll-mt-[170px] lg:grid-cols-[340px_1fr] lg:items-start"
        >
          <div className="flex flex-col gap-[12px] p-[4px]">
            <div
              role="radiogroup"
              aria-label={t(`${K}.tabsLabel`)}
              className="grid h-[38px] grid-cols-2 gap-[4px] rounded-full border border-black/[0.1] p-[3px]"
            >
              {(["all", "new"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  role="radio"
                  aria-checked={postingsTab === tab}
                  onClick={() => setPostingsTab(tab)}
                  className="flex h-[30px] items-center justify-center rounded-full text-sm text-[#4B5468] transition-colors hover:bg-black/[0.03] aria-checked:bg-brand-gold-dark aria-checked:text-white aria-checked:hover:bg-brand-gold-dark"
                >
                  {t(tab === "all" ? `${K}.allJobs` : "landing.jobs.newToYou")}
                </button>
              ))}
            </div>
            {filteredPostings.map((posting) => (
              <PostingCard
                key={posting.id}
                posting={posting}
                selected={selectedPosting.id === posting.id}
                onClick={() => selectPosting(posting.id)}
              />
            ))}
          </div>

          <div ref={detailRef} className={`scroll-mt-[16px] lg:sticky lg:top-[150px] ${gradientFrameClass("gold")}`}>
            <div className="rounded-[19px] bg-white p-[16px] sm:p-[24px]">
              <JobPostingDetails posting={selectedPosting} />

              {selectedPosting.sample ? (
                <p className="mt-[24px] text-xs text-[#9AA3B2]">{t(`${K}.sampleListing`)}</p>
              ) : (
                <p className="mt-[24px] text-xs text-[#4B5468]">
                  {/* Like the redesign: back up to the hero to sign in. */}
                  <a href="#top" data-db="action.apply" className="text-brand-gold-dark hover:underline">
                    {t(`${K}.signInToApply`)}
                  </a>{" "}
                  {t(`${K}.toApply`)}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
