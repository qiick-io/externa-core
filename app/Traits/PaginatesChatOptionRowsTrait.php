<?php

declare(strict_types=1);

namespace App\Traits;

/**
 * In-memory pagination for the chat hub option lists (directory, item picker),
 * which merge or filter rows in PHP before paging.
 */
trait PaginatesChatOptionRowsTrait
{
    /**
     * @param  list<array<string, mixed>>  $rows
     * @return array{data: list<array<string, mixed>>, meta: array{total: int, per_page: int, current_page: int, last_page: int, has_more: bool}}
     */
    private function paginateRows(array $rows, int $page, int $perPage): array
    {
        $total = count($rows);
        $last = max((int) ceil($total / max($perPage, 1)), 1);
        $page = min(max($page, 1), $last);
        $slice = array_slice($rows, ($page - 1) * $perPage, $perPage);

        return [
            'data' => array_values($slice),
            'meta' => [
                'total' => $total,
                'per_page' => $perPage,
                'current_page' => $page,
                'last_page' => $last,
                'has_more' => $page < $last,
            ],
        ];
    }
}
