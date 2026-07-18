<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AiSyncSource extends Model
{
    /**
     * @var list<string>
     */
    protected $fillable = [
        'user_id',
        'collection_id',
        'url',
        'upsert_key',
        'interval_minutes',
        'auth_bearer',
        'last_run_at',
        'last_status',
        'enabled',
    ];

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * @return BelongsTo<Collection, $this>
     */
    public function collection(): BelongsTo
    {
        return $this->belongsTo(Collection::class);
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'interval_minutes' => 'integer',
            'auth_bearer' => 'encrypted',
            'last_run_at' => 'datetime',
            'enabled' => 'boolean',
        ];
    }
}
