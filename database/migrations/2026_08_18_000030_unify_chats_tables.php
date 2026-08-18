<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

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

        $this->moveLegacyItemChats();

        Schema::dropIfExists('collection_item_chat_reactions');
        Schema::dropIfExists('collection_item_chat_attachments');
        Schema::dropIfExists('collection_item_chat_messages');
    }

    public function down(): void
    {
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

        Schema::dropIfExists('chat_reactions');
        Schema::dropIfExists('chat_attachments');
        Schema::dropIfExists('chat_messages');
        Schema::dropIfExists('chat_participants');
        Schema::dropIfExists('chats');
    }

    private function moveLegacyItemChats(): void
    {
        if (! Schema::hasTable('collection_item_chat_messages')) {
            return;
        }

        $itemIds = DB::table('collection_item_chat_messages')
            ->select('collection_item_id')
            ->distinct()
            ->pluck('collection_item_id');

        $chatByItem = [];

        foreach ($itemIds as $itemId) {
            $first = DB::table('collection_item_chat_messages')
                ->where('collection_item_id', $itemId)
                ->orderBy('id')
                ->first();

            if ($first === null) {
                continue;
            }

            $chatId = (string) Str::uuid();
            $chatByItem[(int) $itemId] = $chatId;

            DB::table('chats')->insert([
                'id' => $chatId,
                'kind' => 'item',
                'collection_id' => $first->collection_id,
                'collection_item_id' => $itemId,
                'created_by_user_id' => $first->user_id,
                'created_at' => $first->created_at,
                'updated_at' => $first->updated_at,
                'deleted_at' => null,
            ]);
        }

        $oldMessages = DB::table('collection_item_chat_messages')->orderBy('id')->get();

        foreach ($oldMessages as $row) {
            $chatId = $chatByItem[(int) $row->collection_item_id] ?? null;
            if ($chatId === null) {
                continue;
            }

            DB::table('chat_messages')->insert([
                'id' => $row->id,
                'chat_id' => $chatId,
                'user_id' => $row->user_id,
                'body' => $row->body,
                'mentioned_user_ids' => $row->mentioned_user_ids,
                'reply_to_id' => $row->reply_to_id,
                'pinned_at' => $row->pinned_at,
                'forwarded_from_message_id' => $row->forwarded_from_message_id,
                'forwarded_from_author_name' => $row->forwarded_from_author_name,
                'created_at' => $row->created_at,
                'updated_at' => $row->updated_at,
                'deleted_at' => $row->deleted_at,
            ]);
        }

        if (Schema::hasTable('collection_item_chat_attachments')) {
            foreach (DB::table('collection_item_chat_attachments')->get() as $row) {
                DB::table('chat_attachments')->insert((array) $row);
            }
        }

        if (Schema::hasTable('collection_item_chat_reactions')) {
            foreach (DB::table('collection_item_chat_reactions')->get() as $row) {
                DB::table('chat_reactions')->insert((array) $row);
            }
        }

        $this->bumpChatIdSequences();
    }

    /**
     * Explicit id copies leave Postgres/MySQL/SQLite sequences at 1.
     */
    private function bumpChatIdSequences(): void
    {
        $driver = Schema::getConnection()->getDriverName();

        foreach (['chat_messages', 'chat_reactions', 'chat_participants'] as $table) {
            if (! Schema::hasTable($table)) {
                continue;
            }

            $max = (int) (DB::table($table)->max('id') ?? 0);
            if ($max < 1) {
                continue;
            }

            if ($driver === 'pgsql') {
                DB::select("SELECT setval(pg_get_serial_sequence('{$table}', 'id'), {$max})");
            } elseif (in_array($driver, ['mysql', 'mariadb'], true)) {
                DB::statement("ALTER TABLE {$table} AUTO_INCREMENT = ".($max + 1));
            } elseif ($driver === 'sqlite') {
                $exists = DB::table('sqlite_sequence')->where('name', $table)->exists();
                if ($exists) {
                    DB::table('sqlite_sequence')->where('name', $table)->update(['seq' => $max]);
                } else {
                    DB::table('sqlite_sequence')->insert(['name' => $table, 'seq' => $max]);
                }
            }
        }
    }
};
