<?php

declare(strict_types=1);

namespace App\Http\Requests\Concerns;

use App\Support\Files\FilesDisk;
use Illuminate\Validation\Rule;

/**
 * Field rules shared by the admin file manager form requests.
 *
 * The same `parent_id`, `disk`, tag and attachment-target fields appear in many file
 * manager endpoints; keeping their rules here gives each one a single definition.
 */
trait ValidatesFileManagerFieldsTrait
{
    /**
     * Optional target folder: an existing file manager row.
     *
     * @return list<string>
     */
    protected function parentIdRules(): array
    {
        return ['nullable', 'integer', 'exists:files,id'];
    }

    /**
     * Optional storage disk, limited to the disks the file manager may write to.
     *
     * @return list<mixed>
     */
    protected function diskRules(): array
    {
        return ['nullable', 'string', Rule::in(FilesDisk::allowed())];
    }

    /**
     * One tag name inside a `tags` array.
     *
     * @return list<string>
     */
    protected function tagNameRules(): array
    {
        return ['string', 'max:100'];
    }

    /**
     * The polymorphic model a file is attached to or detached from.
     *
     * @return array<string, list<string>>
     */
    protected function attachmentTargetRules(): array
    {
        return [
            'model_type' => ['required', 'string'],
            'model_id' => ['required', 'integer'],
            'role' => ['nullable', 'string', 'max:255'],
        ];
    }
}
