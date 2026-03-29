<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;

class ActivityLog extends Model
{
    use HasFactory;

    protected $table = 'activity_logs';

    /**
     * The attributes that are mass assignable.
     *
     * @var array
     */
    protected $fillable = [
        'user_id',
        'entity_type',
        'entity_id',
        'action',
        'method',
        'payload',
        'date',
    ];

    protected $casts = [
        'payload' => 'array',
    ];

    /************************************************************************************
     * RELATIONS
     */

    /**
     * Retrieve user
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    /**
     * Retrieve the related model
     */
    public function model(): MorphTo
    {
        return $this->morphTo(null, 'entity_type', 'entity_id')->withTrashed();
    }
}
