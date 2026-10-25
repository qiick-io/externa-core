<?php

namespace App\Models;

use App\Concerns\LogsApplicationActivity;
use App\Enums\RoleEnum;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Spatie\Permission\Models\Role as SpatieRole;

/**
 * Application role with system/assignable flags for CMS API access.
 *
 * @property bool $is_system
 * @property bool $is_assignable
 */
class Role extends SpatieRole
{
    use LogsApplicationActivity;

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            ...parent::casts(),
            'is_system' => 'boolean',
            'is_assignable' => 'boolean',
        ];
    }

    public function isPublic(): bool
    {
        return $this->name === RoleEnum::Public->value;
    }

    public function isLockedSystemRole(): bool
    {
        return (bool) $this->is_system || $this->isPublic();
    }

    /**
     * @return HasMany<CollectionPermission, $this>
     */
    public function collectionPermissions(): HasMany
    {
        return $this->hasMany(CollectionPermission::class);
    }

    /**
     * @return HasMany<FilePermission, $this>
     */
    public function filePermissions(): HasMany
    {
        return $this->hasMany(FilePermission::class);
    }

    /**
     * @return HasMany<ApiKey, $this>
     */
    public function apiKeys(): HasMany
    {
        return $this->hasMany(ApiKey::class);
    }
}
