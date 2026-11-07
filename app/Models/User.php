<?php

namespace App\Models;

use App\Services\Api\ApiKeyOwnerService;
use App\Traits\LogsApplicationActivityTrait;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Ai\Concerns\HasConversations;
use Laravel\Fortify\Contracts\PasskeyUser;
use Laravel\Fortify\PasskeyAuthenticatable;
use Laravel\Fortify\TwoFactorAuthenticatable;
use Spatie\Activitylog\Support\LogOptions;
use Spatie\Permission\Traits\HasRoles;

#[Fillable([
    'is_active',
    'first_name',
    'last_name',
    'username',
    'email',
    'oidc_sub',
    'phone',
    'locale',
    'timezone',
    'last_login_at',
    'last_login_ip',
    'password',
])]
#[Hidden(['password', 'two_factor_secret', 'two_factor_recovery_codes', 'remember_token'])]
/**
 * Authenticated application user with roles, groups, soft deletes, and AI conversations.
 */
class User extends Authenticatable implements PasskeyUser
{
    /** @use HasFactory<UserFactory> */
    use HasConversations, HasFactory, HasRoles, LogsApplicationActivityTrait, Notifiable, PasskeyAuthenticatable, SoftDeletes, TwoFactorAuthenticatable;

    /**
     * Activity log options excluding sensitive credential fields.
     */
    public function getActivitylogOptions(): LogOptions
    {
        return $this->applicationActivityLogOptions()
            ->logExcept(['password', 'two_factor_secret', 'two_factor_recovery_codes', 'remember_token']);
    }

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'two_factor_confirmed_at' => 'datetime',
            'last_login_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        static::updated(function (User $user): void {
            if ($user->wasChanged('is_active') && $user->is_active === false) {
                app(ApiKeyOwnerService::class)->revokeForOwner($user, 'deactivated');
            }
        });

        static::deleted(function (User $user): void {
            app(ApiKeyOwnerService::class)->revokeForOwner($user, 'deleted');
        });

        // Before row removal: owner_id is nullOnDelete, so revoke must run first.
        static::forceDeleting(function (User $user): void {
            app(ApiKeyOwnerService::class)->revokeForOwner($user, 'deleted');
        });
    }

    /**
     * @return BelongsToMany<UserGroup, $this>
     */
    public function groups(): BelongsToMany
    {
        return $this->belongsToMany(UserGroup::class, 'user_group_user')
            ->using(UserGroupUser::class)
            ->withTimestamps();
    }

    /**
     * @return HasMany<ApiKey, $this>
     */
    public function ownedApiKeys(): HasMany
    {
        return $this->hasMany(ApiKey::class, 'owner_id');
    }

    /**
     * Full display name composed from first and last name.
     */
    public function getNameAttribute(): string
    {
        return trim("{$this->first_name} {$this->last_name}");
    }

    /**
     * Resolve route binding including soft-deleted users.
     *
     * @param  mixed  $value
     * @param  string|null  $field
     */
    public function resolveRouteBinding($value, $field = null): ?self
    {
        return $this->withTrashed()
            ->where($field ?? $this->getRouteKeyName(), $value)
            ->firstOrFail();
    }
}
