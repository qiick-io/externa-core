<?php

declare(strict_types=1);

namespace App\Services\Upgrade;

use Illuminate\Contracts\Process\ProcessResult;
use Illuminate\Support\Facades\Process;

/**
 * Runs the git commands of `externa:upgrade --sync-upstream` inside one working directory.
 *
 * The directory defaults to the app's base path. It is a constructor argument so tests can
 * point the command at a throwaway repository instead of the checkout that runs the suite.
 */
class UpgradeGitService
{
    private readonly string $workingDirectory;

    public function __construct(?string $workingDirectory = null)
    {
        $this->workingDirectory = $workingDirectory ?? base_path();
    }

    /**
     * @param  list<string>  $arguments  Arguments after `git`, one per element (never shell-parsed).
     */
    public function run(array $arguments): ProcessResult
    {
        return Process::path($this->workingDirectory)->run(array_merge(['git'], $arguments));
    }
}
