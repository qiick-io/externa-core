<?php

namespace App\GraphQL\Concerns;

trait SerializesGraphqlItemTrait
{
    /**
     * Lighthouse's DateTime scalar only accepts `Y-m-d H:i:s`, while
     * CollectionItemResource emits ISO-8601; convert the item timestamps.
     *
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    protected function withGraphqlTimestamps(array $payload): array
    {
        foreach (['created_at', 'updated_at', 'published_at'] as $key) {
            if (! empty($payload[$key]) && is_string($payload[$key])) {
                $payload[$key] = date('Y-m-d H:i:s', (int) strtotime($payload[$key]));
            }
        }

        return $payload;
    }
}
