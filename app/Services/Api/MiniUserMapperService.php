<?php

declare(strict_types=1);

namespace App\Services\Api;

use App\Models\User;

/**
 * Compact public-API user payload shared by item resources and relation hydration.
 */
final class MiniUserMapperService
{
    /**
     * @return array{id: int, name: string, email: string|null}|null
     */
    public function toArray(?User $user): ?array
    {
        if ($user === null) {
            return null;
        }

        return [
            'id' => (int) $user->id,
            'name' => $user->name !== '' ? $user->name : ($user->email ?? ('#'.$user->id)),
            'email' => $user->email,
        ];
    }
}
