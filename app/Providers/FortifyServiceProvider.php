<?php

declare(strict_types=1);

namespace App\Providers;

use App\Actions\Fortify\CreateNewUser;
use App\Actions\Fortify\ResetUserPassword;
use App\Http\Responses\LoginResponse;
use App\Http\Responses\LogoutResponse;
use App\Http\Responses\PasskeyLoginResponse;
use App\Models\User;
use App\Services\Settings\ProjectSettingsService;
use Illuminate\Auth\Events\Logout as LogoutEvent;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Str;
use Illuminate\Support\Timebox;
use Inertia\Inertia;
use Laravel\Fortify\Contracts\LoginResponse as LoginResponseContract;
use Laravel\Fortify\Contracts\LogoutResponse as LogoutResponseContract;
use Laravel\Fortify\Features;
use Laravel\Fortify\Fortify;
use Laravel\Passkeys\Contracts\PasskeyLoginResponse as PasskeyLoginResponseContract;
use Laravel\Passkeys\Passkeys;
use Qiick\Oidc\Services\RpInitiatedLogoutService;
use Qiick\Oidc\Services\SsoOnlyModeService;

/**
 * Registers Fortify views, actions, and authentication rate limiting.
 */
class FortifyServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->app->singleton(LoginResponseContract::class, LoginResponse::class);
        $this->app->singleton(LogoutResponseContract::class, LogoutResponse::class);
        $this->app->singleton(PasskeyLoginResponseContract::class, PasskeyLoginResponse::class);
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        $this->configureActions();
        $this->configureViews();
        $this->configureRateLimiting();
    }

    /**
     * Configure Fortify actions.
     */
    private function configureActions(): void
    {
        Fortify::resetUserPasswordsUsing(ResetUserPassword::class);
        Fortify::createUsersUsing(CreateNewUser::class);

        // Fortify and passkeys bypass Auth::attempt(), so the package's EnforceSsoOnlyListener
        // never sees them: refuse local login here when SSO-only mode is on (except break-glass).
        // Timebox + rehash mirror SessionGuard::attempt so timing and password upgrades stay equal.
        Fortify::authenticateUsing(function (Request $request): ?User {
            return (new Timebox)->call(function (Timebox $timebox) use ($request): ?User {
                $user = User::query()->where(Fortify::username(), $request->input(Fortify::username()))->first();
                $password = (string) $request->input('password');

                if ($user === null || $user->password === null || ! Hash::check($password, $user->password)) {
                    return null;
                }

                if (! $user->is_active || ! app(SsoOnlyModeService::class)->canUseLocalLogin($user)) {
                    return null;
                }

                // Password break-glass under active SSO-only needs confirmed TOTP. A
                // passkey-only super-admin may use the passkey, not the password form.
                // Use isActive() (SSO configured AND only-mode), never the bare setting:
                // a saved oidc_only with SSO off must not lock every password user out.
                if (app(SsoOnlyModeService::class)->isActive()
                    && ! $user->hasEnabledTwoFactorAuthentication()) {
                    return null;
                }

                Auth::getProvider()->rehashPasswordIfRequired($user, ['password' => $password]);

                $timebox->returnEarly();

                return $user;
            }, 200000);
        });

        Passkeys::authorizeLoginUsing(
            fn (Request $request, $user): bool => $user instanceof User
                && $user->is_active
                && app(SsoOnlyModeService::class)->canUseLocalLogin($user),
        );
    }

    /**
     * Configure Fortify views.
     */
    private function configureViews(): void
    {
        Fortify::loginView(function (Request $request) {
            $securitySettings = app(ProjectSettingsService::class)->security();
            $oidcLoginOptions = app(SsoOnlyModeService::class)->loginOptions($request);

            return Inertia::render('auth/login', [
                'canResetPassword' => Features::enabled(Features::resetPasswords()),
                'canRegister' => Features::enabled(Features::registration())
                    && $securitySettings->isRegistrationEnabled()
                    && $oidcLoginOptions->isPasswordLoginVisible
                    && ! $oidcLoginOptions->isSsoOnly,
                'canManagePasskeys' => Features::canManagePasskeys()
                    && $oidcLoginOptions->isPasswordLoginVisible,
                'canUseOidc' => $oidcLoginOptions->isSsoAvailable,
                'oidcButtonLabel' => $oidcLoginOptions->buttonLabel,
                'oidcRedirectUrl' => $oidcLoginOptions->redirectUrl,
                'isPasswordLoginVisible' => $oidcLoginOptions->isPasswordLoginVisible,
                'status' => $request->session()->get('status'),
            ]);
        });

        Fortify::resetPasswordView(fn (Request $request) => Inertia::render('auth/reset-password', [
            'email' => $request->email,
            'token' => $request->route('token'),
        ]));

        Fortify::requestPasswordResetLinkView(fn (Request $request) => Inertia::render('auth/forgot-password', [
            'status' => $request->session()->get('status'),
        ]));

        Fortify::verifyEmailView(fn (Request $request) => Inertia::render('auth/verify-email', [
            'status' => $request->session()->get('status'),
        ]));

        Fortify::registerView(function () {
            $securitySettings = app(ProjectSettingsService::class)->security();

            if (! Features::enabled(Features::registration())
                || ! $securitySettings->isRegistrationEnabled()
                || app(SsoOnlyModeService::class)->isActive()) {
                abort(403);
            }

            return Inertia::render('auth/register');
        });

        Fortify::twoFactorChallengeView(fn () => Inertia::render('auth/two-factor-challenge'));

        Fortify::confirmPasswordView(function () {
            $canManagePasskeys = Features::canManagePasskeys();
            $user = auth()->user();

            return Inertia::render('auth/confirm-password', [
                'canManagePasskeys' => $canManagePasskeys,
                'hasPasskeys' => $canManagePasskeys
                    && $user !== null
                    && $user->hasPasskeysEnabled(),
            ]);
        });

        $this->captureRpInitiatedLogoutUrl();
    }

    /**
     * Read the IdP end-session URL while the session still holds the SSO identity, then hand it
     * to {@see LogoutResponse} after Fortify invalidates the session.
     */
    private function captureRpInitiatedLogoutUrl(): void
    {
        Event::listen(LogoutEvent::class, function (): void {
            $request = request();

            if (! $request->hasSession()) {
                return;
            }

            try {
                $endSessionUrl = app(RpInitiatedLogoutService::class)->endSessionUrl($request->session());
            } catch (\Throwable) {
                return;
            }

            if (is_string($endSessionUrl) && $endSessionUrl !== '') {
                $request->attributes->set(LogoutResponse::END_SESSION_ATTRIBUTE, $endSessionUrl);
            }
        });
    }

    /**
     * Configure rate limiting.
     */
    private function configureRateLimiting(): void
    {
        RateLimiter::for('two-factor', function (Request $request) {
            return Limit::perMinute(5)->by($request->session()->get('login.id'));
        });

        RateLimiter::for('login', function (Request $request) {
            $throttleKey = Str::transliterate(Str::lower($request->input(Fortify::username())).'|'.$request->ip());
            $maxAttempts = app(ProjectSettingsService::class)->security()->loginMaxAttempts();

            return Limit::perMinute($maxAttempts)->by($throttleKey);
        });

        // Key on IP only — client-supplied credential ids must not partition the bucket (#272).
        RateLimiter::for('passkeys', function (Request $request) {
            return Limit::perMinute(10)->by((string) $request->ip());
        });

        RateLimiter::for('auth-sensitive', function (Request $request) {
            return Limit::perMinute(5)->by((string) $request->ip());
        });
    }
}
