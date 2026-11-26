import { VerifiedBadge } from "@/components/landing/verified-badge";

/**
 * The redesign's PhoneVerifiedAvatarBadge: "Phone verified" on a person's
 * avatar — the same glossy seal as a verified company's logo, in green.
 * Place it inside a `relative` wrapper around the avatar.
 */
export function PhoneVerifiedAvatarBadge({ size = 22 }: { size?: number }) {
	return <VerifiedBadge variant="phone" placement="avatar" size={size} />;
}
