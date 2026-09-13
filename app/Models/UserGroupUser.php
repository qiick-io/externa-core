<?php

namespace App\Models;

use App\Services\Chat\ChatParticipantSync;
use Illuminate\Database\Eloquent\Relations\Pivot;

/**
 * Pivot so group membership changes can expand/shrink via_group chat rows.
 */
class UserGroupUser extends Pivot
{
    protected $table = 'user_group_user';

    public $incrementing = false;

    public $timestamps = true;

    /**
     * Expand or shrink direct-chat via_group rows when membership changes.
     */
    protected static function booted(): void
    {
        static::created(function (UserGroupUser $pivot): void {
            app(ChatParticipantSync::class)->userJoinedGroup(
                (int) $pivot->user_group_id,
                (int) $pivot->user_id,
            );
        });

        static::deleted(function (UserGroupUser $pivot): void {
            app(ChatParticipantSync::class)->userLeftGroup(
                (int) $pivot->user_group_id,
                (int) $pivot->user_id,
            );
        });
    }
}
