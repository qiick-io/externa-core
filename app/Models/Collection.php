<?php

namespace App\Models;

use App\Concerns\LogsApplicationActivity;
use Database\Factories\CollectionFactory;
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
class Collection extends Model implements Sortable
{
    /** @use HasFactory<CollectionFactory> */
    use HasFactory, LogsApplicationActivity;

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
     * @return HasMany<CollectionField, $this>
     */
    public function fields(): HasMany
    {
        return $this->hasMany(CollectionField::class, 'collection_id')->orderBy('sort_order');
    }

    /**
     * @return HasMany<CollectionItem, $this>
     */
    public function items(): HasMany
    {
        return $this->hasMany(CollectionItem::class, 'collection_id');
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
