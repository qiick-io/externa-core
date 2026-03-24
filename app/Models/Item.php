<?php

namespace App\Models;

use App\Support\Cms\ItemDataAccessor;
use Database\Factories\ItemFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property-read int $id
 * @property int $collection_id
 * @property array<string, mixed> $data
 */
class Item extends Model
{
    /** @use HasFactory<ItemFactory> */
    use HasFactory;

    protected $fillable = [
        'collection_id',
        'data',
    ];

    /**
     * @return BelongsTo<ContentCollection, $this>
     */
    public function collection(): BelongsTo
    {
        return $this->belongsTo(ContentCollection::class, 'collection_id');
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'data' => 'array',
        ];
    }

    public function getTranslated(string $field, ?string $locale = null): mixed
    {
        return app(ItemDataAccessor::class)->getTranslated($this, $field, $locale);
    }

    public function setTranslated(string $field, string $locale, mixed $value): void
    {
        app(ItemDataAccessor::class)->setTranslated($this, $field, $locale, $value);
    }
}
