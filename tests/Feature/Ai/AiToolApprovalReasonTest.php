<?php

declare(strict_types=1);

use App\Ai\Tools\ManageCollections;
use Laravel\Ai\Approvals\Approval;
use Laravel\Ai\Tools\Request;

/**
 * The approval reason is a contract with the chat UI: `isDestructiveApproval()`
 * in `resources/js/lib/ai-chat.ts` turns Approve red only when the reason ends
 * in " deletes data.". A write must end in " writes data." and a read needs no
 * approval.
 */
function approvalFor(string $action): Approval|bool
{
    $tool = app(ManageCollections::class);
    $needsApproval = new ReflectionMethod($tool, 'needsApproval');

    return $needsApproval->invoke($tool, new Request(['action' => $action]));
}

it('marks a delete as a call that deletes data', function (): void {
    $approval = approvalFor('delete');

    expect($approval)->toBeInstanceOf(Approval::class)
        ->and($approval->reason)->toBe('ManageCollections delete deletes data.');
});

it('marks a write as a call that writes data', function (): void {
    $approval = approvalFor('apply_collection_pack');

    expect($approval)->toBeInstanceOf(Approval::class)
        ->and($approval->reason)->toBe('ManageCollections apply_collection_pack writes data.');
});

it('lets a read run without approval', function (): void {
    expect(approvalFor('list'))->toBeFalse();
});
