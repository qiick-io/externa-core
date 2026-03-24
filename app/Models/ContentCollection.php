<?php

namespace App\Models;

use Database\Factories\ContentCollectionFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Spatie\EloquentSortable\Sortable;
use Spatie\EloquentSortable\SortableTrait;

/**
 * @property-read int $id
 * @property string $name
 * @property string $slug
 * @property bool $is_singleton
 * @property int $sort_order
 */
class ContentCollection extends Model implements Sortable
{
    /** @use HasFactory<ContentCollectionFactory> */
    use HasFactory;

    use SortableTrait;

    /**
     * @var array<string, mixed>
     */
    public array $sortable = [
        'order_column_name' => 'sort_order',
        'sort_when_creating' => true,
    ];

    protected $table = 'collections';

    protected $fillable = [
        'name',
        'slug',
        'is_singleton',
        'sort_order',
    ];

    /**
     * @return HasMany<Field, $this>
     */
    public function fields(): HasMany
    {
        return $this->hasMany(Field::class, 'collection_id')->orderBy('sort_order');
    }

    /**
     * @return HasMany<Item, $this>
     */
    public function items(): HasMany
    {
        return $this->hasMany(Item::class, 'collection_id');
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'is_singleton' => 'boolean',
        ];
    }
}
