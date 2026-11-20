<?php

namespace App\Models;

use App\Services\Api\ApiKeyOwnerService;
use App\Services\Api\UserRelationColumnService;
use App\Traits\LogsApplicationActivityTrait;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Str;
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
 *
 * `public_id` is the UUID v7 exposed outside the database (REST MiniUser, GraphQL); the
 * primary key stays bigint and admin/Inertia routes may keep using it (#827).
 *
 * @property string $public_id
 */
class User extends Authenticatable implements PasskeyUser
{
    /** @use HasFactory<UserFactory> */
    use HasConversations, HasFactory, HasRoles, HasUuids, LogsApplicationActivityTrait, Notifiable, PasskeyAuthenticatable, SoftDeletes, TwoFactorAuthenticatable;

    /**
     * The column defaults a freshly created user does not read back from the
     * database (same values as the users migrations): strict models throw on a
     * missing attribute.
     *
     * @var array<string, mixed>
     */
    protected $attributes = [
        'is_active' => true,
        'last_name' => null,
        'username' => null,
        'oidc_sub' => null,
        'email_verified_at' => null,
        'phone' => null,
        'locale' => 'en',
        'timezone' => 'UTC',
        'last_login_at' => null,
        'last_login_ip' => null,
        'two_factor_secret' => null,
        'two_factor_recovery_codes' => null,
        'two_factor_confirmed_at' => null,
    ];

    /**
     * Only `public_id` is a generated UUID; the primary key stays an auto-increment id.
     *
     * Empty during the deploy window before the column exists so HasUuids does not write it.
     *
     * @return list<string>
     */
    public function uniqueIds(): array
    {
        if (! app(UserRelationColumnService::class)->hasPublicIdColumn()) {
            return [];
        }

        return ['public_id'];
    }

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
     * @return BelongsToMany<UserGroup, $this, UserGroupUser>
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
     * Accepts the bigint primary key (admin / Inertia) or `public_id` when the value is a UUID
     * (public API clients migrating off the integer id).
     *
     * @param  mixed  $value
     * @param  string|null  $field
     */
    public function resolveRouteBinding($value, $field = null): ?self
    {
        if ($field !== null) {
            return $this->withTrashed()
                ->where($field, $value)
                ->firstOrFail();
        }

        if (is_string($value) && Str::isUuid($value)) {
            return $this->withTrashed()
                ->where('public_id', $value)
                ->firstOrFail();
        }

        return $this->withTrashed()
            ->where($this->getRouteKeyName(), $value)
            ->firstOrFail();
    }
}
