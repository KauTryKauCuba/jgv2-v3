import type { TeamRole } from "@jobgiga-app/api/shared/team-roles";
import { useQuery } from "@tanstack/react-query";
import { orpc } from "@/utils/orpc";

/** The signed-in teammate's role at their company (team.myMembership), or null until loaded. */
export function useTeamRole(): TeamRole | null {
  const query = useQuery({ ...orpc.team.myMembership.queryOptions(), meta: { suppressErrorToast: true } });
  return query.data?.role ?? null;
}
