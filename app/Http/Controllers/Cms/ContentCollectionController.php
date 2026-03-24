<?php

namespace App\Http\Controllers\Cms;

use App\Enums\FieldType;
use App\Http\Controllers\Controller;
use App\Http\Requests\Cms\StoreContentCollectionRequest;
use App\Http\Requests\Cms\UpdateContentCollectionRequest;
use App\Http\Requests\Cms\UpsertSingletonItemRequest;
use App\Http\Resources\ItemResource;
use App\Models\ContentCollection;
use App\Models\Item;
use App\Services\Cms\ItemDataNormalizer;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Inertia\Inertia;
use Inertia\Response;

class ContentCollectionController extends Controller
{
    public function __construct(
        private ItemDataNormalizer $itemDataNormalizer,
    ) {}

    public function index(): Response
    {
        $collections = ContentCollection::query()->ordered()->get();

        return Inertia::render('cms/collections/index', [
            'collections' => $collections,
        ]);
    }

    public function store(StoreContentCollectionRequest $request): RedirectResponse
    {
        $collection = ContentCollection::query()->create($request->validated());

        return redirect()->route('cms.collections.show', $collection)
            ->with('success', __('Collection created.'));
    }

    public function show(Request $request, ContentCollection $collection): Response
    {
        $collection->load(['fields' => fn ($q) => $q->ordered()]);

        $singletonItem = null;
        /** @var array<string, mixed>|null */
        $singletonRawData = null;

        /** @var list<array{id: int, label: string}> $itemPicker */
        $itemPicker = [];
        $selectedItemId = null;
        /** @var array<string, mixed>|null */
        $editableRawData = null;

        if ($collection->is_singleton) {
            $first = $collection->items()->with(['collection' => fn ($q) => $q->with(['fields' => fn ($fq) => $fq->ordered()])])->first();
            $singletonItem = $first instanceof Item ? (new ItemResource($first))->toArray($request) : null;
            if ($first instanceof Item) {
                $raw = $first->data;
                $singletonRawData = is_array($raw) ? $raw : null;
            }
        } else {
            $items = $collection->items()->orderByDesc('id')->get();
            foreach ($items as $item) {
                $itemPicker[] = [
                    'id' => $item->id,
                    'label' => $this->pickerLabelForItem($collection, $item),
                ];
            }

            $requested = $request->query('item');
            $selected = null;
            if ($items->isNotEmpty()) {
                if ($requested !== null && $requested !== '' && is_numeric($requested)) {
                    $selected = $items->firstWhere('id', (int) $requested);
                }
                if ($selected === null) {
                    $selected = $items->first();
                }
            }

            if ($selected instanceof Item) {
                $selectedItemId = $selected->id;
                $raw = $selected->data;
                $editableRawData = is_array($raw) ? $raw : null;
            }
        }

        return Inertia::render('cms/collections/show', [
            'collection' => $collection,
            'singletonItem' => $singletonItem,
            'singletonRawData' => $singletonRawData,
            'itemPicker' => $itemPicker,
            'selectedItemId' => $selectedItemId,
            'editableRawData' => $editableRawData,
        ]);
    }

    public function update(UpdateContentCollectionRequest $request, ContentCollection $collection): RedirectResponse
    {
        $collection->update($request->validated());

        return redirect()->route('cms.collections.show', $collection)
            ->with('success', __('Collection updated.'));
    }

    public function destroy(ContentCollection $collection): RedirectResponse
    {
        $collection->delete();

        return redirect()->route('cms.collections.index')
            ->with('success', __('Collection deleted.'));
    }

    public function upsertSingletonContent(UpsertSingletonItemRequest $request, ContentCollection $collection): RedirectResponse
    {
        abort_unless($collection->is_singleton, 404);

        $incoming = $request->validated('data') ?? [];
        if (! is_array($incoming)) {
            $incoming = [];
        }

        $item = $collection->items()->first();

        if (! $item instanceof Item) {
            $normalized = $this->itemDataNormalizer->normalize($collection, $incoming);
            $collection->items()->create([
                'data' => $normalized,
            ]);

            return redirect()->route('cms.collections.show', $collection)
                ->with('success', __('Content saved.'));
        }

        $data = $item->data ?? [];
        if (! is_array($data)) {
            $data = [];
        }

        foreach ($incoming as $key => $value) {
            if (is_array($value) && isset($data[$key]) && is_array($data[$key])) {
                $data[$key] = array_merge($data[$key], $value);
            } else {
                $data[$key] = $value;
            }
        }

        $normalized = $this->itemDataNormalizer->normalize($collection, $data);

        $item->update(['data' => $normalized]);

        return redirect()->route('cms.collections.show', $collection)
            ->with('success', __('Content updated.'));
    }

    private function pickerLabelForItem(ContentCollection $collection, Item $item): string
    {
        $data = $item->data ?? [];
        if (! is_array($data)) {
            return 'Item #'.$item->id;
        }

        foreach ($collection->fields as $field) {
            if ($field->type !== FieldType::String) {
                continue;
            }
            if (! isset($data[$field->name])) {
                continue;
            }
            $value = $data[$field->name];
            if (is_string($value) && $value !== '') {
                return Str::limit($value, 60);
            }
            if (is_array($value)) {
                $first = reset($value);
                if (is_string($first) && $first !== '') {
                    return Str::limit($first, 60);
                }
            }
        }

        return 'Item #'.$item->id;
    }
}
