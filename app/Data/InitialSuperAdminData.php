<?php

declare(strict_types=1);

namespace App\Data;

/**
 * Credentials for the first super-admin created by seed or externa:install.
 */
readonly class InitialSuperAdminData
{
    public function __construct(
        public string $firstName,
        public string $lastName,
        public string $email,
        public string $password,
    ) {}
}
