<?php

declare(strict_types=1);

namespace App\Exceptions;

use RuntimeException;

/**
 * A migration whose {@see Migration::down()} must not run: rolling it back would destroy
 * data that cannot be reconstructed. Operators restore a pre-upgrade backup instead.
 */
final class IrreversibleMigrationException extends RuntimeException {}
