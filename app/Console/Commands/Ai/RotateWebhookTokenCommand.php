<?php

namespace App\Console\Commands\Ai;

use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\File;
use Symfony\Component\Console\Attribute\AsCommand;
use Throwable;

/**
 * Rotate AI_WEBHOOK_TOKEN with an optional grace window for the previous secret.
 */
#[AsCommand(name: 'ai:rotate-webhook-token')]
class RotateWebhookTokenCommand extends Command
{
    protected $signature = 'ai:rotate-webhook-token
        {--grace=24h : Grace window for the previous token (e.g. 30m, 24h, 7d)}
        {--show : Print the new token once to stdout}
        {--write-env : Persist the new + previous token keys into .env}
        {--force : Allow --write-env when APP_ENV is production}';

    protected $description = 'Rotate the AI collection-import webhook HMAC token with an optional grace period';

    public function handle(): int
    {
        $show = (bool) $this->option('show');
        $writeEnv = (bool) $this->option('write-env');

        if (! $show && ! $writeEnv) {
            $this->error('Pass --show and/or --write-env so the new token is displayed or persisted.');

            return self::FAILURE;
        }

        try {
            $graceSeconds = $this->parseGrace((string) $this->option('grace'));
        } catch (Throwable $exception) {
            $this->error($exception->getMessage());

            return self::FAILURE;
        }

        $previous = (string) config('ai.webhook_token', '');
        $newToken = bin2hex(random_bytes(32));
        $graceUntil = Carbon::now()->addSeconds($graceSeconds);
        $graceUntilIso = $graceUntil->toIso8601String();

        if ($writeEnv) {
            $written = $this->writeEnvFile($previous, $newToken, $graceUntilIso);
            if ($written !== self::SUCCESS) {
                return $written;
            }
        }

        config([
            'ai.webhook_token' => $newToken,
            'ai.webhook_token_previous' => $previous !== '' ? $previous : null,
            'ai.webhook_token_previous_expires_at' => $previous !== '' ? $graceUntilIso : null,
        ]);

        activity()
            ->useLog('ai')
            ->event('webhook_token_rotated')
            ->withProperties([
                'source' => 'cli',
                'grace_until' => $previous !== '' ? $graceUntilIso : null,
                'wrote_env' => $writeEnv,
            ])
            ->log('AI webhook token rotated');

        if ($show) {
            $this->line($newToken);
        } else {
            $this->info('New token persisted to .env (not printed; re-run with --show if needed).');
        }

        if ($previous !== '') {
            $this->info("Previous token accepted until {$graceUntilIso}.");
        } else {
            $this->info('No previous token was set; grace window unused.');
        }

        $this->newLine();
        $this->warn('Docker / config:cache: after changing .env, run `php artisan config:clear` (or rebuild config cache) and restart workers/containers so the new token is loaded.');

        return self::SUCCESS;
    }

    /**
     * @return int Command exit code
     */
    private function writeEnvFile(string $previous, string $newToken, string $graceUntilIso): int
    {
        if ($this->looksLikeProduction() && ! (bool) $this->option('force')) {
            $this->error('Refusing --write-env in production without --force.');

            return self::FAILURE;
        }

        $envPath = base_path('.env');
        if (! File::exists($envPath)) {
            $this->error('.env not found at '.$envPath);

            return self::FAILURE;
        }

        if (! is_writable($envPath)) {
            $this->error('.env is not writable.');

            return self::FAILURE;
        }

        $env = File::get($envPath);
        $env = $this->setEnv($env, 'AI_WEBHOOK_TOKEN', $newToken);
        if ($previous !== '') {
            $env = $this->setEnv($env, 'AI_WEBHOOK_TOKEN_PREVIOUS', $previous);
            $env = $this->setEnv($env, 'AI_WEBHOOK_TOKEN_PREVIOUS_EXPIRES_AT', $graceUntilIso);
        } else {
            $env = $this->setEnv($env, 'AI_WEBHOOK_TOKEN_PREVIOUS', '');
            $env = $this->setEnv($env, 'AI_WEBHOOK_TOKEN_PREVIOUS_EXPIRES_AT', '');
        }

        File::put($envPath, $env);
        $this->info('Updated .env with AI_WEBHOOK_TOKEN (+ previous/expiry when applicable).');

        return self::SUCCESS;
    }

    private function parseGrace(string $grace): int
    {
        $grace = trim($grace);
        if ($grace === '') {
            throw new \InvalidArgumentException('Grace window must not be empty.');
        }

        if (! preg_match('/^(\d+)([smhd])$/i', $grace, $matches)) {
            throw new \InvalidArgumentException('Invalid --grace value. Use e.g. 30m, 24h, or 7d.');
        }

        $amount = (int) $matches[1];
        if ($amount < 1) {
            throw new \InvalidArgumentException('Grace window must be at least 1 unit.');
        }

        $unit = strtolower($matches[2]);

        return match ($unit) {
            's' => $amount,
            'm' => $amount * 60,
            'h' => $amount * 3600,
            'd' => $amount * 86400,
            default => throw new \InvalidArgumentException('Invalid --grace unit. Use s, m, h, or d.'),
        };
    }

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
