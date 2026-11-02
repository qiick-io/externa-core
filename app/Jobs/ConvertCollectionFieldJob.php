<?php

declare(strict_types=1);

namespace App\Jobs;

use App\Data\Collections\FieldConvertOptionsData;
use App\Enums\FieldTypeEnum;
use App\Models\CollectionField;
use App\Models\User;
use App\Services\Collections\CollectionFieldConvertService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Auth;
use Throwable;

/**
 * Queued field type / translatable conversion (#220).
 */
class ConvertCollectionFieldJob implements ShouldQueue
{
    use Queueable;

    public int $tries = 2;

    public int $timeout = 600;

    /**
     * @param  array<string, string>  $optionMapping
     * @param  array<string, mixed>|null  $settings
     */
    public function __construct(
        public readonly int $fieldId,
        public readonly string $toType,
        public readonly bool $toTranslatable,
        public readonly ?string $locale = null,
        public readonly array $optionMapping = [],
        public readonly bool $createMissingOptions = true,
        public readonly ?array $settings = null,
        public readonly int $chunkSize = 100,
        public readonly ?int $userId = null,
    ) {}

    /**
     * @return list<int>
     */
    public function backoff(): array
    {
        return [30, 60];
    }

    public function handle(CollectionFieldConvertService $convert): void
    {
        $field = CollectionField::query()->find($this->fieldId);
        if ($field === null) {
            return;
        }

        $type = FieldTypeEnum::tryFrom($this->toType);
        if ($type === null) {
            report(new \InvalidArgumentException("Invalid field type [{$this->toType}] for convert job."));

            return;
        }

        if ($this->userId !== null) {
            $user = User::query()->find($this->userId);
            if ($user !== null) {
                Auth::login($user);
            }
        }

        $result = $convert->run($field, new FieldConvertOptionsData(
            toType: $type,
            toTranslatable: $this->toTranslatable,
            locale: $this->locale,
            optionMapping: $this->optionMapping,
            createMissingOptions: $this->createMissingOptions,
            settings: $this->settings,
            chunkSize: $this->chunkSize,
            dryRun: false,
        ));

        if (! $result->applied && $result->error !== null) {
            report(new \RuntimeException($result->error));
        }
    }

    public function failed(?Throwable $exception): void
    {
        report($exception);
    }
}
