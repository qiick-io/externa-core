<?php

namespace App\Models;

use App\Enums\FileTypeEnum;
use App\Traits\HasActivityLog;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;

/**
 * @property int $id
 * @property string $uuid
 * @property int|null $parent_id
 * @property FileTypeEnum $type
 * @property string $name
 * @property string $path
 * @property string $disk
 * @property string|null $storage_path
 * @property string|null $hash
 * @property string|null $mime_type
 * @property string|null $extension
 * @property int|null $size
 * @property int|null $width
 * @property int|null $height
 * @property array<string, mixed>|null $meta
 * @property int|null $current_version_id
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property Carbon|null $deleted_at
 * @property-read File|null $parent
 * @property-read Collection<int, File> $children
 * @property-read FileVersion|null $currentVersion
 */
class File extends Model
{
    use HasActivityLog;
    use SoftDeletes;

    protected $table = 'files';

    /**
     * @var list<string>
     */
    protected $with = ['currentVersion'];

    /**
     * @var list<string>
     */
    protected $fillable = [
        'uuid',
        'parent_id',
        'type',
        'name',
        'path',
        'disk',
        'storage_path',
        'mime_type',
        'extension',
        'size',
        'width',
        'height',
        'meta',
        'hash',
        'current_version_id',
        'focal_point_x',
        'focal_point_y',
        'translate_x',
        'translate_y',
        'scale',
    ];

    protected static function booted(): void
    {
        static::creating(function (File $file): void {
            if (empty($file->uuid)) {
                $file->uuid = (string) Str::uuid();
            }
        });
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'meta' => 'array',
            'type' => FileTypeEnum::class,
            'size' => 'integer',
            'width' => 'integer',
            'height' => 'integer',
            'focal_point_x' => 'float',
            'focal_point_y' => 'float',
            'translate_x' => 'float',
            'translate_y' => 'float',
            'scale' => 'float',
        ];
    }

    /**
     * @return BelongsTo<File, $this>
     */
    public function parent(): BelongsTo
    {
        return $this->belongsTo(File::class, 'parent_id');
    }

    /**
     * @return HasMany<File, $this>
     */
    public function children(): HasMany
    {
        return $this->hasMany(File::class, 'parent_id');
    }

    /**
     * @return HasMany<FileVersion, $this>
     */
    public function versions(): HasMany
    {
        return $this->hasMany(FileVersion::class)->orderByDesc('created_at');
    }

    /**
     * @return BelongsTo<FileVersion, $this>
     */
    public function currentVersion(): BelongsTo
    {
        return $this->belongsTo(FileVersion::class, 'current_version_id');
    }

    public function isFolder(): bool
    {
        return $this->type === FileTypeEnum::Folder;
    }

    public function isFile(): bool
    {
        return $this->type === FileTypeEnum::File;
    }

    public function calculatePath(): string
    {
        if ($this->parent_id === null) {
            return '/'.$this->name;
        }

        $parent = $this->parent;
        if (! $parent) {
            return '/'.$this->name;
        }

        $parentPath = $parent->path;
        if ($parentPath === '/') {
            return '/'.$this->name;
        }

        return rtrim($parentPath, '/').'/'.$this->name;
    }
}
