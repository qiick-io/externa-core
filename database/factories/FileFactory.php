<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Enums\FileAccessEnum;
use App\Enums\FileTypeEnum;
use App\Models\File;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * Database row of a stored file in the root folder that inherits its access (`access` null).
 * The factory writes no bytes: a test that reads the file fakes the disk and puts content
 * at `storage_path` itself.
 *
 * @extends Factory<File>
 */
class FileFactory extends Factory
{
    protected $model = File::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $name = fake()->unique()->slug(2).'.txt';

        return [
            'type' => FileTypeEnum::File,
            'access' => null,
            'name' => $name,
            'path' => '/'.$name,
            'disk' => 'assets',
            'storage_path' => now()->format('Y/m').'/'.$name,
            'mime_type' => 'text/plain',
            'extension' => 'txt',
            'size' => fake()->numberBetween(1, 100_000),
            'hash' => hash('sha256', $name),
        ];
    }

    /** A folder: no bytes, no mime type, no size. */
    public function folder(): static
    {
        return $this->state(function (): array {
            $name = fake()->unique()->slug(2);

            return [
                'type' => FileTypeEnum::Folder,
                'name' => $name,
                'path' => '/'.$name,
                'storage_path' => null,
                'mime_type' => null,
                'extension' => null,
                'size' => null,
                'hash' => null,
            ];
        });
    }

    public function inFolder(File $folder): static
    {
        return $this->state(fn (array $attributes): array => [
            'parent_id' => $folder->id,
            'path' => rtrim((string) $folder->path, '/').'/'.$attributes['name'],
        ]);
    }

    /** A JPEG image with dimensions, as the upload pipeline stores it. */
    public function image(int $width = 1600, int $height = 900): static
    {
        return $this->state(function () use ($width, $height): array {
            $name = fake()->unique()->slug(2).'.jpg';

            return [
                'name' => $name,
                'path' => '/'.$name,
                'storage_path' => now()->format('Y/m').'/'.$name,
                'mime_type' => 'image/jpeg',
                'extension' => 'jpg',
                'width' => $width,
                'height' => $height,
            ];
        });
    }

    public function private(): static
    {
        return $this->state(fn (): array => [
            'access' => FileAccessEnum::Private,
        ]);
    }

    public function public(): static
    {
        return $this->state(fn (): array => [
            'access' => FileAccessEnum::Public,
        ]);
    }
}
