<?php

namespace App\Providers;

use App\Models\User;
use App\Services\Authorization\EffectivePermissionResolver;
use Illuminate\Support\Facades\Gate;
use Laravel\Horizon\HorizonApplicationServiceProvider;

class HorizonServiceProvider extends HorizonApplicationServiceProvider
{
    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        parent::boot();
    }

    /**
     * Register the Horizon gate (super-admin via Gate::before + explicit check).
     */
    protected function gate(): void
    {
        Gate::define('viewHorizon', function (?User $user = null): bool {
            if ($user === null) {
                return false;
            }

            return app(EffectivePermissionResolver::class)->isSuperAdmin($user);
        });
    }
}
