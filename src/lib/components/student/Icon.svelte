<script lang="ts">
	// Inline icon set for the student app (filled + stroke icons, no emoji).
	type Name =
		| 'flame' | 'star' | 'sparkle' | 'bolt' | 'check' | 'play' | 'pencil' | 'stars'
		| 'medal' | 'user' | 'close' | 'arrow' | 'lock' | 'bulb' | 'target' | 'shield'
		| 'logout' | 'refresh' | 'shuffle';
	let { name, size = 20, color = 'currentColor', label }: { name: Name; size?: number; color?: string; label?: string } = $props();

	const FILLED: Partial<Record<Name, string>> = {
		flame: 'M12 2c1 4 5 6 5 11a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3-1-6 1-9.5Z',
		star: 'm12 2 3 6.5 7 .8-5.2 4.8 1.4 7L12 17.6 5.8 21l1.4-7L2 9.3l7-.8Z',
		sparkle: 'M12 1.5 14 10l8.5 2-8.5 2-2 8.5-2-8.5L1.5 12 10 10Z',
		bolt: 'M13 2 4 14h7l-1 8 9-12h-7Z',
		play: 'M7 4.5v15a1 1 0 0 0 1.5.9l12-7.5a1 1 0 0 0 0-1.7l-12-7.5A1 1 0 0 0 7 4.5Z',
		shield: 'M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5Z'
	};
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 24 24"
	aria-hidden={label ? undefined : 'true'}
	role={label ? 'img' : undefined}
	aria-label={label}
	fill={FILLED[name] ? color : 'none'}
	stroke={FILLED[name] ? 'none' : color}
	stroke-width="2.4"
	stroke-linecap="round"
	stroke-linejoin="round"
	style="flex: none; display: block"
>
	{#if FILLED[name]}
		<path d={FILLED[name]} />
	{:else if name === 'check'}
		<path d="m5 12 5 5 9-10" />
	{:else if name === 'pencil'}
		<path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
	{:else if name === 'stars'}
		<circle cx="6" cy="7" r="2" /><circle cx="17" cy="5" r="2" /><circle cx="12" cy="17" r="2" /><path d="M7.8 7.6 10.6 15.3M13.6 15.6 16.4 6.9M8 7l7-1.6" />
	{:else if name === 'medal'}
		<circle cx="12" cy="9" r="6" /><path d="m8.5 14-1.5 8 5-3 5 3-1.5-8" />
	{:else if name === 'user'}
		<circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" />
	{:else if name === 'close'}
		<path d="M6 6l12 12M18 6 6 18" />
	{:else if name === 'arrow'}
		<path d="M5 12h14" /><path d="m13 6 6 6-6 6" />
	{:else if name === 'lock'}
		<rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" />
	{:else if name === 'bulb'}
		<path d="M9 18h6M10 22h4" /><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.3h6c0-1 .4-1.8 1-2.3A7 7 0 0 0 12 2Z" />
	{:else if name === 'target'}
		<circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" />
	{:else if name === 'logout'}
		<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" />
	{:else if name === 'refresh'}
		<path d="M3 12a9 9 0 0 1 15.5-6.3L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-15.5 6.3L3 16" /><path d="M3 21v-5h5" />
	{:else if name === 'shuffle'}
		<path d="M16 3h5v5" /><path d="M4 20 21 3" /><path d="M21 16v5h-5" /><path d="m15 15 6 6" /><path d="M4 4l5 5" />
	{/if}
</svg>
