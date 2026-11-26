/**
 * The redesign's NavLinkIcon: a dashboard sidebar link's icon, which turns
 * into a spinner while the page it opens is loading. Same 16px box either
 * way, so nothing shifts; shown only after a short delay, so fast pages
 * don't flash. The sidebar says which link is loading (`pending`).
 */
export function NavLinkIcon({
  icon: Icon,
  pending = false,
}: {
  icon: React.ComponentType<{ className?: string }>;
  pending?: boolean;
}) {
  return (
    <span className="relative h-[16px] w-[16px] shrink-0">
      <Icon className={`h-[16px] w-[16px] transition-opacity ${pending ? "opacity-0 delay-150" : "opacity-100"}`} />
      <span
        aria-hidden
        className={`absolute inset-[1px] rounded-full border-[1.5px] border-current border-t-transparent transition-opacity ${
          pending ? "animate-spin opacity-100 delay-150" : "opacity-0"
        }`}
      />
    </span>
  );
}
