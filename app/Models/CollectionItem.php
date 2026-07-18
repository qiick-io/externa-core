<?php

namespace App\Models;

use App\Concerns\LogsApplicationActivity;
use App\Support\Collections\ItemDataAccessor;
use Database\Factories\CollectionItemFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Carbon;

/**
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
     * @param  mixed  $value
     * @param  string|null  $field
     */
    public function resolveRouteBinding($value, $field = null): ?self
    {
        return $this->withTrashed()
            ->where($field ?? $this->getRouteKeyName(), $value)
            ->firstOrFail();
    }

    public function getTranslated(string $field, ?string $locale = null): mixed
    {
        return app(ItemDataAccessor::class)->getTranslated($this, $field, $locale);
    }
}
