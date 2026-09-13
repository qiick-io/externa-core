<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Snapshot of a collection item's field data after create/update.
 *
 * @property int $item_id
 * @property int|null $user_id
 * @property array<string, mixed> $data
 * @property array<string, mixed>|null $meta
 */
class CollectionItemRevision extends Model
{
    public $timestamps = false;

    protected $table = 'collection_item_revisions';

    protected $fillable = [
        'item_id',
        'user_id',
        'data',
        'meta',
        'created_at',
    ];

    protected function casts(): array
    {
        return [
            'data' => 'array',
            'meta' => 'array',
            'created_at' => 'datetime',
        ];
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(CollectionItem::class, 'item_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
