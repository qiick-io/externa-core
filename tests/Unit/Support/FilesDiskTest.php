<?php

declare(strict_types=1);

use App\Support\Files\FilesDisk;
use Illuminate\Support\Facades\Config;

test('allowed disks always include local assets family and remote backends', function (): void {
    Config::set('files.disk', 'assets');

    expect(FilesDisk::allowed())->toEqualCanonicalizing([
        'assets',
        FilesDisk::PRIVATE_ASSETS,
        's3',
        'gcs',
        'azure',
    ]);
});

test('allowed disks include the configured FILES_DISK default when custom', function (): void {
    Config::set('files.disk', 'custom_remote');

    expect(FilesDisk::allowed())
        ->toContain('custom_remote', 'gcs', 'azure', 's3', 'assets', FilesDisk::PRIVATE_ASSETS);
});

test('default reads files.disk config', function (): void {
    Config::set('files.disk', 'gcs');

    expect(FilesDisk::default())->toBe('gcs');
});

test('forEffectivePrivacy leaves gcs and azure unchanged', function (): void {
    expect(FilesDisk::forEffectivePrivacy(true, 'gcs'))->toBe('gcs')
        ->and(FilesDisk::forEffectivePrivacy(false, 'azure'))->toBe('azure')
        ->and(FilesDisk::forEffectivePrivacy(true, 's3'))->toBe('s3');
});

test('forEffectivePrivacy maps local assets family by privacy', function (): void {
    expect(FilesDisk::forEffectivePrivacy(true, 'assets'))->toBe(FilesDisk::PRIVATE_ASSETS)
        ->and(FilesDisk::forEffectivePrivacy(false, FilesDisk::PRIVATE_ASSETS))->toBe('assets');
});

test('filesystems config declares gcs and azure drivers', function (): void {
    expect(config('filesystems.disks.gcs.driver'))->toBe('gcs')
        ->and(config('filesystems.disks.azure.driver'))->toBe('azure-storage-blob')
        ->and(config('filesystems.disks.s3.driver'))->toBe('s3')
        ->and(config('filesystems.disks.assets.driver'))->toBe('local');
});
