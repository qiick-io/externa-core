<?php

declare(strict_types=1);

namespace App\Services;

/**
 * The running Externa version: `config('app.version')` when set, else composer.json's `version`.
 *
 * composer.json is the single version source; package.json mirrors it for npm tooling. The
 * composer.json read is memoised per process, so log lines and Inertia props stay cheap.
 */
class AppVersionService
{
    private static ?string $composerVersion = null;

    public function current(): string
    {
        $configuredVersion = config('app.version');

        if (is_string($configuredVersion) && $configuredVersion !== '') {
            return $configuredVersion;
        }

        return self::$composerVersion ??= $this->readComposerVersion();
    }

    private function readComposerVersion(): string
    {
        $composerPath = base_path('composer.json');

        if (! is_readable($composerPath)) {
            return 'dev';
        }

        $composer = json_decode((string) file_get_contents($composerPath), true);

        return is_array($composer) && is_string($composer['version'] ?? null)
            ? $composer['version']
            : 'dev';
    }
}
