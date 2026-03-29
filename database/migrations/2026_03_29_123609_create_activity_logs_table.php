<?php

use App\Enums\ActivityLogActionEnum;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // Create the 'activity_logs' table
        Schema::create('activity_logs', function (Blueprint $table) {
            // Primary key
            $table->id();

            // Nullable foreign key referencing 'users' table, sets to null on user deletion
            $table->foreignId('user_id')
                ->nullable()
                ->constrained('users')
                ->nullOnDelete();

            // Polymorphic relation columns: entity_id & entity_type
            $table->morphs('entity');

            // Enum for the action performed, using values from ActivityLogActionEnum
            $table->enum('action', [
                ActivityLogActionEnum::GET->value,
                ActivityLogActionEnum::SHOW->value,
                ActivityLogActionEnum::STORE->value,
                ActivityLogActionEnum::UPDATE->value,
                ActivityLogActionEnum::DESTROY->value,
                ActivityLogActionEnum::DELETE->value,
                ActivityLogActionEnum::RESTORE->value,
            ]);

            // HTTP method or custom method, nullable
            $table->string('method')->nullable();

            // JSON field storing related request/response or meta data, nullable
            $table->json('payload')->nullable();

            // The date and time the action occurred
            $table->dateTime('date');

            // Laravel's created_at and updated_at timestamps
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // Drop the 'activity_logs' table if it exists
        Schema::dropIfExists('activity_logs');
    }
};
