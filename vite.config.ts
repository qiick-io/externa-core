import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import laravel from 'laravel-vite-plugin';
import { exec } from 'node:child_process';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { defineConfig, type Plugin, type PluginContext } from 'vite';

const execAsync = promisify(exec);

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

function isWayfinderWatchedFile(file: string, root: string): boolean {
    const normalizedFile = file.replaceAll('\\', '/');
    const normalizedRoot = root.replaceAll('\\', '/');

    if (
        normalizedFile.startsWith(`${normalizedRoot}/routes/`) &&
        normalizedFile.endsWith('.php')
    ) {
        return true;
    }

    return (
        normalizedFile.startsWith(`${normalizedRoot}/app/`) &&
        normalizedFile.includes('/Http/') &&
        normalizedFile.endsWith('.php')
    );
}

function wayfinderVite8(command: string): Plugin {
    const generated = 'actions, routes, form variants';

    const runCommand = async (context: PluginContext) => {
        try {
            await execAsync(command);
        } catch (error) {
            context.error(`Error generating Wayfinder types: ${String(error)}`);
        }

        context.info(`Types generated for ${generated}`);
    };

    return {
        name: 'externa:wayfinder-vite8',
        enforce: 'pre',
        async buildStart() {
            await runCommand(this);
        },
        async hotUpdate({ file }) {
            if (this.environment.name !== 'client') {
                return;
            }

            // ponytail: Vite 8's mixed-environment handleHotUpdate compat path is
            // brittle here; run Wayfinder once from the client environment instead.
            if (isWayfinderWatchedFile(file, this.environment.config.root)) {
                await runCommand(this);
            }
        },
    };
}

export default defineConfig({
    plugins: [
        laravel({
            input: ['resources/css/app.css', 'resources/js/app.tsx'],
            ssr: 'resources/js/ssr.tsx',
            refresh: true,
            // Herd `secure` → use site certs; hot URL must be https://externa-core.test:5173
            // (not https://127.0.0.1:5173 — cert SAN is only externa-core.test).
            detectTls: 'externa-core.test',
        }),
        react({
            babel: {
                plugins: ['babel-plugin-react-compiler'],
            },
        }),
        tailwindcss(),
        wayfinderVite8(
            `"${resolvePhpBinary()}" artisan wayfinder:generate --with-form`,
        ),
    ],
    server: {
        port: 5173,
        strictPort: true,
    },
});
