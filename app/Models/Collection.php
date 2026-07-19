<?php

namespace App\Models;

use App\Concerns\LogsApplicationActivity;
use Database\Factories\CollectionFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Carbon;
use Spatie\EloquentSortable\Sortable;
use Spatie\EloquentSortable\SortableTrait;

/**
 * Content collection definition with ordered fields and items; supports singleton mode.
 *
 * @property-read int $id
 * @property string $name
 * @property string $slug
 * @property bool $is_singleton
 * @property int $sort_order
 * @property Carbon|null $deleted_at
 */
class Collection extends Model implements Sortable
{
    /** @use HasFactory<CollectionFactory> */
    use HasFactory, LogsApplicationActivity, SoftDeletes;

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
     * Cascade soft-delete/restore to items when the collection is deleted or restored.
     */
    protected static function booted(): void
    {
        static::deleting(function (Collection $collection): void {
            if ($collection->isForceDeleting()) {
                $collection->items()->withTrashed()->forceDelete();

                return;
            }

            $collection->items()->delete();
        });

        static::restoring(function (Collection $collection): void {
            $collection->items()->onlyTrashed()->restore();
        });
    }

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
     * Resolve route binding including soft-deleted collections.
     *
     * @param  mixed  $value
     * @param  string|null  $field
     */
    public function resolveRouteBinding($value, $field = null): ?self
    {
        return $this->withTrashed()
            ->where($field ?? $this->getRouteKeyName(), $value)
            ->firstOrFail();
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
