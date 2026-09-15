@php
    $mailBranding = app(\App\Services\Settings\ProjectAppearance::class)->forMail();
@endphp
<x-mail::layout>
{{-- Header --}}
<x-slot:header>
<x-mail::header :url="config('app.url')">
@if ($mailBranding['logoUrl'])
<img src="{{ $mailBranding['logoUrl'] }}" class="logo" alt="{{ $mailBranding['name'] }}">
@else
{{ $mailBranding['name'] }}
@endif
</x-mail::header>
</x-slot:header>

{{-- Body --}}
{!! $slot !!}

{{-- Subcopy --}}
@isset($subcopy)
<x-slot:subcopy>
<x-mail::subcopy>
{!! $subcopy !!}
</x-mail::subcopy>
</x-slot:subcopy>
@endisset

{{-- Footer --}}
<x-slot:footer>
<x-mail::footer>
© {{ date('Y') }} {{ $mailBranding['name'] }}. {{ __('All rights reserved.') }}
</x-mail::footer>
</x-slot:footer>
</x-mail::layout>
