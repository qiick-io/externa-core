<?php

namespace App\Models;

use App\Enums\FilePermissionAction;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Global file CRUD grant for a role (absence of row = deny).
 *
 * @property int $role_id
 * @property string $action
 * @property bool $allowed
 */
class FilePermission extends Model
{
    /**
     * @var list<string>
     */
    protected $fillable = [
        'role_id',
        'action',
        'allowed',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'allowed' => 'boolean',
            'action' => FilePermissionAction::class,
        ];
    }

    /**
     * @return BelongsTo<Role, $this>
     */
    public function role(): BelongsTo
    {
        return $this->belongsTo(Role::class);
    }
}
