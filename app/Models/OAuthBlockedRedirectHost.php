<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A redirect host blocked from MCP OAuth dynamic client registration (#815).
 *
 * @property int $id
 * @property string $host
 * @property int|null $created_by
 */
class OAuthBlockedRedirectHost extends Model
{
    protected $table = 'oauth_blocked_redirect_hosts';

    /**
     * @var list<string>
     */
    protected $fillable = [
        'host',
        'created_by',
    ];

    /**
     * @return BelongsTo<User, $this>
     */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
