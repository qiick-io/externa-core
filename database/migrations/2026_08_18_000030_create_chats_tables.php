<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('chats', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('kind', 32);
            $table->foreignId('collection_id')->nullable()->constrained('collections')->cascadeOnDelete();
            $table->foreignId('collection_item_id')->nullable()->constrained('collections_items')->cascadeOnDelete();
            $table->foreignId('created_by_user_id')->constrained('users')->cascadeOnDelete();
            $table->timestamps();
            $table->softDeletes();

            $table->unique('collection_item_id');
            $table->index(['kind', 'updated_at']);
        });

        Schema::create('chat_participants', function (Blueprint $table) {
            $table->id();
            $table->foreignUuid('chat_id')->constrained('chats')->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained('users')->cascadeOnDelete();
            $table->foreignId('user_group_id')->nullable()->constrained('user_groups')->cascadeOnDelete();
            $table->string('source', 32);
            $table->timestamp('archived_at')->nullable();
            $table->timestamps();

            $table->unique(['chat_id', 'user_id']);
            $table->unique(['chat_id', 'user_group_id']);
        });

        Schema::create('chat_messages', function (Blueprint $table) {
            $table->id();
            $table->foreignUuid('chat_id')->constrained('chats')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->text('body');
            $table->json('mentioned_user_ids')->nullable();
            $table->foreignId('reply_to_id')->nullable()->constrained('chat_messages')->nullOnDelete();
            $table->timestamp('pinned_at')->nullable();
            $table->foreignId('forwarded_from_message_id')->nullable()->constrained('chat_messages')->nullOnDelete();
            $table->string('forwarded_from_author_name')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['chat_id', 'id']);
            $table->index(['chat_id', 'pinned_at']);
        });

        Schema::create('chat_attachments', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignId('message_id')->nullable()->constrained('chat_messages')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('original_name');
            $table->string('mime_type', 127);
            $table->string('disk', 32)->default('local');
            $table->string('path');
            $table->string('preview_path')->nullable();
            $table->string('preview_mime', 127)->nullable();
            $table->unsignedBigInteger('size');
            $table->foreignId('transferred_file_id')->nullable()->constrained('files')->nullOnDelete();
            $table->timestamp('expires_at')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'message_id']);
            $table->index(['expires_at']);
        });

        Schema::create('chat_reactions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('message_id')->constrained('chat_messages')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('emoji', 16);
            $table->timestamps();

            $table->unique(['message_id', 'user_id', 'emoji']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('chat_reactions');
        Schema::dropIfExists('chat_attachments');
        Schema::dropIfExists('chat_messages');
        Schema::dropIfExists('chat_participants');
        Schema::dropIfExists('chats');
    }
};
