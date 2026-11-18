<?php

declare(strict_types=1);

namespace App\Data\Ai;

use App\Models\User;

/**
 * Input for one AI item draft: the editor's brief, the content locale to write in, and the
 * field ACL of the requesting user (null = every field is writable).
 */
readonly class ItemDraftPromptData
{
    /**
     * @param  array<string, array{read: bool, create: bool, update: bool}>|null  $fieldGrants
     */
    public function __construct(
        public User $user,
        public string $prompt,
        public string $locale,
        public ?array $fieldGrants = null,
    ) {}
}
