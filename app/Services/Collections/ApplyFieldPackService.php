<?php

namespace App\Services\Collections;

use App\Models\Collection;
use App\Services\Collections\FieldPacks\FieldPackRegistryService;
use InvalidArgumentException;

/**
 * Applies a registered field pack onto a collection (skip existing names).
 */
final class ApplyFieldPackService
{
    public function __construct(
        private readonly PackFieldCreatorService $packFieldCreator,
    ) {}

    /**
     * @return array{
     *     pack: string,
     *     created: list<array{id: int, name: string, type: string, translatable: bool}>,
     *     skipped: list<string>
     * }
     */
    public function apply(Collection $collection, string $packKey): array
    {
        $pack = FieldPackRegistryService::find($packKey);

        if ($pack === null) {
            throw new InvalidArgumentException('Unknown field pack: '.$packKey);
        }

        $result = $this->packFieldCreator->createFromDefinitions($collection, $pack['fields']);

        return [
            'pack' => $pack['key'],
            'created' => $result['created'],
            'skipped' => $result['skipped'],
        ];
    }
}
