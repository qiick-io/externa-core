<?php

namespace App\Models;

use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Model;

/**
 * Key-value setting row scoped to project or user.
 *
 * `scope_ref` is the uniqueness key (`''` for instance). `scope_id` is dual-written for one
 * release (#827 step 4).
 *
 * @property int $id
 * @property string $scope
 * @property int|null $scope_id
 * @property string $scope_ref
 * @property string $group
 * @property string $key
 * @property mixed $value
 * @property CarbonImmutable|null $created_at
 * @property CarbonImmutable|null $updated_at
 */
class Setting extends Model
{
    protected $table = 'settings';

    /**
     * @var list<string>
     */
    protected $fillable = [
        'scope',
        'scope_id',
        'scope_ref',
        'group',
        'key',
        'value',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'value' => 'json',
        ];
    }
}
