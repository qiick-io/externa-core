<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('chat_reads', function (Blueprint $table) {
            $table->id();
            $table->foreignUuid('chat_id')->constrained('chats')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->unsignedBigInteger('last_read_message_id')->nullable();
            $table->timestamp('last_read_at')->nullable();
            $table->timestamps();

            $table->unique(['chat_id', 'user_id']);
            $table->index(['user_id', 'chat_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('chat_reads');
    }
};
