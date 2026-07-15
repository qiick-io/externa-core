<?php

namespace App\Models;

use App\Concerns\LogsApplicationActivity;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * @property int $id
 * @property string $upload_id
 * @property string $file_name
 * @property string|null $mime_type
 * @property int $total_size
 * @property int $total_chunks
 * @property int $uploaded_chunks
 * @property string $disk
 * @property int|null $parent_id
 * @property array<string, mixed>|null $chunks_info
 * @property Carbon $expires_at
 * @property-read File|null $parent
 */
class FileUpload extends Model
{
    use LogsApplicationActivity;

    protected $table = 'file_uploads';

    /**
     * @var list<string>
     */
    protected $fillable = [
        'upload_id',
        'file_name',
        'mime_type',
        'total_size',
        'total_chunks',
        'uploaded_chunks',
        'disk',
        'parent_id',
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
     * @return BelongsTo<File, $this>
     */
    public function parent(): BelongsTo
    {
        return $this->belongsTo(File::class, 'parent_id');
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
