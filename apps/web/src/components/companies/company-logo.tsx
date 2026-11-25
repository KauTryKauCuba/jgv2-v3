import { BuildingIcon } from "@/components/landing/icons";
import { VerifiedBadge } from "@/components/landing/verified-badge";

/** A company's square logo (or a building icon), with the SSM-verified tick when verified. */
export function CompanyLogo({ url, size = 48, verified = false }: { url: string | null; size?: number; verified?: boolean }) {
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {url ? (
        <img src={url} alt="" className="h-full w-full rounded-[12px] bg-white object-contain p-[4px]" />
      ) : (
        <div className="flex h-full w-full items-center justify-center rounded-[12px] bg-brand-teal-soft text-brand-teal-dark">
          <BuildingIcon className="h-[45%] w-[45%]" />
        </div>
      )}
      {verified && <VerifiedBadge size={Math.max(14, Math.round(size * 0.32))} />}
    </div>
  );
}
