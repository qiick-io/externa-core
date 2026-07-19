<?php

namespace App\Models;

use App\Concerns\LogsApplicationActivity;
use App\Support\Collections\CollectionItemDataAccessor;
use Database\Factories\CollectionItemFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Carbon;

/**
 * A single record within a collection; field values live in related rows.
 *
 * @property-read int $id
 * @property int $collection_id
 * @property Carbon|null $deleted_at
 */
class CollectionItem extends Model
{
    /** @use HasFactory<CollectionItemFactory> */
    use HasFactory, LogsApplicationActivity, SoftDeletes;

    protected $table = 'collections_items';

    protected $fillable = [
        'collection_id',
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
    public function fieldValues(): HasMany
    {
        return $this->hasMany(CollectionItemValue::class, 'item_id');
    }

    /**
     * Resolve route binding including soft-deleted items.
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
     * Resolve a translatable field value for the given locale with fallbacks.
     */
    public function getTranslated(string $field, ?string $locale = null): mixed
    {
        return app(CollectionItemDataAccessor::class)->getTranslated($this, $field, $locale);
    }
}
