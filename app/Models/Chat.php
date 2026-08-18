<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * Unified chat thread: item (shared) or direct (private participants).
 */
class Chat extends Model
{
    use HasUuids, SoftDeletes;

    public const KIND_ITEM = 'item';

    public const KIND_DIRECT = 'direct';

    /**
     * @var list<string>
     */
    protected $fillable = [
        'kind',
        'collection_id',
        'collection_item_id',
        'created_by_user_id',
    ];

    public function isItem(): bool
    {
        return $this->kind === self::KIND_ITEM;
    }

    public function isDirect(): bool
    {
        return $this->kind === self::KIND_DIRECT;
    }

    /**
     * @return BelongsTo<Collection, $this>
     */
    public function collection(): BelongsTo
    {
        return $this->belongsTo(Collection::class);
    }

    /**
     * @return BelongsTo<CollectionItem, $this>
     */
    public function item(): BelongsTo
    {
        return $this->belongsTo(CollectionItem::class, 'collection_item_id');
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_user_id');
    }

    /**
     * @return HasMany<ChatParticipant, $this>
     */
    public function participants(): HasMany
    {
        return $this->hasMany(ChatParticipant::class);
    }

    /**
     * @return HasMany<CollectionItemChatMessage, $this>
     */
    public function messages(): HasMany
    {
        return $this->hasMany(CollectionItemChatMessage::class, 'chat_id');
    }

    /**
     * @return HasMany<ChatRead, $this>
     */
    public function reads(): HasMany
    {
        return $this->hasMany(ChatRead::class);
    }

    /**
     * Item thread for a saved collection item, if it already exists.
     */
    public static function forItem(CollectionItem $item): ?self
    {
        return self::query()
            ->where('kind', self::KIND_ITEM)
            ->where('collection_item_id', $item->id)
            ->first();
    }
}
