<?php

namespace App\Models;

use App\Enums\ApiKeyFilesScopeEnum;
use App\Enums\ApiKeyScopeEnum;
use App\Enums\CollectionPermissionActionEnum;
use App\Enums\FilePermissionActionEnum;
use App\Traits\LogsApplicationActivityTrait;
use BackedEnum;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;
use Spatie\Activitylog\Support\LogOptions;

/**
 * Project API key authenticated via Bearer token; permissions come from role_id.
 *
 * Optional scopes only narrow the role: collection_slugs allowlist, read_only,
 * and files_scope (none|read|all). Named capability scopes (mcp:read / mcp:write)
 * gate the MCP endpoint. Optional owner_id adds a permission ceiling.
 *
 * @property string $uuid
 * @property string $name
 * @property string $key_prefix
 * @property string $key_hash
 * @property int $role_id
 * @property int|null $owner_id
 * @property list<string>|null $collection_slugs
 * @property bool $read_only
 * @property ApiKeyFilesScopeEnum $files_scope
 * @property list<string>|null $scopes
 * @property list<string>|null $ip_allowlist
 * @property int|null $rate_limit_per_minute
 */
class ApiKey extends Model
{
    use LogsApplicationActivityTrait;

    /**
     * @var list<string>
     */
    protected $fillable = [
        'uuid',
        'name',
        'key_prefix',
        'key_hash',
        'role_id',
        'collection_slugs',
        'read_only',
        'files_scope',
        'scopes',
        'ip_allowlist',
        'rate_limit_per_minute',
        'expires_at',
        'last_used_at',
        'revoked_at',
        'created_by',
        'owner_id',
    ];

