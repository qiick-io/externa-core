<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

/**
 * Key-value setting row scoped to project or user.
 *
 * @property int $id
 * @property string $scope
 * @property int|null $scope_id
 * @property string $group
 * @property string $key
 * @property mixed $value
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
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
