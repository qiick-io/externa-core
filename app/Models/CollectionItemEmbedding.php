<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Stored embedding vector for a collection item (JSON float array).
 *
 * @property list<float>|array<int, float> $vector
 */
class CollectionItemEmbedding extends Model
{
    protected $fillable = [
        'collection_item_id',
        'provider',
        'model',
        'vector',
        'content_hash',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'vector' => 'array',
        ];
    }

    /**
     * @return BelongsTo<CollectionItem, $this>
     */
    public function item(): BelongsTo
    {
        return $this->belongsTo(CollectionItem::class, 'collection_item_id');
    }
}
