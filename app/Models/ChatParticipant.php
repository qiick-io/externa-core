<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * User or group membership on a direct chat.
 */
class ChatParticipant extends Model
{
    public const SOURCE_EXPLICIT = 'explicit';

    public const SOURCE_VIA_GROUP = 'via_group';

    /**
     * @var list<string>
     */
    protected $fillable = [
        'chat_id',
        'user_id',
        'user_group_id',
        'source',
        'archived_at',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'archived_at' => 'datetime',
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
     * @return BelongsTo<UserGroup, $this>
     */
    public function group(): BelongsTo
    {
        return $this->belongsTo(UserGroup::class, 'user_group_id');
    }

    public function isExplicit(): bool
    {
        return $this->source === self::SOURCE_EXPLICIT;
    }
}
