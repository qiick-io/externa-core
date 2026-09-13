<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Laravel\Fortify\Features;

/**
 * Base test case with application-wide testing helpers.
 */
abstract class TestCase extends BaseTestCase
{
    /**
     * Skip the current test when the given Fortify feature flag is disabled.
     *
     * @param  non-empty-string  $feature  Fortify feature name (see {@see Features} constants).
     * @param  string|null  $message  Optional skip reason shown in the test output.
     */
    protected function skipUnlessFortifyFeature(string $feature, ?string $message = null): void
    {
        if (! Features::enabled($feature)) {
            $this->markTestSkipped($message ?? "Fortify feature [{$feature}] is not enabled.");
        }
    }
}
