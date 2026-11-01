<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\PendingToolCallStatusEnum;
use Database\Factories\PendingToolCallFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;

/**
 * MCP (or other non-chat) AI tool invocation waiting on human approval.
 *
 * @property int $id
 * @property string $uuid
 * @property string $tool
 * @property string $surface
 * @property array<string, mixed> $arguments
 * @property PendingToolCallStatusEnum $status
 * @property int|null $requested_by
 * @property int|null $resolved_by
 * @property Carbon $expires_at
 * @property Carbon|null $resolved_at
 * @property string|null $result
 * @property string|null $decision_note
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 */
class PendingToolCall extends Model
{
    /** @use HasFactory<PendingToolCallFactory> */
    use HasFactory;

    /**
     * @var list<string>
     */
    protected $fillable = [
        'uuid',
        'tool',
        'surface',
        'arguments',
        'status',
        'requested_by',
        'resolved_by',
        'expires_at',
        'resolved_at',
        'result',
        'decision_note',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'arguments' => 'array',
            'status' => PendingToolCallStatusEnum::class,
            'expires_at' => 'datetime',
            'resolved_at' => 'datetime',
        ];
    }

    protected static function booting(): void
    {
        static::creating(function (PendingToolCall $pending): void {
            if ($pending->uuid === null || $pending->uuid === '') {
                $pending->uuid = (string) Str::uuid();
            }
        });
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function requester(): BelongsTo
    {
        return $this->belongsTo(User::class, 'requested_by');
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function resolver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'resolved_by');
    }

    public function isExpired(?Carbon $now = null): bool
    {
        return $this->expires_at->lessThanOrEqualTo($now ?? now());
    }

    public function isAwaitingDecision(?Carbon $now = null): bool
    {
        return $this->status === PendingToolCallStatusEnum::Pending
            && ! $this->isExpired($now);
    }
}
