<?php

namespace App\Models;

use App\Concerns\LogsApplicationActivity;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;
use Spatie\Activitylog\Support\LogOptions;

/**
 * Project API key authenticated via Bearer token; permissions come from role_id.
 *
 * @property string $uuid
 * @property string $name
 * @property string $key_prefix
 * @property string $key_hash
 * @property int $role_id
 * @property list<string>|null $ip_allowlist
 * @property int|null $rate_limit_per_minute
 */
class ApiKey extends Model
{
    use LogsApplicationActivity;

    /**
     * @var list<string>
     */
    protected $fillable = [
        'uuid',
        'name',
        'key_prefix',
        'key_hash',
        'role_id',
        'ip_allowlist',
        'rate_limit_per_minute',
        'expires_at',
        'last_used_at',
        'revoked_at',
        'created_by',
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
            'ip_allowlist' => 'array',
            'rate_limit_per_minute' => 'integer',
            'expires_at' => 'datetime',
            'last_used_at' => 'datetime',
            'revoked_at' => 'datetime',
        ];
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
