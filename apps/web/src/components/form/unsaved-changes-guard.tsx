import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";

// The redesign's UnsavedChangesGuard, ported as-is. Lets a page with an
// in-progress form intercept sidebar navigation the same way it intercepts
// its own Cancel button — both funnel through this one guard so there's a
// single confirm-dialog path.
export type NavigationGuard = (proceed: () => void) => void;

const NOOP_GUARD: NavigationGuard = (proceed) => proceed();

const UnsavedChangesContext = createContext<NavigationGuard>(NOOP_GUARD);
const RegisterGuardContext = createContext<(guard: NavigationGuard | null) => void>(() => {});

export function useUnsavedChangesGuard() {
	return useContext(UnsavedChangesContext);
}

// Goes around a whole dashboard shell (sidebar included), so a form nested
// in the shell's `children` can push its guard up to where the sidebar can
// read it.
export function UnsavedChangesGuardBoundary({ children }: { children: ReactNode }) {
	const guardRef = useRef<NavigationGuard | null>(null);
	const stableGuard = useMemo<NavigationGuard>(
		() => (proceed) => {
			if (guardRef.current) guardRef.current(proceed);
			else proceed();
		},
		[],
	);
	const registerGuard = useMemo(
		() => (guard: NavigationGuard | null) => {
			guardRef.current = guard;
		},
		[],
	);
	return (
		<UnsavedChangesContext.Provider value={stableGuard}>
			<RegisterGuardContext.Provider value={registerGuard}>{children}</RegisterGuardContext.Provider>
		</UnsavedChangesContext.Provider>
	);
}

// Pass `null` when there's nothing to guard. Outside a Boundary this is a
// no-op, same graceful fallback as useUnsavedChangesGuard's default.
export function useRegisterUnsavedChangesGuard(guard: NavigationGuard | null) {
	const registerGuard = useContext(RegisterGuardContext);
	useEffect(() => {
		registerGuard(guard);
		return () => registerGuard(null);
	}, [guard, registerGuard]);
}
