<?php

namespace App\Models;

use App\Concerns\LogsApplicationActivity;
use App\Enums\FieldTypeEnum;
use App\Services\Api\PublicApiResponseCache;
use App\Support\Collections\CollectionLocaleResolver;
use Database\Factories\CollectionFieldFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Spatie\EloquentSortable\Sortable;
use Spatie\EloquentSortable\SortableTrait;

/**
 * Field schema for a collection, including type, settings, and sort order.
 *
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

    protected static function booted(): void
    {
        $bump = static function (CollectionField $field): void {
            app(PublicApiResponseCache::class)->bump((int) $field->collection_id);
        };

        static::created($bump);
        static::updated($bump);
        static::deleted($bump);
    }

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

    /**
     * Scope sortable reordering to fields within the same collection.
     */
    public function buildSortQuery(): Builder
    {
        return static::query()->where('collection_id', $this->collection_id);
    }

    /**
     * Whether the field is hidden from create/edit forms.
     */
    public function isHiddenInForm(): bool
    {
        return self::settingsFlagIsEnabled(data_get($this->settings, 'hidden_in_form', false));
    }

    /**
     * Whether the field is read-only in forms.
     */
    public function isReadonly(): bool
    {
        return self::settingsFlagIsEnabled(data_get($this->settings, 'readonly', false));
    }

    /**
     * Whether the field is required based on settings.
     */
    public function isRequired(): bool
    {
        return self::settingsFlagIsEnabled(data_get($this->settings, 'required', false));
    }

    /**
     * Localized display label from settings, falling back to the internal field name.
     */
    public function displayName(?string $locale = null): string
    {
        $locale ??= app()->getLocale();
        $displayName = data_get($this->settings, 'display_name', []);

        if (is_array($displayName) && is_string($displayName[$locale] ?? null) && trim($displayName[$locale]) !== '') {
            return trim($displayName[$locale]);
        }

        foreach (app(CollectionLocaleResolver::class)->fallbackChain($locale) as $fallbackLocale) {
            if (
                is_array($displayName)
                && is_string($displayName[$fallbackLocale] ?? null)
                && trim($displayName[$fallbackLocale]) !== ''
            ) {
                return trim($displayName[$fallbackLocale]);
            }
        }

        return $this->name;
    }

    /**
     * Localized helper note from settings, or null when unset.
     */
    public function note(?string $locale = null): ?string
    {
        $locale ??= app()->getLocale();
        $note = data_get($this->settings, 'note', []);

        if (is_array($note) && is_string($note[$locale] ?? null) && trim($note[$locale]) !== '') {
            return trim($note[$locale]);
        }

        foreach (app(CollectionLocaleResolver::class)->fallbackChain($locale) as $fallbackLocale) {
            if (
                is_array($note)
                && is_string($note[$fallbackLocale] ?? null)
                && trim($note[$fallbackLocale]) !== ''
            ) {
                return trim($note[$fallbackLocale]);
            }
        }

        return null;
    }

    /**
     * Default value from field settings.
     */
    public function defaultValue(): mixed
    {
        return data_get($this->settings, 'default_value');
    }

    /**
     * Form layout width token: half, full, or fill.
     */
    public function layoutWidth(): string
    {
        if ($this->type->isLayoutGroup()) {
            return 'full';
        }

        $width = data_get($this->settings, 'layout_width', 'full');

        return in_array($width, ['half', 'full', 'fill'], true) ? $width : 'full';
    }

    /**
     * Normalize settings flag values stored as bool, int, or string.
     */
    public static function settingsFlagIsEnabled(mixed $value): bool
    {
        if (is_bool($value)) {
            return $value;
        }

        return in_array($value, [1, '1', 'true', 'on'], true);
    }

    /**
     * Whether values for this field are stored as multiple rows (array storage).
     */
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