    /**
     * @var list<string>
     */
    protected $hidden = [
        'key_hash',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'collection_slugs' => 'array',
            'read_only' => 'boolean',
            'files_scope' => ApiKeyFilesScopeEnum::class,
            'scopes' => 'array',
            'ip_allowlist' => 'array',
            'rate_limit_per_minute' => 'integer',
            'expires_at' => 'datetime',
            'last_used_at' => 'datetime',
            'revoked_at' => 'datetime',
        ];
    }

    /**
     * Whether this key carries a named capability scope (e.g. mcp:read).
     */
    public function hasScope(ApiKeyScopeEnum|string $scope): bool
    {
        $value = $scope instanceof ApiKeyScopeEnum ? $scope->value : $scope;
        $scopes = $this->scopes;

        if (! is_array($scopes) || $scopes === []) {
            return false;
        }

        foreach ($scopes as $entry) {
            if (is_string($entry) && $entry === $value) {
                return true;
            }
        }

        return false;
    }

    /**
     * Whether this key may touch the given collection slug.
     * null collection_slugs = unrestricted (legacy).
     */
    public function allowsCollectionSlug(string $slug): bool
    {
        $slugs = $this->collection_slugs;
        if ($slugs === null) {
            return true;
        }

        /** @var list<string> $normalized */
        $normalized = array_values(array_filter(array_map(
            static fn (mixed $value): string => strtolower(trim((string) $value)),
            $slugs,
        )));

        return in_array(strtolower($slug), $normalized, true);
    }

    /**
     * Whether this key may perform the action (read_only blocks writes).
     *
     * Shared by collection and file public API gates. Read-family actions
     * ({@see CollectionPermissionActionEnum::Read}, {@see FilePermissionActionEnum::Read},
     * {@see FilePermissionActionEnum::ReadPrivate}) remain allowed when read_only.
     * File actions are further gated by {@see self::allowsFileAction()}.
     */
    public function allowsAction(
        CollectionPermissionActionEnum|FilePermissionActionEnum|string $action,
    ): bool {
        if ($action instanceof FilePermissionActionEnum
            || (is_string($action) && in_array($action, FilePermissionActionEnum::values(), true))) {
            return $this->allowsFileAction(
                $action instanceof FilePermissionActionEnum
                    ? $action
                    : FilePermissionActionEnum::from($action),
            );
        }

        if (! $this->read_only) {
            return true;
        }

        $value = $action instanceof BackedEnum
            ? $action->value
            : $action;

        return $value === CollectionPermissionActionEnum::Read->value;
    }

    /**
     * File ACL for this key: files_scope ∩ read_only.
     *
     * - none: deny all file actions
     * - read: Read / ReadPrivate only
     * - all: full file actions subject to read_only
     */
    public function allowsFileAction(FilePermissionActionEnum|string $action): bool
    {
        $scope = $this->files_scope instanceof ApiKeyFilesScopeEnum
            ? $this->files_scope
            : ApiKeyFilesScopeEnum::All;

        if ($scope === ApiKeyFilesScopeEnum::None) {
            return false;
        }

        $value = $action instanceof BackedEnum
            ? $action->value
            : $action;

        $isReadFamily = in_array($value, [
            FilePermissionActionEnum::Read->value,
            FilePermissionActionEnum::ReadPrivate->value,
        ], true);

        if ($scope === ApiKeyFilesScopeEnum::Read) {
            return $isReadFamily;
        }

        // all
        if (! $this->read_only) {
            return true;
        }

        return $isReadFamily;
    }

    public function canReadFiles(): bool
    {
        return $this->allowsFileAction(FilePermissionActionEnum::Read);
    }

    public function getActivitylogOptions(): LogOptions
    {
        return $this->applicationActivityLogOptions()
            ->logExcept(['key_hash']);
    }

    protected static function booted(): void
    {
        static::creating(function (ApiKey $key): void {
            if ($key->uuid === null || $key->uuid === '') {
                $key->uuid = (string) Str::uuid();
            }
        });
    }

    /**
     * @return BelongsTo<Role, $this>
     */
    public function role(): BelongsTo
    {
        return $this->belongsTo(Role::class);
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /**
     * Permission-ceiling owner (MCP requires this for key-based auth — see #121).
     *
     * @return BelongsTo<User, $this>
     */
    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'owner_id');
    }

    /**
     * Whether this key has an owner binding (MCP rejects ownerless keys).
     */
    public function hasOwner(): bool
    {
        return $this->owner_id !== null;
    }

    public function isRevoked(): bool
    {
        return $this->revoked_at !== null;
    }

    public function isExpired(): bool
    {
        return $this->expires_at !== null && $this->expires_at->isPast();
    }

    public function isActive(): bool
    {
        return ! $this->isRevoked() && ! $this->isExpired();
    }

    /**
     * @param  list<string>|null  $allowlist
     */
    public function allowsIp(string $ip): bool
    {
        $allowlist = $this->ip_allowlist;
        if ($allowlist === null || $allowlist === []) {
            return true;
        }

        foreach ($allowlist as $entry) {
            if (! is_string($entry) || $entry === '') {
                continue;
            }

            if (str_contains($entry, '/')) {
                if ($this->ipInCidr($ip, $entry)) {
                    return true;
                }

                continue;
            }

            if ($ip === $entry) {
                return true;
            }
        }

        return false;
    }

    private function ipInCidr(string $ip, string $cidr): bool
    {
        [$subnet, $mask] = array_pad(explode('/', $cidr, 2), 2, null);
        if ($subnet === null || $mask === null || ! is_numeric($mask)) {
            return false;
        }

        $ipLong = ip2long($ip);
        $subnetLong = ip2long($subnet);
        if ($ipLong === false || $subnetLong === false) {
            return false;
        }

        $mask = (int) $mask;
        if ($mask < 0 || $mask > 32) {
            return false;
        }

        $maskLong = $mask === 0 ? 0 : (-1 << (32 - $mask));

        return ($ipLong & $maskLong) === ($subnetLong & $maskLong);
    }

    /**
     * @return array{plain: string, prefix: string, hash: string}
     */
    public static function generateSecret(): array
    {
        $plain = 'ek_'.Str::random(40);
        $prefix = substr($plain, 0, 12);

        return [
            'plain' => $plain,
            'prefix' => $prefix,
            'hash' => hash('sha256', $plain),
        ];
    }

    public static function hashSecret(string $plain): string
    {
        return hash('sha256', $plain);
    }
}
