<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * Chat message on a unified chat thread (item or direct).
 */
class CollectionItemChatMessage extends Model
{
    use SoftDeletes;

    protected $table = 'chat_messages';

    /**
     * @var list<string>
     */
    protected $fillable = [
        'chat_id',
        'user_id',
        'body',
        'mentioned_user_ids',
        'reply_to_id',
        'pinned_at',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'mentioned_user_ids' => 'array',
            'pinned_at' => 'datetime',
        ];
    }

    /**
     * @return BelongsTo<Chat, $this>
     */
    public function chat(): BelongsTo
    {
        return $this->belongsTo(Chat::class);
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * @return BelongsTo<CollectionItemChatMessage, $this>
     */
    public function replyTo(): BelongsTo
    {
        return $this->belongsTo(self::class, 'reply_to_id');
    }

    /**
     * @return HasMany<CollectionItemChatAttachment, $this>
     */
    public function attachments(): HasMany
    {
        return $this->hasMany(CollectionItemChatAttachment::class, 'message_id');
    }

    /**
     * @return HasMany<CollectionItemChatReaction, $this>
     */
    public function reactions(): HasMany
    {
        return $this->hasMany(CollectionItemChatReaction::class, 'message_id');
    }

    /**
     * Mentioned user ids stored on the row.
     *
     * @return list<int>
     */
    public function mentionedIds(): array
    {
        $raw = $this->mentioned_user_ids;

        if (! is_array($raw)) {
            return [];
        }

        return array_values(array_unique(array_map('intval', $raw)));
    }

    public function isPinned(): bool
    {
        return $this->pinned_at !== null;
    }

    /**
     * Delete isolated attachments when the message is removed.
     */
    protected static function booted(): void
    {
        static::deleting(function (CollectionItemChatMessage $message): void {
            $message->attachments()->each(function (CollectionItemChatAttachment $attachment): void {
                $attachment->delete();
            });
        });
    }
}
