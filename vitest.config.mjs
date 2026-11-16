import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'url';

export default defineConfig({
	resolve: {
		// The real `obsidian` package has no code, only types. Tests use a small stand-in.
		alias: { obsidian: fileURLToPath(new URL('./test/obsidian-mock.ts', import.meta.url)) },
	},
	test: { include: ['test/**/*.test.ts'] },
});
