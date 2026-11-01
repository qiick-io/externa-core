<?php

namespace App\Console\Concerns;

use Illuminate\Support\Facades\File;

/**
 * Shared .env read/write helpers for artisan installers and token rotators.
 */
trait ManagesDotEnv
{
    private function looksLikeProduction(): bool
    {
        if (app()->environment('production')) {
            return true;
        }

        if (! File::exists(base_path('.env'))) {
            return false;
        }

        $env = File::get(base_path('.env'));

        return (bool) preg_match('/^APP_ENV\s*=\s*production\s*$/mi', $env);
    }

    private function setEnv(string $env, string $key, string $value): string
    {
        $escaped = $this->escapeEnvValue($value);
        $pattern = '/^'.preg_quote($key, '/').'=.*$/m';

        if (preg_match($pattern, $env)) {
            return preg_replace($pattern, $key.'='.$escaped, $env) ?? $env;
        }

        return rtrim($env)."\n{$key}={$escaped}\n";
    }

    private function escapeEnvValue(string $value): string
    {
        if ($value === '' || preg_match('/[\s#"\']/', $value)) {
            return '"'.str_replace(['\\', '"'], ['\\\\', '\\"'], $value).'"';
        }

        return $value;
    }
}
