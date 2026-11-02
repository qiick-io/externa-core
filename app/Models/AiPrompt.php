<?php

namespace App\Models;

use Database\Factories\AiPromptFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Project-level saved prompt selectable as AppAssistant conversation context.
 *
 * @property int $id
 * @property string $name
 * @property string|null $description
 * @property string $body
 * @property int|null $created_by
 * @property int|null $updated_by
 */
class AiPrompt extends Model
{
    /** @use HasFactory<AiPromptFactory> */
    use HasFactory;

    /**
     * @var list<string>
     */
    protected $fillable = [
        'name',
        'description',
        'body',
        'created_by',
        'updated_by',
    ];

    /**
     * @return BelongsTo<User, $this>
     */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function updater(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }
}
