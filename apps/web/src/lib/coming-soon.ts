import { toast } from "sonner";
import i18n from "@/i18n";

/**
 * Placeholder for actions that need the backend (sign in, apply, upload…).
 * Every call site is a spot to wire to oRPC once the API exists.
 */
export function showComingSoon() {
  toast(i18n.t("common.comingSoon"));
}
