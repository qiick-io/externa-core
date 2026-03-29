<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property-read int $id
 * @property int $item_id
 * @property int $field_id
 * @property string|null $locale
 * @property int $position
 * @property mixed $value
 */
class CollectionItemValue extends Model
{
    protected $table = 'collections_items_values';

    protected $fillable = [
        'item_id',
        'field_id',
        'locale',
        'position',
        'value',
    ];

    /**
     * @return BelongsTo<CollectionItem, $this>
     */
    public function item(): BelongsTo
    {
        return $this->belongsTo(CollectionItem::class);
    }

    /**
     * @return BelongsTo<CollectionField, $this>
     */
    public function field(): BelongsTo
    {
        return $this->belongsTo(CollectionField::class);
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'value' => 'json',
        ];
    }
}
