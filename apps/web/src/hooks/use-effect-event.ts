import { useCallback, useInsertionEffect, useRef } from "react";

/**
 * React 19.2's `useEffectEvent`, for React 19.1 (what v3 is on): a stable
 * function that always runs the latest `handler`, so effects can call it
 * without listing everything it reads as a dependency. Swap for React's own
 * once v3 upgrades.
 */
export function useEffectEvent<Args extends unknown[], Result>(handler: (...args: Args) => Result) {
	const latest = useRef(handler);
	useInsertionEffect(() => {
		latest.current = handler;
	});
	return useCallback((...args: Args) => latest.current(...args), []);
}
