<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Enums\PendingToolCallStatusEnum;
use App\Models\PendingToolCall;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<PendingToolCall>
 */
class PendingToolCallFactory extends Factory
{
    protected $model = PendingToolCall::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'uuid' => (string) Str::uuid(),
            'tool' => 'ManageFiles',
            'surface' => 'mcp',
            'arguments' => [
                'action' => 'create_folder',
                'name' => 'demo',
            ],
            'status' => PendingToolCallStatusEnum::Pending,
            'requested_by' => User::factory(),
            'resolved_by' => null,
            'expires_at' => now()->addMinutes(15),
            'resolved_at' => null,
            'result' => null,
            'decision_note' => null,
        ];
    }

    public function expired(): static
    {
        return $this->state(fn (): array => [
            'expires_at' => now()->subMinute(),
        ]);
    }

    public function rejected(): static
    {
        return $this->state(fn (): array => [
            'status' => PendingToolCallStatusEnum::Rejected,
            'resolved_at' => now(),
            'resolved_by' => User::factory(),
        ]);
    }
}
