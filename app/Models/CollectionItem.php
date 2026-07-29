<?php

namespace App\Models;

use App\Concerns\LogsApplicationActivity;
use App\Services\Api\PublicApiResponseCache;
use App\Services\Webhooks\OutboundWebhookDispatcher;
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
 * @property int|null $user_created_id
 * @property int|null $user_updated_id
 * @property Carbon|null $deleted_at
 */
class CollectionItem extends Model
{
    /** @use HasFactory<CollectionItemFactory> */
    use HasFactory, LogsApplicationActivity, SoftDeletes;

    protected $table = 'collections_items';

    protected $fillable = [
        'collection_id',
        'user_created_id',
        'user_updated_id',
    ];

    protected static function booted(): void
    {
        static::creating(function (CollectionItem $item): void {
            $userId = auth()->id();
            if (! is_int($userId) && ! (is_string($userId) && ctype_digit($userId))) {
                return;
            }

            $id = (int) $userId;
            $item->user_created_id ??= $id;
            $item->user_updated_id ??= $id;
        });

        static::updating(function (CollectionItem $item): void {
            $userId = auth()->id();
            if (! is_int($userId) && ! (is_string($userId) && ctype_digit($userId))) {
                return;
            }

            $item->user_updated_id = (int) $userId;
        });

        // Create/update webhooks fire from CollectionItemValuesWriter (avoids empty create[])
        static::deleted(function (CollectionItem $item): void {
            app(OutboundWebhookDispatcher::class)->dispatchItem('item.deleted', $item);
            app(PublicApiResponseCache::class)->bump((int) $item->collection_id);
        });

        static::restored(function (CollectionItem $item): void {
            app(OutboundWebhookDispatcher::class)->dispatchItem('item.restored', $item);
            app(PublicApiResponseCache::class)->bump((int) $item->collection_id);
        });

        static::forceDeleted(function (CollectionItem $item): void {
            app(OutboundWebhookDispatcher::class)->dispatchItem('item.deleted', $item);
            app(PublicApiResponseCache::class)->bump((int) $item->collection_id);
        });
    }

    /**
     * @return BelongsTo<Collection, $this>
     */
    public function collection(): BelongsTo
    {
        return $this->belongsTo(Collection::class, 'collection_id');
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function userCreated(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_created_id');
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function userUpdated(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_updated_id');
    }

    /**
     * @return HasMany<CollectionItemValue, $this>
     */
    public function fieldValues(): HasMany
    {
        return $this->hasMany(CollectionItemValue::class, 'item_id');
    }

    /**
     * @return HasMany<CollectionItemRevision, $this>
     */
    public function revisions(): HasMany
    {
        return $this->hasMany(CollectionItemRevision::class, 'item_id')->latest('id');
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
