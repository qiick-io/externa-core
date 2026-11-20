<?php

declare(strict_types=1);

namespace App\Services\Api;

use App\Models\User;

/**
 * Compact public-API user payload shared by item resources and relation hydration.
 *
 * `public_id` is the stable external id. The bigint `id` stays for one deprecation window
 * (OpenAPI `deprecated: true`) where CMS clients already key on it (#827).
 */
final class MiniUserMapperService
{
    /**
     * @return array{id: int, public_id: string, name: string, email: string|null}|null
     */
    public function toArray(?User $user): ?array
    {
        if ($user === null) {
            return null;
        }

        return [
            'id' => (int) $user->id,
            'public_id' => (string) $user->public_id,
            'name' => $user->name !== '' ? $user->name : ($user->email ?? ('#'.$user->id)),
            'email' => $user->email,
        ];
    }
}
