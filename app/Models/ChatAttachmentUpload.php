<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * In-progress chat attachment chunked upload (isolated from Files pool).
 *
 * @property int $id
 * @property string $upload_id
 * @property int $user_id
 * @property string $file_name
 * @property string|null $mime_type
 * @property int $total_size
 * @property int $total_chunks
 * @property int $uploaded_chunks
 * @property array<string, mixed>|null $chunks_info
 * @property Carbon $expires_at
 */
class ChatAttachmentUpload extends Model
{
    protected $table = 'chat_attachment_uploads';

    /**
     * @var list<string>
     */
    protected $fillable = [
        'upload_id',
        'user_id',
        'file_name',
        'mime_type',
        'total_size',
        'total_chunks',
        'uploaded_chunks',
        'chunks_info',
        'expires_at',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'chunks_info' => 'array',
            'total_size' => 'integer',
            'total_chunks' => 'integer',
            'uploaded_chunks' => 'integer',
            'expires_at' => 'datetime',
        ];
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function isExpired(): bool
    {
        return $this->expires_at->isPast();
    }

    public function isComplete(): bool
    {
        return $this->uploaded_chunks >= $this->total_chunks;
    }
}
