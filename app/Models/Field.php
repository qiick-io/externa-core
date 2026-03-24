<?php

namespace App\Models;

use App\Enums\FieldType;
use Database\Factories\FieldFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Spatie\EloquentSortable\Sortable;
use Spatie\EloquentSortable\SortableTrait;

/**
 * @property-read int $id
 * @property int $collection_id
 * @property string $name
 * @property FieldType $type
 * @property bool $translatable
 * @property int $sort_order
 * @property array<string, mixed>|null $settings
 */
class Field extends Model implements Sortable
{
    /** @use HasFactory<FieldFactory> */
    use HasFactory;

    use SortableTrait;

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
     * @return BelongsTo<ContentCollection, $this>
     */
    public function collection(): BelongsTo
    {
        return $this->belongsTo(ContentCollection::class, 'collection_id');
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
            'type' => FieldType::class,
            'translatable' => 'boolean',
            'settings' => 'array',
        ];
    }
}
