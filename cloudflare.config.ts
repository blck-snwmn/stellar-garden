import { defineConfig } from "cf/config";

export default defineConfig({
	worker: {
		name: "stellar-garden",
		compatibilityDate: "2025-09-27",
		observability: {
			enabled: true,
		},
		assets: {
			notFoundHandling: "single-page-application",
		},
	},
});
