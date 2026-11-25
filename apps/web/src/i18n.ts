import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import Backend from "i18next-http-backend";
import { initReactI18next } from "react-i18next";

// English and Malay, loaded from public/locales/{lng}/common.json — same setup as v1.
i18n
	.use(Backend)
	.use(LanguageDetector)
	.use(initReactI18next)
	.init({
		fallbackLng: "en",
		supportedLngs: ["en", "ms"],
		// A browser set to e.g. "ms-MY" uses "ms" — there are no regional files.
		load: "languageOnly",
		defaultNS: "common",
		ns: ["common"],
		interpolation: {
			escapeValue: false,
		},
		react: {
			useSuspense: false,
		},
		backend: {
			loadPath: "/locales/{{lng}}/{{ns}}.json",
		},
		detection: {
			order: ["localStorage", "navigator", "htmlTag"],
			caches: ["localStorage"],
			lookupLocalStorage: "i18nextLng",
		},
	});

// Keep <html lang> in step, for screen readers and the browser's spell-check.
i18n.on("languageChanged", (lng) => {
	document.documentElement.lang = lng;
});

export default i18n;
