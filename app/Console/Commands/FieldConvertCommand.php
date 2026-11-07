<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Data\Collections\FieldConvertOptionsData;
use App\Enums\FieldTypeEnum;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Services\Collections\CollectionFieldConvertMatrixService;
use App\Services\Collections\CollectionFieldConvertService;
use Illuminate\Console\Command;
use Symfony\Component\Console\Attribute\AsCommand;

/**
 * Chunked CLI for safe field type / translatable conversion (#220).
 */
#[AsCommand(name: 'externa:field-convert')]
class FieldConvertCommand extends Command
{
    protected $signature = 'externa:field-convert
        {field : Field id}
        {--to= : Target field type (e.g. textarea, markdown, select)}
        {--translatable= : Target translatable flag (0|1); omit to keep current}
        {--locale= : Locale to keep when collapsing translatable → non-translatable}
        {--create-missing-options=1 : Auto-create select options from values (string→select)}
        {--chunk=100 : Items per write batch}
        {--dry-run : Preview only (no writes)}
        {--matrix : Print the supported conversion matrix and exit}';

    protected $description = 'Convert a collection field type / translatable flag with content migration (dry-run by default when --dry-run is set)';

    public function handle(
        CollectionFieldConvertService $convert,
        CollectionFieldConvertMatrixService $matrix,
    ): int {
        if ($this->option('matrix')) {
            $this->info('Supported conversion matrix (#220):');
            foreach ($matrix->documentedMatrix() as $row) {
                $this->line(sprintf(
                    '  %s → %s (%s)',
                    $row['from'],
                    $row['to'],
                    $row['translatable'],
                ));
            }

            return self::SUCCESS;
        }

        $fieldId = (int) $this->argument('field');
        $field = CollectionField::query()->find($fieldId);
        if ($field === null) {
            $this->error("Field #{$fieldId} not found.");

            return self::FAILURE;
        }

        $toTypeRaw = $this->option('to');
        $toType = is_string($toTypeRaw) && $toTypeRaw !== ''
            ? FieldTypeEnum::tryFrom($toTypeRaw)
            : $field->type;

        if ($toType === null) {
            $this->error('Invalid --to type. Use a FieldTypeEnum value (e.g. textarea).');

            return self::FAILURE;
        }

        $translatableOption = $this->option('translatable');
        $toTranslatable = $translatableOption === null
            ? (bool) $field->translatable
            : in_array((string) $translatableOption, ['1', 'true', 'yes'], true);

        $createMissing = ! in_array(
            (string) $this->option('create-missing-options'),
            ['0', 'false', 'no'],
            true,
        );

        $dryRun = (bool) $this->option('dry-run');
        $chunk = max(1, (int) $this->option('chunk'));
        $locale = is_string($this->option('locale')) && $this->option('locale') !== ''
            ? (string) $this->option('locale')
            : null;

        /** @var Collection $collection */
        $collection = $field->collection;
        $this->info(sprintf(
            'externa:field-convert field#%d (%s.%s) %s → %s [translatable %s → %s]%s',
            $field->id,
            $collection->slug,
            $field->name,
            $field->type->value,
            $toType->value,
            $field->translatable ? 'true' : 'false',
            $toTranslatable ? 'true' : 'false',
            $dryRun ? ' [dry-run]' : '',
        ));

        $result = $convert->run($field, new FieldConvertOptionsData(
            toType: $toType,
            toTranslatable: $toTranslatable,
            locale: $locale,
            createMissingOptions: $createMissing,
            chunkSize: $chunk,
            dryRun: $dryRun,
        ));

        if ($result->error !== null) {
            $this->error($result->error);
        }

        foreach ($result->items as $row) {
            if ($row['status'] === 'failed') {
                $this->warn(sprintf(
                    '  item #%d FAILED: %s',
                    $row['item_id'],
                    $row['reason'] ?? 'unknown',
                ));
            } elseif ($row['status'] === 'ok') {
                $this->line(sprintf(
                    '  item #%d ok%s',
                    $row['item_id'],
                    $row['has_draft'] ? ' (has draft)' : '',
                ));
            }
        }

        $this->info(sprintf(
            'Summary: ok=%d unchanged=%d failed=%d skipped=%d with_draft=%d%s',
            $result->counts['ok'],
            $result->counts['unchanged'],
            $result->counts['failed'],
            $result->counts['skipped'],
            $result->counts['with_draft'],
            $result->applied ? ' (applied)' : ($dryRun ? ' (dry-run)' : ' (not applied)'),
        ));

        if (! $result->supported || ($result->error !== null && ! $result->applied)) {
            return self::FAILURE;
        }

        return self::SUCCESS;
    }
}
