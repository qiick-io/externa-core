<?php

declare(strict_types=1);

namespace App\Providers;

use App\Listeners\AddQueueJobLogContextListener;
use App\Listeners\Ai\LogAiToolApprovalEventsListener;
use App\Models\ApiKey;
use App\Models\User;
use App\Policies\AiConversationPolicy;
use App\Services\Ai\AiToolApprovalService;
use App\Services\Ai\AiToolArgumentRedactorService;
use App\Services\Ai\AiToolExecutorService;
use App\Services\Ai\AiToolRegistryService;
use App\Services\Ai\AiToolWriteGateService;
use App\Services\Authorization\EffectivePermissionResolverService;
use App\Services\Settings\ProjectSettingsService;
use App\Support\Authorization\RequestActorResolver;
use App\Support\Http\CurlSseStreamer;
use Carbon\CarbonImmutable;
use Illuminate\Auth\Events\Failed;
use Illuminate\Auth\Events\Login;
use Illuminate\Auth\Events\Logout;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Queue\Events\JobExceptionOccurred;
use Illuminate\Queue\Events\JobFailed;
use Illuminate\Queue\Events\JobProcessed;
use Illuminate\Queue\Events\JobProcessing;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Illuminate\Validation\Rules\Password;
use Laravel\Ai\Events\ToolApprovalRequested;
use Laravel\Ai\Events\ToolApprovalResolved;
use Laravel\Ai\Models\Conversation;
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
        $this->app->singleton(EffectivePermissionResolverService::class);
        $this->app->singleton(ProjectSettingsService::class);
        $this->app->singleton(AiToolArgumentRedactorService::class);
        $this->app->singleton(AiToolWriteGateService::class);
        $this->app->singleton(AiToolApprovalService::class);
        $this->app->singleton(AiToolRegistryService::class);
        $this->app->singleton(AiToolExecutorService::class);
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
        $this->registerAiToolApprovalListeners();
        $this->registerQueueJobLogContextListeners();
        $this->configureHttpClientStreaming();
    }

    /**
     * Job class and attempt for the `structured` log channel (#209). Registered after the
     * framework's Context hydration listener, which must run first on JobProcessing.
     */
    protected function registerQueueJobLogContextListeners(): void
    {
        $listener = AddQueueJobLogContextListener::class;

        Event::listen(JobProcessing::class, [$listener, 'handleProcessing']);
        Event::listen(JobProcessed::class, [$listener, 'handleFinished']);
        Event::listen(JobFailed::class, [$listener, 'handleFinished']);
        Event::listen(JobExceptionOccurred::class, [$listener, 'handleFinished']);
    }

    protected function configureRateLimiting(): void
    {
        RateLimiter::for('api', function (Request $request) {
            $key = $request->user()?->id ?: $request->ip();

            return Limit::perMinute(60)->by((string) $key);
        });

        RateLimiter::for('mcp', function (Request $request) {
            $apiKey = $request->attributes->get('mcp_api_key');
            $perMinute = (int) config('ai.mcp.rate_limit_per_minute', 60);

            if ($apiKey instanceof ApiKey) {
                $perMinute = $apiKey->rate_limit_per_minute ?? $perMinute;

                return Limit::perMinute(max(1, $perMinute))->by('mcp-key:'.$apiKey->id);
            }

            $userId = $request->user()?->getAuthIdentifier();

            return Limit::perMinute(max(1, $perMinute))->by(
                $userId !== null ? 'mcp-user:'.$userId : 'mcp-ip:'.$request->ip(),
            );
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
        // laravel/ai's model is outside App\Models, so policy auto-discovery cannot find it.
        Gate::policy(Conversation::class, AiConversationPolicy::class);

        // Super-admin bypass for permission-name and string abilities only. Model policies
        // decide for themselves (they keep invariants that bind super-admins too), and API
        // actors never bypass: an MCP key owned by a super-admin keeps its key scopes.
        Gate::before(function (?User $user, string $ability, array $arguments): ?bool {
            if ($user === null) {
                return null;
            }

            if (app(RequestActorResolver::class)->hasApiAccess()) {
                return null;
            }

            if ($arguments !== [] && Gate::getPolicyFor($arguments[0]) !== null) {
                return null;
            }

            if (app(EffectivePermissionResolverService::class)->isSuperAdmin($user)) {
                return true;
            }

            return null;
        });

        Gate::define('viewPulse', function (?User $user = null): bool {
            if ($user === null) {
                return false;
            }

            return app(EffectivePermissionResolverService::class)->isSuperAdmin($user);
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

    protected function registerAiToolApprovalListeners(): void
    {
        $listener = LogAiToolApprovalEventsListener::class;

        Event::listen(ToolApprovalRequested::class, [$listener, 'handleRequested']);
        Event::listen(ToolApprovalResolved::class, [$listener, 'handleResolved']);
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

        // Lazy loading, silently discarded and missing attributes throw outside
        // production, so tests catch them (qiick standards, Automated checks).
        Model::shouldBeStrict(! app()->isProduction());

        Password::defaults(fn (): Password => app(ProjectSettingsService::class)->passwordRule());
    }
}
