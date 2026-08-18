<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Emoji reaction on a collection item chat message.
 */
class CollectionItemChatReaction extends Model
{
    protected $table = 'chat_reactions';

    /**
     * Quick-bar emojis. Unique per (message, user, emoji).
     *
     * @var list<string>
     */
    public const ALLOWED = ['😍', '❤️', '👍', '🤯', '😄', '🤔', '👎'];

    /**
     * @var list<string>
     */
    protected $fillable = [
        'message_id',
        'user_id',
        'emoji',
    ];

    /**
     * @return BelongsTo<CollectionItemChatMessage, $this>
     */
    public function message(): BelongsTo
    {
        return $this->belongsTo(CollectionItemChatMessage::class, 'message_id');
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
