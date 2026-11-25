import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig, loadEnv } from "vite";

// Where the API server runs during local development (apps/server, port 4401).
const LOCAL_DEV_SERVER_URL = "http://localhost:4401";

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), "");
	const viteServerUrl =
		process.env.VITE_SERVER_URL?.trim() ||
		env.VITE_SERVER_URL?.trim() ||
		LOCAL_DEV_SERVER_URL;

	return {
		// autoCodeSplitting: each page's code loads only when that page is opened.
		plugins: [tailwindcss(), tanstackRouter({ autoCodeSplitting: true }), react()],
		resolve: {
			alias: {
				"@": path.resolve(__dirname, "./src"),
			},
		},
		server: {
			host: true,
			port: 4400,
			strictPort: true,
		},
		preview: {
			host: true,
			port: 4400,
			strictPort: true,
		},
		define: {
			"import.meta.env.VITE_SERVER_URL": JSON.stringify(viteServerUrl),
		},
	};
});
