<?php

namespace App\Models;

use App\Enums\FieldTypeEnum;
use Database\Factories\CollectionFieldFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Spatie\EloquentSortable\Sortable;
use Spatie\EloquentSortable\SortableTrait;

/**
 * @property-read int $id
 * @property int $collection_id
 * @property string $name
 * @property FieldTypeEnum $type
 * @property bool $translatable
 * @property int $sort_order
 * @property array<string, mixed>|null $settings
 */
class CollectionField extends Model implements Sortable
{
    /** @use HasFactory<CollectionFieldFactory> */
    use HasFactory;

    use SortableTrait;

    protected $table = 'collections_fields';

    /**
     * @var array<string, mixed>
     */
    public array $sortable = [
        'order_column_name' => 'sort_order',
        'sort_when_creating' => true,
    ];

    protected $fillable = [
        'collection_id',
        'name',
        'type',
        'translatable',
        'settings',
        'sort_order',
    ];

    /**
     * @return BelongsTo<Collection, $this>
     */
    public function collection(): BelongsTo
    {
        return $this->belongsTo(Collection::class, 'collection_id');
    }

    /**
     * @return HasMany<CollectionItemValue, $this>
     */
    public function collectionItemValues(): HasMany
    {
        return $this->hasMany(CollectionItemValue::class, 'field_id');
    }

    public function buildSortQuery(): Builder
    {
        return static::query()->where('collection_id', $this->collection_id);
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'type' => FieldTypeEnum::class,
            'translatable' => 'boolean',
            'settings' => 'array',
        ];
    }
}
