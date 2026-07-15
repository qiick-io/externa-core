<?php

namespace App\Models;

use App\Concerns\LogsApplicationActivity;
use App\Enums\FieldTypeEnum;
use Database\Factories\CollectionFieldFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Spatie\EloquentSortable\Sortable;
use Spatie\EloquentSortable\SortableTrait;

/**
 * @property-read int $id
 * @property int $collection_id
 * @property string $name
 * @property FieldTypeEnum $type
 * @property bool $translatable
 * @property int $sort_order
 * @property array<string, mixed>|null $settings
 */
class CollectionField extends Model implements Sortable
{
    /** @use HasFactory<CollectionFieldFactory> */
    use HasFactory, LogsApplicationActivity;

    use SortableTrait;

    protected $table = 'collections_fields';

    /**
     * @var array<string, mixed>
     */
    public array $sortable = [
        'order_column_name' => 'sort_order',
        'sort_when_creating' => true,
    ];

    protected $fillable = [
        'collection_id',
        'name',
        'type',
        'translatable',
        'settings',
        'sort_order',
    ];

    /**
     * @return BelongsTo<Collection, $this>
     */
    public function collection(): BelongsTo
    {
        return $this->belongsTo(Collection::class, 'collection_id');
    }

    /**
     * @return HasMany<CollectionItemValue, $this>
     */
    public function collectionItemValues(): HasMany
    {
        return $this->hasMany(CollectionItemValue::class, 'field_id');
    }

    public function buildSortQuery(): Builder
    {
        return static::query()->where('collection_id', $this->collection_id);
    }

    public function isHiddenInForm(): bool
    {
        return self::settingsFlagIsEnabled(data_get($this->settings, 'hidden_in_form', false));
    }

    public function isReadonly(): bool
    {
        return self::settingsFlagIsEnabled(data_get($this->settings, 'readonly', false));
    }

    public function isRequired(): bool
    {
        return self::settingsFlagIsEnabled(data_get($this->settings, 'required', false));
    }

    public function displayName(?string $locale = null): string
    {
        $locale ??= app()->getLocale();
        $displayName = data_get($this->settings, 'display_name', []);

        if (is_array($displayName) && is_string($displayName[$locale] ?? null) && trim($displayName[$locale]) !== '') {
            return trim($displayName[$locale]);
        }

        foreach (config('collections.fallback_locales', ['en', 'it']) as $fallbackLocale) {
            if (
                is_string($fallbackLocale)
                && is_array($displayName)
                && is_string($displayName[$fallbackLocale] ?? null)
                && trim($displayName[$fallbackLocale]) !== ''
            ) {
                return trim($displayName[$fallbackLocale]);
            }
        }

        return $this->name;
    }

    public function note(?string $locale = null): ?string
    {
        $locale ??= app()->getLocale();
        $note = data_get($this->settings, 'note', []);

        if (is_array($note) && is_string($note[$locale] ?? null) && trim($note[$locale]) !== '') {
            return trim($note[$locale]);
        }

        foreach (config('collections.fallback_locales', ['en', 'it']) as $fallbackLocale) {
            if (
                is_string($fallbackLocale)
                && is_array($note)
                && is_string($note[$fallbackLocale] ?? null)
                && trim($note[$fallbackLocale]) !== ''
            ) {
                return trim($note[$fallbackLocale]);
            }
        }

        return null;
    }

    public function defaultValue(): mixed
    {
        return data_get($this->settings, 'default_value');
    }

    public function layoutWidth(): string
    {
        $width = data_get($this->settings, 'layout_width', 'full');

        return in_array($width, ['half', 'full', 'fill'], true) ? $width : 'full';
    }

    public static function settingsFlagIsEnabled(mixed $value): bool
    {
        if (is_bool($value)) {
            return $value;
        }

        return in_array($value, [1, '1', 'true', 'on'], true);
    }

    public function usesArrayStorage(): bool
    {
        if ($this->type === FieldTypeEnum::Image) {
            return self::settingsFlagIsEnabled(data_get($this->settings, 'allow_multiple', false));
        }

        return $this->type->isArrayStorage();
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'type' => FieldTypeEnum::class,
            'translatable' => 'boolean',
            'settings' => 'array',
        ];
    }
}
