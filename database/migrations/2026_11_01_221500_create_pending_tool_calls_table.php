<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('pending_tool_calls', function (Blueprint $table): void {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->string('tool', 128);
            $table->string('surface', 32)->default('mcp');
            $table->json('arguments');
            $table->string('status', 32)->default('pending');
            $table->foreignId('requested_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('resolved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('expires_at');
            $table->timestamp('resolved_at')->nullable();
            $table->text('result')->nullable();
            $table->string('decision_note')->nullable();
            $table->timestamps();

            $table->index(['status', 'expires_at']);
            $table->index(['tool', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('pending_tool_calls');
    }
};
