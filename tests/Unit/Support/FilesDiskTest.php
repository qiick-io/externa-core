<?php

declare(strict_types=1);

use App\Services\Files\FilesDiskService;
use Illuminate\Support\Facades\Config;

test('allowed disks always include local assets family and remote backends', function (): void {
    Config::set('files.disk', 'assets');

    expect(FilesDiskService::allowed())->toEqualCanonicalizing([
        'assets',
        FilesDiskService::PRIVATE_ASSETS,
        's3',
        'gcs',
        'azure',
    ]);
});

test('allowed disks include the configured FILES_DISK default when custom', function (): void {
    Config::set('files.disk', 'custom_remote');

    expect(FilesDiskService::allowed())
        ->toContain('custom_remote', 'gcs', 'azure', 's3', 'assets', FilesDiskService::PRIVATE_ASSETS);
});

test('default reads files.disk config', function (): void {
    Config::set('files.disk', 'gcs');

    expect(FilesDiskService::default())->toBe('gcs');
});

test('forEffectivePrivacy leaves gcs and azure unchanged', function (): void {
    expect(FilesDiskService::forEffectivePrivacy(true, 'gcs'))->toBe('gcs')
        ->and(FilesDiskService::forEffectivePrivacy(false, 'azure'))->toBe('azure')
        ->and(FilesDiskService::forEffectivePrivacy(true, 's3'))->toBe('s3');
});

test('forEffectivePrivacy maps local assets family by privacy', function (): void {
    expect(FilesDiskService::forEffectivePrivacy(true, 'assets'))->toBe(FilesDiskService::PRIVATE_ASSETS)
        ->and(FilesDiskService::forEffectivePrivacy(false, FilesDiskService::PRIVATE_ASSETS))->toBe('assets');
});

test('filesystems config declares gcs and azure drivers', function (): void {
    expect(config('filesystems.disks.gcs.driver'))->toBe('gcs')
        ->and(config('filesystems.disks.azure.driver'))->toBe('azure-storage-blob')
        ->and(config('filesystems.disks.s3.driver'))->toBe('s3')
        ->and(config('filesystems.disks.assets.driver'))->toBe('local');
});
