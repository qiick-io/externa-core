<?php

declare(strict_types=1);

use App\Services\Users\UserPublicIdBackfillService;
use Illuminate\Support\Facades\Artisan;

test('users:backfill-public-id dry-run reports zero when every user has a public_id', function (): void {
    expect(app(UserPublicIdBackfillService::class)->missingCount())->toBe(0);
    expect(Artisan::call('users:backfill-public-id', ['--dry-run' => true]))->toBe(0);
    expect(Artisan::output())->toContain('[dry-run] users missing public_id: 0');
});
