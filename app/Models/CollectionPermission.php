<?php

namespace App\Models;

use App\Enums\CollectionPermissionAction;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Per-collection CRUD grant for a role (absence of row = deny).
 *
 * @property int $role_id
 * @property int $collection_id
 * @property string $action
 * @property bool $allowed
 * @property array<string, mixed>|null $rules
 */
class CollectionPermission extends Model
{
    /**
     * @var list<string>
     */
    protected $fillable = [
        'role_id',
        'collection_id',
        'action',
        'allowed',
        'rules',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'allowed' => 'boolean',
            'rules' => 'array',
            'action' => CollectionPermissionAction::class,
        ];
    }

    /**
     * @return BelongsTo<Role, $this>
     */
    public function role(): BelongsTo
    {
        return $this->belongsTo(Role::class);
    }

    /**
     * @return BelongsTo<Collection, $this>
     */
    public function collection(): BelongsTo
    {
        return $this->belongsTo(Collection::class);
    }
}
