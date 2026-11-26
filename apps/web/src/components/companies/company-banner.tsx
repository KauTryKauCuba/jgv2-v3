/**
 * A company's 3:1 cover banner: the uploaded image, or a soft grey with a faint
 * dot pattern so a card or page header never shows an empty box. Fills its
 * parent; the parent sets the size and rounding.
 */
export function CompanyBanner({
  url,
  className = "",
  eager = false,
}: {
  url: string | null | undefined;
  className?: string;
  eager?: boolean;
}) {
  if (url) {
    return <img src={url} alt="" loading={eager ? "eager" : "lazy"} className={`h-full w-full object-cover ${className}`} />;
  }
  return (
    <div
      aria-hidden
      className="h-full w-full"
      style={{
        backgroundImage: "radial-gradient(rgba(255,255,255,0.8) 1px, transparent 1px)",
        backgroundColor: "#ECEEF2",
        backgroundSize: "14px 14px",
      }}
    />
  );
}
