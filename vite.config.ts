import { wayfinder } from '@laravel/vite-plugin-wayfinder';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import laravel from 'laravel-vite-plugin';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { defineConfig } from 'vite';

function resolvePhpBinary(): string {
    const herdPhp84 = path.join(
        os.homedir(),
        'Library/Application Support/Herd/bin/php84',
    );

    if (existsSync(herdPhp84)) {
        return herdPhp84;
    }

    return 'php';
}

export default defineConfig({
    plugins: [
        laravel({
            input: ['resources/css/app.css', 'resources/js/app.tsx'],
            ssr: 'resources/js/ssr.tsx',
            refresh: true,
        }),
        react({
            babel: {
                plugins: ['babel-plugin-react-compiler'],
            },
        }),
        tailwindcss(),
        wayfinder({
            formVariants: true,
            command: `"${resolvePhpBinary()}" artisan wayfinder:generate --with-form`,
        }),
    ],
});
