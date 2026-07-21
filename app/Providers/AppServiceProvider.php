<?php

namespace App\Providers;

use App\Models\User;
use App\Services\Authorization\EffectivePermissionResolver;
use App\Services\Settings\ProjectSettings;
use App\Support\Http\CurlSseStreamer;
use Carbon\CarbonImmutable;
use Illuminate\Auth\Events\Failed;
use Illuminate\Auth\Events\Login;
use Illuminate\Auth\Events\Logout;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Illuminate\Validation\Rules\Password;
use Spatie\Activitylog\Facades\Activity;
use Throwable;

/**
 * Registers application service container bindings and boot-time hooks.
 */
/**
 * Core application service provider: auth, activity logging, HTTP streaming, defaults.
 */
class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->app->singleton(EffectivePermissionResolver::class);
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        $this->configureDefaults();
        $this->configureAuthorization();
        $this->configureRateLimiting();
        $this->configureActivityLogging();
        $this->registerAuthActivityListeners();
        $this->configureHttpClientStreaming();
    }

    protected function configureRateLimiting(): void
    {
        RateLimiter::for('api', function (Request $request) {
            $key = $request->user()?->id ?: $request->ip();

            return Limit::perMinute(60)->by((string) $key);
        });
    }

    /**
     * Herd PHP-FPM + Guzzle `stream => true` returns HTTP 200 with a 0-byte body for
     * LM Studio SSE. Prefer curl_multi progressive streaming; fall back to buffering.
     * CurlMultiReadableStream also remaps LM Studio reasoning_text → summary_text events
     * so laravel/ai yields tokens (keeps nginx fastcgi_read_timeout from idling at 60s).
     */
    protected function configureHttpClientStreaming(): void
    {
        Http::globalMiddleware(function (callable $handler): callable {
            return function ($request, array $options) use ($handler) {
                if (($options['stream'] ?? false) !== true) {
                    return $handler($request, $options);
                }

                try {
                    return CurlSseStreamer::stream($request);
                } catch (Throwable) {
                    // ponytail: if curl_multi fails, buffer the full SSE body so chat still works
                    unset($options['stream']);

                    return $handler($request, $options);
                }
            };
        });
    }

    protected function configureAuthorization(): void
    {
        Gate::before(function (?User $user): ?bool {
            if ($user === null) {
                return null;
            }

            if (app(EffectivePermissionResolver::class)->isSuperAdmin($user)) {
                return true;
            }

            return null;
        });
    }

    protected function configureActivityLogging(): void
    {
        Activity::beforeLogging(function ($activity): void {
            $properties = collect($activity->properties ?? []);

            $activity->properties = $properties->merge([
                'ip' => request()->ip(),
                'user_agent' => request()->userAgent(),
            ]);
        });
    }

    protected function registerAuthActivityListeners(): void
    {
        Event::listen(Login::class, function (Login $event): void {
            if (! $event->user instanceof User) {
                return;
            }

            activity()
                ->causedBy($event->user)
                ->useLog('auth')
                ->event('login')
                ->log('User logged in');

            $event->user->forceFill([
                'last_login_at' => now(),
                'last_login_ip' => request()->ip(),
            ])->saveQuietly();
        });

        Event::listen(Logout::class, function (Logout $event): void {
            if (! $event->user instanceof User) {
                return;
            }

            activity()
                ->causedBy($event->user)
                ->useLog('auth')
                ->event('logout')
                ->log('User logged out');
        });

        Event::listen(Failed::class, function (Failed $event): void {
            $identifier = $event->credentials['email']
                ?? $event->credentials['username']
                ?? null;

            activity()
                ->causedByAnonymous()
                ->useLog('auth')
                ->event('failed')
                ->withProperties([
                    'identifier' => is_string($identifier) ? $identifier : null,
                ])
                ->log('Failed login attempt');
        });
    }

    /**
     * Configure default behaviors for production-ready applications.
     */
    protected function configureDefaults(): void
    {
        Date::use(CarbonImmutable::class);

        DB::prohibitDestructiveCommands(
            app()->isProduction(),
        );

        Password::defaults(fn (): Password => app(ProjectSettings::class)->passwordRule());
    }
}
