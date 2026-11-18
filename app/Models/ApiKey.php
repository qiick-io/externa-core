<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\ApiKeyScopeEnum;
use App\Enums\CollectionPermissionActionEnum;
use App\Enums\FilePermissionActionEnum;
use App\Services\Api\CollectionPermissionEnforcerService;
use App\Traits\LogsApplicationActivityTrait;
use Database\Factories\ApiKeyFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;
use Spatie\Activitylog\Support\LogOptions;

/**
 * Project API key authenticated via Bearer token; permissions come from role_id.
 *
 * What the key may do is the role, narrowed by its `scopes` (`<resource>:<read|write>`, see
 * {@see ApiKeyScopeEnum}) and by the optional `collection_slugs` allowlist, and capped by its
 * owner's own permissions. The token is `ext_<live|test>_<id><secret>`: `key_prefix` holds the
 * public `ext_<env>_<id>` part, `key_hash` the SHA-256 of the full token. Keys issued before
 * 1.5.0 keep their `ek_<40 characters>` token, with its first 12 characters as `key_prefix`.
 *
 * @property int $id
 * @property string $uuid
 * @property string $name
 * @property string $key_prefix
 * @property string $key_hash
 * @property string|null $previous_key_hash
 * @property Carbon|null $previous_key_valid_until
 * @property int $role_id
 * @property int|null $owner_id
 * @property int|null $created_by
 * @property list<string>|null $collection_slugs
 * @property list<string>|null $scopes
 * @property list<string>|null $ip_allowlist
 * @property int|null $rate_limit_per_minute
 * @property Carbon|null $expires_at
 * @property Carbon|null $last_used_at
 * @property string|null $last_used_ip
 * @property Carbon|null $revoked_at
 */
class ApiKey extends Model
{
    /** @use HasFactory<ApiKeyFactory> */
    use HasFactory;

    use LogsApplicationActivityTrait;

    /** Product marker of every token this app issues (fleet: `ext`, `exc`, `ins`, `sig`). */
    public const string TOKEN_PRODUCT_PREFIX = 'ext';

    /**
     * Current token shape, for secret scanners too:
     * `ext_<live|test>_` + 8-character public id + at least 32-character secret, base62.
     */
    public const string TOKEN_PATTERN = '/^(?<prefix>ext_(?:live|test)_[A-Za-z0-9]{8})[A-Za-z0-9]{32,}$/D';

    /** Tokens issued before 1.5.0: `ek_` + 40 characters, the first 12 of the token as prefix. */
    public const string LEGACY_TOKEN_PATTERN = '/^(?<prefix>ek_[A-Za-z0-9]{9})[A-Za-z0-9]{31}$/D';

    private const string LEGACY_TOKEN_PRODUCT_PREFIX = 'ek_';

    private const int LEGACY_TOKEN_LENGTH = 43;

    private const int TOKEN_ID_LENGTH = 8;

    private const int TOKEN_SECRET_LENGTH = 32;

    /**
     * @var list<string>
     */
    protected $fillable = [
        'uuid',
        'name',
        'key_prefix',
        'key_hash',
        'previous_key_hash',
        'previous_key_valid_until',
        'role_id',
        'collection_slugs',
        'scopes',
        'ip_allowlist',
        'rate_limit_per_minute',
        'expires_at',
        'last_used_at',
        'last_used_ip',
        'revoked_at',
        'created_by',
        'owner_id',
    ];

