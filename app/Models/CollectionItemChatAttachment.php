<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Storage;

/**
 * Isolated chat upload on the local disk. Not in the Files pool until transferred.
 */
class CollectionItemChatAttachment extends Model
{
    use HasUuids;

    protected $table = 'chat_attachments';

    public const DISK = 'local';

    public const TTL_HOURS = 24;

    /**
     * @var list<string>
     */
    protected $fillable = [
        'message_id',
        'user_id',
        'original_name',
        'mime_type',
        'disk',
        'path',
        'preview_path',
        'preview_mime',
        'size',
        'transferred_file_id',
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

    /**
     * @return BelongsTo<File, $this>
     */
    public function transferredFile(): BelongsTo
    {
        return $this->belongsTo(File::class, 'transferred_file_id');
    }

    /**
     * Absolute filesystem path to the stored attachment.
     */
    public function absolutePath(): string
    {
        return Storage::disk($this->disk)->path($this->path);
    }

    /**
     * Whether an unattached upload has passed its expiry time.
     */
    public function isExpired(): bool
    {
        return $this->expires_at !== null && $this->expires_at->isPast();
    }

    public function hasPreview(): bool
    {
        return is_string($this->preview_path) && $this->preview_path !== '';
    }

    /**
     * Remove the underlying file from storage when present.
     */
    public function deleteFile(): void
    {
        $disk = Storage::disk($this->disk);

        if ($this->path !== '' && $disk->exists($this->path)) {
            $disk->delete($this->path);
        }

        if ($this->hasPreview() && $disk->exists($this->preview_path)) {
            $disk->delete($this->preview_path);
        }
    }

    /**
     * JSON payload for chat APIs.
     *
     * @return array{id: string, name: string, mime: string, size: int, transferred_file_id: int|null, has_preview: bool}
     */
    public function toApiArray(): array
    {
        return [
            'id' => $this->id,
            'name' => $this->original_name,
            'mime' => $this->mime_type,
            'size' => (int) $this->size,
            'transferred_file_id' => $this->transferred_file_id !== null
                ? (int) $this->transferred_file_id
                : null,
            'has_preview' => $this->hasPreview(),
        ];
    }

    /**
     * Delete storage file when the model is removed.
     */
    protected static function booted(): void
    {
        static::deleting(function (CollectionItemChatAttachment $attachment): void {
            $attachment->deleteFile();
        });
    }
}
