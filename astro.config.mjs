// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
// Hosted on GitHub Pages under /precious-things-studio/ — asset paths use import.meta.env.BASE_URL.
export default defineConfig({
	site: 'https://xsebo99.github.io',
	base: '/precious-things-studio/',
	markdown: {
		// Both themes are emitted; Blog.astro switches to the dark one with prefers-color-scheme.
		shikiConfig: { themes: { light: 'github-light', dark: 'github-dark' } },
	},
});
