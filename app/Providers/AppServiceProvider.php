<?php

namespace App\Providers;

use App\Models\User;
use App\Services\Authorization\EffectivePermissionResolver;
use Carbon\CarbonImmutable;
use Illuminate\Auth\Events\Failed;
use Illuminate\Auth\Events\Login;
use Illuminate\Auth\Events\Logout;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\ServiceProvider;
use Illuminate\Validation\Rules\Password;
use Spatie\Activitylog\Facades\Activity;

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
        $this->configureActivityLogging();
        $this->registerAuthActivityListeners();
        $this->configureHttpClientStreaming();
    }

    /**
     * Herd PHP-FPM + Guzzle `stream => true` returns HTTP 200 with a 0-byte body for
     * LM Studio SSE. Buffer the full SSE payload instead; laravel/ai can still parse
     * events from the in-memory body (tokens arrive in a burst after each upstream step).
     */
    protected function configureHttpClientStreaming(): void
    {
        // ponytail: Guzzle stream:true under fpm-fcgi yields empty bodies; drop the option so
        // API stream:true responses buffer as a normal body. Swap for a WRITEFUNCTION curl
        // handler if true token-by-token passthrough is required.
        Http::globalMiddleware(function (callable $handler): callable {
            return function ($request, array $options) use ($handler) {
                if (($options['stream'] ?? false) === true) {
                    unset($options['stream']);
                }

                return $handler($request, $options);
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

        Password::defaults(fn (): ?Password => app()->isProduction()
            ? Password::min(12)
                ->mixedCase()
                ->letters()
                ->numbers()
                ->symbols()
                ->uncompromised()
            : null,
        );
    }
}
