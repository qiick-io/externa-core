<?php

use App\Enums\FieldTypeEnum;
use App\Jobs\GitExport\ExportCollectionItemToGitJob;
use App\Models\Collection;
use App\Models\CollectionField;
use App\Services\Collections\CollectionItemDataNormalizer;
use App\Services\Collections\CollectionItemPublisher;
use App\Services\Collections\CollectionItemValuesWriter;
use App\Services\GitExport\GitExportDispatcher;
use App\Services\GitExport\GitExportDocumentBuilder;
use App\Services\GitExport\GitExportRepository;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Facades\Queue;

beforeEach(function (): void {
    $this->withoutVite();
    config([
        'git_export.enabled' => true,
        'git_export.remote_url' => 'git@example.test:org/content.git',
        'git_export.branch' => 'main',
        'git_export.work_dir' => storage_path('framework/testing/git-export-'.uniqid()),
        'git_export.format' => 'json',
        'git_export.dry_run' => true,
        'git_export.collection_slugs' => '*',
        'git_export.ssh_key_path' => null,
    ]);
});

afterEach(function (): void {
    $dir = config('git_export.work_dir');
    if (is_string($dir) && str_contains($dir, 'framework/testing/git-export') && is_dir($dir)) {
        File::deleteDirectory($dir);
    }
});

function gitExportKitchen(): array
{
    $collection = Collection::factory()->create([
        'slug' => 'posts',
        'versioning' => true,
    ]);
    CollectionField::factory()->create([
        'collection_id' => $collection->id,
        'name' => 'title',
        'type' => FieldTypeEnum::String,
    ]);

    return compact('collection');
}

test('git export dispatcher is a no-op when disabled', function () {
    Queue::fake();
    config(['git_export.enabled' => false]);

    ['collection' => $collection] = gitExportKitchen();
    $item = $collection->items()->create([]);

    app(GitExportDispatcher::class)->dispatchItem($item);

    Queue::assertNothingPushed();
});

test('publish queues git export job when enabled', function () {
    Queue::fake();
    ['collection' => $collection] = gitExportKitchen();
    $item = $collection->items()->create([
        'draft_data' => ['title' => 'Hello'],
    ]);

    app(CollectionItemPublisher::class)->promote($item, $collection);

    Queue::assertPushed(ExportCollectionItemToGitJob::class, function (ExportCollectionItemToGitJob $job) use ($item): bool {
        return $job->itemId === $item->id;
    });
});

test('document builder writes json under content/{slug}/{id}.json', function () {
    ['collection' => $collection] = gitExportKitchen();
    $item = $collection->items()->create([]);
    $normalizer = app(CollectionItemDataNormalizer::class);
    app(CollectionItemValuesWriter::class)->sync(
        $item,
        $collection,
        $normalizer->normalize($collection, ['title' => 'Hello'], true),
        created: true,
    );

    $built = app(GitExportDocumentBuilder::class)->build($item->fresh()->load('collection'));

    expect($built)->not->toBeNull()
        ->and($built['path'])->toBe('content/posts/'.$item->id.'.json')
        ->and($built['contents'])->toContain('"title": "Hello"');
});

test('export job writes file and commits with dry-run (no push)', function () {
    Process::preventStrayProcesses();
    Process::fake(function ($process) {
        $command = $process->command;
        $args = is_array($command) ? $command : preg_split('/\s+/', (string) $command);

        return Process::result(
            output: in_array('status', $args ?? [], true) ? "M content/x.json\n" : '',
        );
    });

    // Pretend worktree already exists so ensureRepository takes fetch path.
    $dir = config('git_export.work_dir');
    File::ensureDirectoryExists($dir.'/.git');

    ['collection' => $collection] = gitExportKitchen();
    $item = $collection->items()->create([]);
    $normalizer = app(CollectionItemDataNormalizer::class);
    app(CollectionItemValuesWriter::class)->sync(
        $item,
        $collection,
        $normalizer->normalize($collection, ['title' => 'Hello'], true),
        created: true,
    );

    (new ExportCollectionItemToGitJob($item->id))->handle(
        app(GitExportRepository::class),
        app(GitExportDocumentBuilder::class),
    );

    $path = $dir.'/content/posts/'.$item->id.'.json';
    expect(File::exists($path))->toBeTrue()
        ->and(File::get($path))->toContain('Hello');

    Process::assertRan(function ($process): bool {
        $command = $process->command;
        $flat = is_array($command) ? implode(' ', $command) : (string) $command;

        return str_contains($flat, 'commit');
    });
    Process::assertDidntRun(function ($process): bool {
        $command = $process->command;
        $flat = is_array($command) ? implode(' ', $command) : (string) $command;

        return str_contains($flat, 'push');
    });
});

test('ensureRepository bootstraps empty bare remote without existing branch', function () {
    $bare = storage_path('framework/testing/git-export-bare-'.uniqid().'.git');
    $work = storage_path('framework/testing/git-export-work-'.uniqid());
    File::ensureDirectoryExists($bare);
    Process::path($bare)->run(['git', 'init', '--bare', '-b', 'main'])->throw();

    config([
        'git_export.remote_url' => 'file://'.$bare,
        'git_export.work_dir' => $work,
        'git_export.branch' => 'main',
        'git_export.dry_run' => false,
        'git_export.commit_name' => 'Externa Test',
        'git_export.commit_email' => 'git-export@externa.test',
    ]);

    $repo = app(GitExportRepository::class);
    $repo->ensureRepository();

    expect(is_dir($work.'/.git'))->toBeTrue();

    $repo->writeFile('content/posts/1.json', '{"title":"Hello"}');
    $repo->commitAndPush('export: posts#1');

    $log = Process::path($bare)->run(['git', 'log', '--oneline', '-1']);
    expect($log->successful())->toBeTrue()
        ->and($log->output())->toContain('export: posts#1');

    File::deleteDirectory($work);
    File::deleteDirectory($bare);
});

test('artisan git-export:sync --dry-run writes files without remote', function () {
    config([
        'git_export.remote_url' => null,
        'git_export.enabled' => false,
    ]);

    ['collection' => $collection] = gitExportKitchen();
    $item = $collection->items()->create([]);
    $normalizer = app(CollectionItemDataNormalizer::class);
    app(CollectionItemValuesWriter::class)->sync(
        $item,
        $collection,
        $normalizer->normalize($collection, ['title' => 'Sync'], true),
        created: true,
    );

    $this->artisan('git-export:sync', ['--dry-run' => true, '--collection' => 'posts'])
        ->assertSuccessful();

    $path = config('git_export.work_dir').'/content/posts/'.$item->id.'.json';
    expect(File::exists($path))->toBeTrue();
});
