import path from 'node:path';
import babel from '@rolldown/plugin-babel';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import { defineConfig } from 'vite-plus';

export default defineConfig({
    // Same React Compiler setup as vite.config.ts, so unit tests run the compiled code.
    plugins: [react(), babel({ presets: [reactCompilerPreset()] })],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, 'resources/js'),
        },
    },
    test: {
        environment: 'jsdom',
        setupFiles: ['./resources/js/test/setup.ts'],
        include: [
            'resources/js/**/*.{test,spec}.{ts,tsx}',
            'scripts/**/*.test.mjs',
        ],
        css: false,
    },
});
