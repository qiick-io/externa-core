<?php

namespace App\Data\Deploy;

/**
 * Named deploy hook with decrypted URL (runtime only — never serialize to Inertia).
 */
readonly class DeployHookData
{
    public function __construct(
        public string $id,
        public string $name,
        public string $url,
    ) {}
}
