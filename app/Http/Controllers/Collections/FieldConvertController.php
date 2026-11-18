<?php

declare(strict_types=1);

namespace App\Http\Controllers\Collections;

use App\Data\Collections\FieldConvertOptionsData;
use App\Enums\FieldTypeEnum;
use App\Http\Controllers\Controller;
use App\Http\Requests\Collections\ConvertFieldRequest;
use App\Jobs\ConvertCollectionFieldJob;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Services\Collections\CollectionFieldConvertMatrixService;
use App\Services\Collections\CollectionFieldConvertService;
use App\Services\Collections\CollectionFieldStorageShapeService;
use App\Traits\AssertsFieldBelongsToCollectionTrait;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;

/**
 * Safe field type / translatable conversion of a field with stored content (#220):
 * list the supported targets, then dry-run, apply in sync or queue the conversion.
 */
class FieldConvertController extends Controller
{
    use AssertsFieldBelongsToCollectionTrait;

    /**
     * List supported conversion targets for a field with stored content (#220).
     */
    public function convertTargets(
        Collection $collection,
        CollectionField $field,
        CollectionFieldConvertService $convert,
    ): JsonResponse {
        $this->assertFieldBelongsToCollection($collection, $field);

        return response()->json([
            'field_id' => $field->id,
            'type' => $field->type->value,
            'translatable' => (bool) $field->translatable,
            'has_stored_values' => app(CollectionFieldStorageShapeService::class)->hasStoredValues($field),
            'targets' => $convert->supportedTargetTypes($field),
            'matrix' => app(CollectionFieldConvertMatrixService::class)->documentedMatrix(),
        ]);
    }

    /**
     * Dry-run or apply a safe field type / translatable conversion (#220).
     *
     * Without `dry_run` or `sync` the conversion is queued as a ConvertCollectionFieldJob.
     */
    public function convert(
        ConvertFieldRequest $request,
        Collection $collection,
        CollectionField $field,
        CollectionFieldConvertService $convert,
    ): JsonResponse|RedirectResponse {
        $this->assertFieldBelongsToCollection($collection, $field);

        $validated = $request->validated();
        $toType = $validated['type'] instanceof FieldTypeEnum
            ? $validated['type']
            : FieldTypeEnum::from((string) $validated['type']);
        $toTranslatable = $request->has('translatable')
            ? $request->boolean('translatable')
            : (bool) $field->translatable;
        $dryRun = $request->boolean('dry_run', false);
        $sync = $request->boolean('sync', false);

        /** @var array<string, string> $optionMapping */
        $optionMapping = [];
        foreach (($validated['option_mapping'] ?? []) as $from => $to) {
            $optionMapping[(string) $from] = (string) $to;
        }

        $options = new FieldConvertOptionsData(
            toType: $toType,
            toTranslatable: $toTranslatable,
            locale: isset($validated['locale']) ? (string) $validated['locale'] : null,
            optionMapping: $optionMapping,
            createMissingOptions: $request->boolean('create_missing_options', true),
            settings: isset($validated['settings']) && is_array($validated['settings'])
                ? $validated['settings']
                : null,
            dryRun: $dryRun,
        );

        if ($dryRun || $sync) {
            $result = $convert->run($field, $options);

            if ($request->wantsJson() || $dryRun) {
                $status = ($result->supported && $result->error === null) || $result->applied
                    ? 200
                    : 422;

                return response()->json($result->toArray(), $status);
            }

            if (! $result->applied) {
                return redirect()
                    ->route('collections.fields.index', $collection)
                    ->withErrors(['convert' => $result->error ?? __('Conversion failed.')]);
            }

            return redirect()
                ->route('collections.fields.index', $collection)
                ->with('success', __('Field converted.'));
        }

        ConvertCollectionFieldJob::dispatch(
            fieldId: $field->id,
            toType: $toType->value,
            toTranslatable: $toTranslatable,
            locale: $options->locale,
            optionMapping: $optionMapping,
            createMissingOptions: $options->createMissingOptions,
            settings: $options->settings,
            userId: $request->user()?->id,
        );

        if ($request->wantsJson()) {
            return response()->json([
                'queued' => true,
                'field_id' => $field->id,
                'to_type' => $toType->value,
                'to_translatable' => $toTranslatable,
            ]);
        }

        return redirect()
            ->route('collections.fields.index', $collection)
            ->with('success', __('Field conversion queued.'));
    }
}
