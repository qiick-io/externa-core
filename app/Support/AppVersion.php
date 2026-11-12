<?php

declare(strict_types=1);

namespace App\Support;

/**
 * The running Externa version: `config('app.version')` when set, else composer.json's `version`.
 *
 * composer.json is the single version source; package.json mirrors it for npm tooling.
 */
final class AppVersion
{
    private static ?string $fromComposer = null;

    public static function current(): string
    {
        $configured = config('app.version');

        if (is_string($configured) && $configured !== '') {
            return $configured;
        }

        return self::$fromComposer ??= self::readComposerVersion();
    }

    private static function readComposerVersion(): string
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
