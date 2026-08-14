<?php

namespace App\Models;

use App\Concerns\LogsApplicationActivity;
use App\Enums\CollectionStatusEnum;
use App\Services\Api\PublicApiResponseCache;
use App\Services\Webhooks\OutboundWebhookDispatcher;
use Database\Factories\CollectionFactory;
use Illuminate\Database\Eloquent\Builder;
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
 * @property string|null $description
 * @property CollectionStatusEnum $status
 * @property string|null $icon
 * @property string|null $color
 * @property bool $is_singleton
 * @property bool $versioning
 * @property int|null $revision_retention_count
 * @property int|null $revision_retention_days
 * @property array<string, mixed>|null $form_layout
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
        'description',
        'status',
        'icon',
        'color',
        'is_singleton',
        'versioning',
        'revision_retention_count',
        'revision_retention_days',
        'form_layout',
        'sort_order',
    ];

    /**
     * Collections visible in nav-style lists (pickers, public API index).
     *
     * @param  Builder<self>  $query
     * @return Builder<self>
     */
    public function scopeActive(Builder $query): Builder
    {
        return $query->where('status', CollectionStatusEnum::Active);
    }

    public function isActive(): bool
    {
        return $this->status === CollectionStatusEnum::Active;
    }

    /**
     * Cascade soft-delete/restore to items when the collection is deleted or restored.
     */
    protected static function booted(): void
    {
        static::created(function (Collection $collection): void {
            app(OutboundWebhookDispatcher::class)->dispatchCollection('collection.created', $collection);
        });

        static::updated(function (Collection $collection): void {
            app(OutboundWebhookDispatcher::class)->dispatchCollection('collection.updated', $collection);

            if ($collection->wasChanged('slug')) {
                app(PublicApiResponseCache::class)->bump((int) $collection->id);
            }
        });

        static::deleted(function (Collection $collection): void {
            app(OutboundWebhookDispatcher::class)->dispatchCollection('collection.deleted', $collection);
        });

        static::forceDeleted(function (Collection $collection): void {
            app(OutboundWebhookDispatcher::class)->dispatchCollection('collection.deleted', $collection);
        });

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
            'status' => CollectionStatusEnum::class,
            'is_singleton' => 'boolean',
            'versioning' => 'boolean',
            'revision_retention_count' => 'integer',
            'revision_retention_days' => 'integer',
            'form_layout' => 'array',
        ];
    }
}
