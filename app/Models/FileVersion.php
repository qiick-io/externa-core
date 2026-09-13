<?php

namespace App\Models;

use App\Concerns\LogsApplicationActivity;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Immutable snapshot of file bytes and metadata for deduplication and history.
 *
 * @property int $id
 * @property int|null $file_id
 * @property string $disk
 * @property string $storage_path
 * @property string|null $hash
 * @property string|null $mime_type
 * @property int $size
 * @property int|null $width
 * @property int|null $height
 * @property array<string, mixed>|null $meta
 * @property-read File|null $file
 */
class FileVersion extends Model
{
    use LogsApplicationActivity;

    protected $table = 'file_versions';

    /**
     * @var list<string>
     */
    protected $fillable = [
        'file_id',
        'disk',
        'storage_path',
        'hash',
        'mime_type',
        'size',
        'width',
        'height',
        'meta',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'meta' => 'array',
            'size' => 'integer',
            'width' => 'integer',
            'height' => 'integer',
        ];
    }

    /**
     * @return BelongsTo<File, $this>
     */
    public function file(): BelongsTo
    {
        return $this->belongsTo(File::class);
    }
}
