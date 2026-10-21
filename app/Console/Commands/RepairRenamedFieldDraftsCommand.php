<?php

namespace App\Console\Commands;

use App\Services\Collections\RepairRenamedFieldSnapshotsService;
use Illuminate\Console\Command;
use InvalidArgumentException;
use Symfony\Component\Console\Attribute\AsCommand;
use Throwable;

/**
 * Repair draft_data / revision snapshots left with pre-rename field-name keys (#218).
 */
#[AsCommand(name: 'externa:repair-renamed-field-drafts')]
class RepairRenamedFieldDraftsCommand extends Command
{
    protected $signature = 'externa:repair-renamed-field-drafts
        {--apply : Persist remaps (default is dry-run)}
        {--map=* : Explicit mapping collection:old=new (collection id or slug; repeatable)}';

    protected $description = 'Remap orphan field-name keys in draft_data and revisions after a pre-1.2.1 rename (dry-run by default)';

    public function handle(RepairRenamedFieldSnapshotsService $repair): int
    {
        $apply = (bool) $this->option('apply');
        /** @var list<string> $maps */
        $maps = array_values(array_filter(
            (array) $this->option('map'),
            fn ($v): bool => is_string($v) && $v !== '',
        ));

        $mode = $apply ? 'apply' : 'dry-run';
        $this->info("externa:repair-renamed-field-drafts [{$mode}]");
        $this->line('Mappings: CollectionField activity-log renames + optional --map=collection:old=new.');
        $this->line('Never guesses by similarity; never overwrites a value already under the new key.');
        $this->newLine();

        try {
            $result = $repair->run($apply, $maps);
        } catch (InvalidArgumentException $e) {
            $this->error($e->getMessage());

            return self::FAILURE;
        } catch (Throwable $e) {
            $this->error($e->getMessage());

            return self::FAILURE;
        }

        if ($result['remapped'] !== []) {
            $this->info('Remaps (old → new):');
            foreach ($result['remapped'] as $row) {
                $valuePreview = $this->previewValue($row['value']);
                $this->line(sprintf(
                    '  %s item #%d %s: %s → %s (%s)',
                    $row['collection'],
                    $row['item_id'],
                    $row['source'],
                    $row['old'],
                    $row['new'],
                    $valuePreview,
                ));
            }
            $this->newLine();
        }

        if ($result['conflicts'] !== []) {
            $this->warn('Conflicts (new key already set; left untouched):');
            foreach ($result['conflicts'] as $row) {
                $this->line(sprintf(
                    '  conflict %s item #%d %s: %s → %s',
                    $row['collection'],
                    $row['item_id'],
                    $row['source'],
                    $row['old'],
                    $row['new'],
                ));
            }
            $this->newLine();
        }

        if ($result['unmappable'] !== []) {
            $this->warn('Unmappable orphan keys (pass --map=collection:old=new):');
            foreach ($result['unmappable'] as $row) {
                $this->line(sprintf(
                    '  unmappable %s item #%d %s: %s',
                    $row['collection'],
                    $row['item_id'],
                    $row['source'],
                    $row['key'],
                ));
            }
            $this->newLine();
        }

        $this->info(sprintf(
            'Summary: remapped=%d conflict=%d unmappable=%d%s',
            $result['remapped_count'],
            $result['conflict_count'],
            $result['unmappable_count'],
            $apply ? '' : ' (dry-run; re-run with --apply to write)',
        ));

        return self::SUCCESS;
    }

    private function previewValue(mixed $value): string
    {
        if (is_string($value)) {
            $trimmed = mb_strlen($value) > 40 ? mb_substr($value, 0, 37).'...' : $value;

            return json_encode($trimmed, JSON_UNESCAPED_UNICODE) ?: '""';
        }

        if (is_int($value) || is_float($value) || is_bool($value) || $value === null) {
            return json_encode($value) ?: 'null';
        }

        $encoded = json_encode($value, JSON_UNESCAPED_UNICODE);
        if (! is_string($encoded)) {
            return '[unprintable]';
        }

        return mb_strlen($encoded) > 60 ? mb_substr($encoded, 0, 57).'...' : $encoded;
    }
}
