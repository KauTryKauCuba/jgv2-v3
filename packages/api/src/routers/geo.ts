import { z } from "zod";
import { protectedProcedure, publicProcedure } from "../index";
import { lookupAddressArea } from "../lib/geo/address-area";
import { searchAddresses } from "../lib/geo/address-search";
import { searchPlaces } from "../lib/geo/place-search";
import { lookupPostcode } from "../lib/geo/postcodes";

// The redesign's address/place routes (src/app/api/{postcodes,address-search,
// address-area,places}), as oRPC procedures with the same rules: postcode
// lookup is public reference data; the three that reach OpenStreetMap are
// signed-in only, so they aren't an open proxy to its free services.
export const geoRouter = {
	postcode: publicProcedure.input(z.object({ postcode: z.string() })).handler(({ input }) => {
		return { matches: lookupPostcode(input.postcode) };
	}),

	addressSearch: protectedProcedure.input(z.object({ q: z.string() })).handler(async ({ input }) => {
		const q = input.q.trim();
		if (q.length < 3 || q.length > 200) return { suggestions: [], unavailable: false };
		try {
			return { suggestions: await searchAddresses(q), unavailable: false };
		} catch {
			// Search down or slow — the address can still be typed in by hand.
			return { suggestions: [], unavailable: true };
		}
	}),

	addressArea: protectedProcedure
		.input(z.object({ street: z.string(), postcode: z.string() }))
		.handler(async ({ input }) => {
			const street = input.street.trim();
			if (!street || street.length > 200 || !/^\d{5}$/.test(input.postcode)) {
				return { area: null, unavailable: false };
			}
			try {
				return { area: await lookupAddressArea(street, input.postcode), unavailable: false };
			} catch {
				return { area: null, unavailable: true };
			}
		}),

	places: protectedProcedure.input(z.object({ q: z.string() })).handler(async ({ input }) => {
		const q = input.q.trim();
		if (q.length < 2 || q.length > 100) return { places: [], unavailable: false };
		return searchPlaces(q);
	}),
};
