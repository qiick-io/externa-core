<?php

namespace App\Models;

use App\Concerns\LogsApplicationActivity;
use App\Enums\FileAccess;
use App\Enums\FileTypeEnum;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;
use Spatie\Tags\HasTags;

/**
 * File or folder node in the hierarchical file manager with versioning and tags.
 *
 * @property int $id
 * @property string $uuid
 * @property int|null $parent_id
 * @property FileTypeEnum $type
 * @property FileAccess|null $access null = inherit from nearest ancestor
 * @property string $name
 * @property string|null $title
 * @property string|null $description
 * @property string|null $location
 * @property string|null $download_name
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
 * @property float|null $focal_point_x
 * @property float|null $focal_point_y
 * @property float|null $translate_x
 * @property float|null $translate_y
 * @property float|null $scale
 * @property int|null $current_version_id
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property Carbon|null $deleted_at
 * @property-read File|null $parent
 * @property-read Collection<int, File> $children
 * @property-read FileVersion|null $currentVersion
 * @property-read bool|null $is_favorited
 */
class File extends Model
{
    use HasTags;
    use LogsApplicationActivity;
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
        'access',
        'name',
        'title',
        'description',
        'location',
        'download_name',
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

    /**
     * Assign a UUID before the first save when none is provided.
     */
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
            'access' => FileAccess::class,
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

    /**
     * @return BelongsToMany<User, $this>
     */
    public function favoritedBy(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'file_favorites')->withTimestamps();
    }

    /**
     * Whether this node is a folder.
     */
    public function isFolder(): bool
    {
        return $this->type === FileTypeEnum::Folder;
    }

    /**
     * Whether this node is a stored file (not a folder).
     */
    public function isFile(): bool
    {
        return $this->type === FileTypeEnum::File;
    }

    /**
     * Resolved visibility walking parent_id until a non-null access override is found.
     * Root with null access defaults to public.
     */
    public function effectiveAccess(): FileAccess
    {
        $node = $this;
        $guard = 0;

        while ($node !== null && $guard < 64) {
            if ($node->access instanceof FileAccess) {
                return $node->access;
            }

            if ($node->parent_id === null) {
                break;
            }

            // Prefer already-loaded parent to avoid N+1 when ancestors are eager-loaded.
            $node = $node->relationLoaded('parent')
                ? $node->parent
                : $node->parent()->first();
            $guard++;
        }

        return FileAccess::Public;
    }

    public function isEffectivelyPrivate(): bool
    {
        return $this->effectiveAccess() === FileAccess::Private;
    }

    /**
     * Filename used for downloads, preferring download_name when set.
     */
    public function downloadFilename(): string
    {
        return $this->download_name ?: $this->name;
    }

    /**
     * Compute the display path from parent hierarchy and name.
     */
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
