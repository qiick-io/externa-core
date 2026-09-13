<?php

namespace App\Services\Collections;

use App\Models\Collection;
use App\Support\Collections\FieldPacks\FieldPackRegistry;
use InvalidArgumentException;

/**
 * Applies a registered field pack onto a collection (skip existing names).
 */
final class ApplyFieldPackService
{
    public function __construct(
        private readonly PackFieldCreator $packFieldCreator,
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
        $pack = FieldPackRegistry::find($packKey);

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
