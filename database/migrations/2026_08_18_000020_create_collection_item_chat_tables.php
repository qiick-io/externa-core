<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::dropIfExists('collection_item_comment_attachments');
        Schema::dropIfExists('collection_item_comments');

        Schema::create('collection_item_chat_messages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('collection_id')->constrained('collections')->cascadeOnDelete();
            $table->foreignId('collection_item_id')->constrained('collections_items')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->text('body');
            $table->json('mentioned_user_ids')->nullable();
            $table->foreignId('reply_to_id')->nullable()->constrained('collection_item_chat_messages')->nullOnDelete();
            $table->timestamp('pinned_at')->nullable();
            $table->foreignId('forwarded_from_message_id')->nullable()->constrained('collection_item_chat_messages')->nullOnDelete();
            $table->string('forwarded_from_author_name')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['collection_item_id', 'id']);
            $table->index(['collection_item_id', 'pinned_at']);
        });

        Schema::create('collection_item_chat_attachments', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignId('message_id')->nullable()->constrained('collection_item_chat_messages')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('original_name');
            $table->string('mime_type', 127);
            $table->string('disk', 32)->default('local');
            $table->string('path');
            $table->unsignedBigInteger('size');
            $table->foreignId('transferred_file_id')->nullable()->constrained('files')->nullOnDelete();
            $table->timestamp('expires_at')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'message_id']);
            $table->index(['expires_at']);
        });

        Schema::create('collection_item_chat_reactions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('message_id')->constrained('collection_item_chat_messages')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('emoji', 16);
            $table->timestamps();

            $table->unique(['message_id', 'user_id', 'emoji']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('collection_item_chat_reactions');
        Schema::dropIfExists('collection_item_chat_attachments');
        Schema::dropIfExists('collection_item_chat_messages');
    }
};
