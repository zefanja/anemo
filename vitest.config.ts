import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'url';

export default defineConfig({
	test: {
		include: ['src/**/*.test.ts'],
		globals: true,
		environment: 'node',
		alias: {
			$lib: fileURLToPath(new URL('./src/lib', import.meta.url)),
			'$env/dynamic/private': fileURLToPath(
				new URL('./src/tests/mocks/env-dynamic.ts', import.meta.url)
			)
		}
	}
});
