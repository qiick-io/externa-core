<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Storage;

class AiChatAttachment extends Model
{
    use HasUuids;

    public const DISK = 'local';

    public const MAX_BYTES = 5 * 1024 * 1024;

    public const TTL_HOURS = 24;

    /**
     * @var list<string>
     */
    public const ALLOWED_MIME_TYPES = [
        'text/csv',
        'text/plain',
        'application/csv',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/pdf',
    ];

    /**
     * @var list<string>
     */
    public const ALLOWED_EXTENSIONS = [
        'csv',
        'txt',
        'xlsx',
        'pdf',
    ];

    /**
     * @var list<string>
     */
    protected $fillable = [
        'user_id',
        'original_name',
        'mime_type',
        'disk',
        'path',
        'size',
        'expires_at',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'size' => 'integer',
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

    public function absolutePath(): string
    {
        return Storage::disk($this->disk)->path($this->path);
    }

    public function isExpired(): bool
    {
        return $this->expires_at !== null && $this->expires_at->isPast();
    }

    public function deleteFile(): void
    {
        if ($this->path !== '' && Storage::disk($this->disk)->exists($this->path)) {
            Storage::disk($this->disk)->delete($this->path);
        }
    }

    protected static function booted(): void
    {
        static::deleting(function (AiChatAttachment $attachment): void {
            $attachment->deleteFile();
        });
    }
}
