<script lang="ts" module>
	// Stroke icon set for the teacher area (no emoji).
	export type TIconName =
		| 'dashboard' | 'users' | 'upload' | 'book' | 'chart' | 'settings' | 'shield'
		| 'logout' | 'menu' | 'back' | 'plus' | 'print' | 'search' | 'key' | 'more'
		| 'more-v' | 'edit' | 'trash' | 'chevron' | 'check' | 'close' | 'flame' | 'refresh';
</script>

<script lang="ts">
	let { name, size = 20, label }: { name: TIconName; size?: number; label?: string } = $props();
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill={name === 'more' || name === 'more-v' ? 'currentColor' : 'none'}
	stroke={name === 'more' || name === 'more-v' ? 'none' : 'currentColor'}
	stroke-width="2.2"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden={label ? undefined : 'true'}
	role={label ? 'img' : undefined}
	aria-label={label}
	style="flex: none; display: block"
>
	{#if name === 'dashboard'}
		<rect x="3" y="3" width="7" height="9" rx="2" /><rect x="14" y="3" width="7" height="5" rx="2" /><rect x="14" y="12" width="7" height="9" rx="2" /><rect x="3" y="16" width="7" height="5" rx="2" />
	{:else if name === 'users'}
		<circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5" /><circle cx="17" cy="9" r="2.5" /><path d="M17 14c2.4 0 4 1.6 4.5 4.5" />
	{:else if name === 'upload'}
		<path d="M12 15V3" /><path d="m7 8 5-5 5 5" /><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
	{:else if name === 'book'}
		<path d="M4 5a2 2 0 0 1 2-2h12v18H6a2 2 0 0 1-2-2z" /><path d="M8 7h6M8 11h6" />
	{:else if name === 'chart'}
		<path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
	{:else if name === 'settings'}
		<circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" />
	{:else if name === 'shield'}
		<path d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6z" />
	{:else if name === 'logout'}
		<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><path d="M10 17l-5-5 5-5M5 12h11" />
	{:else if name === 'menu'}
		<path d="M4 7h16M4 12h16M4 17h16" />
	{:else if name === 'back'}
		<path d="m15 5-7 7 7 7" />
	{:else if name === 'chevron'}
		<path d="m9 5 7 7-7 7" />
	{:else if name === 'plus'}
		<path d="M12 5v14M5 12h14" />
	{:else if name === 'print'}
		<path d="M6 9V3h12v6" /><rect x="3" y="9" width="18" height="8" rx="2" /><path d="M7 14h10v7H7z" />
	{:else if name === 'search'}
		<circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" />
	{:else if name === 'key'}
		<circle cx="8" cy="15" r="4" /><path d="m11 12 9-9M17 6l3 3" />
	{:else if name === 'more'}
		<circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" />
	{:else if name === 'more-v'}
		<circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
	{:else if name === 'edit'}
		<path d="M4 20h4L19 9l-4-4L4 16z" />
	{:else if name === 'trash'}
		<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
	{:else if name === 'check'}
		<path d="m5 12 5 5 9-10" />
	{:else if name === 'close'}
		<path d="M6 6l12 12M18 6 6 18" />
	{:else if name === 'flame'}
		<path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3-1-5.5 1-8.5Z" />
	{:else if name === 'refresh'}
		<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.9L20 16M20 20v-4h-4" />
	{/if}
</svg>