    /**
     * @var list<string>
     */
    protected $hidden = [
        'key_hash',
        'previous_key_hash',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'collection_slugs' => 'array',
            'scopes' => 'array',
            'ip_allowlist' => 'array',
            'rate_limit_per_minute' => 'integer',
            'expires_at' => 'datetime',
            'previous_key_valid_until' => 'datetime',
            'last_used_at' => 'datetime',
            'revoked_at' => 'datetime',
        ];
    }

    /**
     * The scopes this key holds, one per resource. Fails closed: a stored value that does not
     * parse as a list of known scopes yields none ({@see ApiKeyScopeEnum::parseStored()}).
     *
     * @return list<ApiKeyScopeEnum>
     */
    public function grantedScopes(): array
    {
        return ApiKeyScopeEnum::highestPerResource(ApiKeyScopeEnum::parseStored($this->scopes));
    }

    /**
     * Whether this key passes a check for the required scope (`write` satisfies `read`).
     */
    public function hasScope(ApiKeyScopeEnum $requiredScope): bool
    {
        foreach ($this->grantedScopes() as $grantedScope) {
            if ($grantedScope->satisfies($requiredScope)) {
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
     * Whether this key's scopes allow the collection action: `collections:read` for reading
     * items, `collections:write` for everything else. The role and the owner ceiling are
     * checked elsewhere ({@see CollectionPermissionEnforcerService}).
     */
    public function allowsCollectionAction(CollectionPermissionActionEnum $action): bool
    {
        return $this->hasScope(ApiKeyScopeEnum::forCollectionAction($action));
    }

    /**
     * Whether this key's scopes allow the file action: `files:read` for `read` and
     * `read_private`, `files:write` for everything else.
     */
    public function allowsFileAction(FilePermissionActionEnum $action): bool
    {
        return $this->hasScope(ApiKeyScopeEnum::forFileAction($action));
    }

    public function canReadFiles(): bool
    {
        return $this->allowsFileAction(FilePermissionActionEnum::Read);
    }

    public function getActivitylogOptions(): LogOptions
    {
        return $this->applicationActivityLogOptions()
            ->logExcept(['key_hash', 'previous_key_hash']);
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
     * Whether the secret replaced by the last rotation still authenticates (grace window).
     */
    public function isPreviousSecretValid(): bool
    {
        return $this->previous_key_hash !== null
            && $this->previous_key_valid_until !== null
            && $this->previous_key_valid_until->isFuture();
    }

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
     * Issue a new token: `ext_<live|test>_<id><secret>`, the 8-character public id and the
     * 32-character secret drawn independently from the CSPRNG (`Str::random` reads
     * `random_bytes`), about 190 bits in the secret alone. `prefix` is the public part stored in
     * `key_prefix`; `hash` is the SHA-256 of the full token. The plain token is returned once and
     * never stored.
     *
     * @return array{plain: string, prefix: string, hash: string}
     */
    public static function generateSecret(): array
    {
        $environment = app()->isProduction() ? 'live' : 'test';

        return self::generateSecretWithPrefix(
            sprintf('%s_%s_%s', self::TOKEN_PRODUCT_PREFIX, $environment, Str::random(self::TOKEN_ID_LENGTH)),
        );
    }

    /**
     * Issue a new secret behind an existing public prefix (rotation keeps `key_prefix`). A key
     * issued before 1.5.0 keeps its `ek_` shape, since its prefix is the first 12 characters of
     * that token.
     *
     * @return array{plain: string, prefix: string, hash: string}
     */
    public static function generateSecretWithPrefix(string $keyPrefix): array
    {
        $secretLength = str_starts_with($keyPrefix, self::LEGACY_TOKEN_PRODUCT_PREFIX)
            ? self::LEGACY_TOKEN_LENGTH - strlen($keyPrefix)
            : self::TOKEN_SECRET_LENGTH;
        $plain = $keyPrefix.Str::random($secretLength);

        return [
            'plain' => $plain,
            'prefix' => $keyPrefix,
            'hash' => self::hashSecret($plain),
        ];
    }

    /**
     * SHA-256 of the full presented token. A fast unsalted digest is right for a high-entropy
     * random token: it allows the per-request comparison that a password hash would make slow.
     */
    public static function hashSecret(string $plain): string
    {
        return hash('sha256', $plain);
    }

    /**
     * The public `key_prefix` a presented token is looked up by, or null when the token has
     * neither the current nor the legacy shape (such a token matches no key).
     */
    public static function publicPrefixOf(string $presentedToken): ?string
    {
        foreach ([self::TOKEN_PATTERN, self::LEGACY_TOKEN_PATTERN] as $tokenPattern) {
            if (preg_match($tokenPattern, $presentedToken, $tokenParts) === 1) {
                return $tokenParts['prefix'];
            }
        }

        return null;
    }
}
