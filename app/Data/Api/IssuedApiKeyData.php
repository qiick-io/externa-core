<?php

declare(strict_types=1);

namespace App\Data\Api;

use App\Models\ApiKey;

/**
 * A key together with the plain-text token just issued for it (create or rotate). The token
 * exists only here and in the one response that shows it; it is never stored or logged.
 */
final readonly class IssuedApiKeyData
{
    public function __construct(
        public ApiKey $apiKey,
        #[\SensitiveParameter]
        public string $plainTextKey,
    ) {}
}
