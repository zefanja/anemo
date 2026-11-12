<script lang="ts" module>
	export type AtoMood = 'freude' | 'denkt' | 'jubel' | 'feuer' | 'schlaf';
</script>

<script lang="ts">
	// Ato – das Lern-Atom, Maskottchen von Anemo. Inline-SVG, damit es scharf skaliert
	// und je nach Situation eine andere Stimmung zeigen kann.
	let {
		mood = 'freude',
		size = 120,
		label,
		class: className = ''
	}: { mood?: AtoMood; size?: number | string; label?: string; class?: string } = $props();

	type Cfg = {
		eyes: 'open' | 'happy' | 'closed';
		look: [number, number];
		mouth: 'smile' | 'hmm' | 'laugh' | 'grin' | 'oh';
		top: 'ball' | 'flame' | 'frost';
		dy: number;
		sleepy: boolean;
	};

	const MOODS: Record<AtoMood, Cfg> = {
		freude: { eyes: 'open', look: [0, 0], mouth: 'smile', top: 'ball', dy: 0, sleepy: false },
		denkt: { eyes: 'open', look: [3, -4], mouth: 'hmm', top: 'ball', dy: 0, sleepy: false },
		jubel: { eyes: 'happy', look: [0, 0], mouth: 'laugh', top: 'ball', dy: -8, sleepy: false },
		feuer: { eyes: 'open', look: [1, 1], mouth: 'grin', top: 'flame', dy: 0, sleepy: false },
		schlaf: { eyes: 'closed', look: [0, 0], mouth: 'oh', top: 'frost', dy: 0, sleepy: true }
	};

	const c = $derived(MOODS[mood] ?? MOODS.freude);
	const lx = $derived(83 + c.look[0]);
	const rx = $derived(119 + c.look[0]);
	const ey = $derived(104 + c.look[1]);
	const orbit = $derived(c.sleepy ? '#7dd3fc' : '#38bdf8');
	const dash = $derived(c.sleepy ? '8 8' : undefined);
	const dim = $derived(typeof size === 'number' ? `${size}px` : size);
</script>

<svg
	class={className}
	style:width={dim}
	style:height={dim}
	viewBox="0 0 200 200"
	role={label ? 'img' : undefined}
	aria-label={label}
	aria-hidden={label ? undefined : 'true'}
>
	<ellipse cx="100" cy="186" rx={c.dy ? 34 : 42} ry="5" fill="#0b2a5b" opacity="0.12" />
	<g transform="translate(0 {c.dy})">
		{#if mood === 'jubel'}
			<ellipse cx="100" cy="120" rx="86" ry="28" transform="rotate(25 100 120)" stroke="#fcd34d" stroke-width="4" fill="none" />
		{/if}
		<ellipse cx="100" cy="120" rx="86" ry="28" transform="rotate(-20 100 120)" stroke={orbit} stroke-width="5" stroke-dasharray={dash} fill="none" />
		{#if !c.sleepy}
			<circle cx="21" cy="139" r="7" fill="#fcd34d" />
		{/if}

		<line x1="100" y1="64" x2="100" y2="44" stroke="#0b6bcb" stroke-width="5" stroke-linecap="round" />
		{#if c.top === 'ball'}
			<circle cx="100" cy="38" r="8" fill="#fcd34d" />
		{:else if c.top === 'flame'}
			<path d="M100 14 C110 24 114 32 110 40 C114 38 116 34 116 30 C122 38 120 50 100 50 C80 50 78 38 86 30 C86 36 89 39 92 40 C88 32 92 22 100 14 Z" fill="#f97316" />
			<path d="M100 30 C105 36 106 42 102 46 C96 46 94 42 97 37 C98 34 99 32 100 30 Z" fill="#fcd34d" />
		{:else}
			<g stroke="#38bdf8" stroke-width="3" stroke-linecap="round">
				<line x1="100" y1="26" x2="100" y2="50" />
				<line x1="89.6" y1="32" x2="110.4" y2="44" />
				<line x1="89.6" y1="44" x2="110.4" y2="32" />
			</g>
		{/if}

		<circle cx="100" cy="110" r="48" fill="#0b6bcb" />
		<ellipse cx="78" cy="80" rx="14" ry="7" transform="rotate(-35 78 80)" fill="#fff" opacity="0.22" />

		{#if c.eyes === 'open'}
			<circle cx="82" cy="102" r="13" fill="#fff" />
			<circle cx="118" cy="102" r="13" fill="#fff" />
			<circle cx={lx} cy={ey} r="7.5" fill="#0b2a5b" />
			<circle cx={rx} cy={ey} r="7.5" fill="#0b2a5b" />
			<circle cx={lx + 2.5} cy={ey - 3} r="2.6" fill="#fff" />
			<circle cx={rx + 2.5} cy={ey - 3} r="2.6" fill="#fff" />
		{:else if c.eyes === 'happy'}
			<g stroke="#fff" stroke-width="5.5" fill="none" stroke-linecap="round">
				<path d="M71 106 q11 -14 22 0" />
				<path d="M107 106 q11 -14 22 0" />
			</g>
		{:else}
			<g stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round">
				<path d="M71 102 q11 10 22 0" />
				<path d="M107 102 q11 10 22 0" />
			</g>
		{/if}

		{#if mood === 'feuer'}
			<g stroke="#fff" stroke-width="5" stroke-linecap="round">
				<line x1="68" y1="82" x2="92" y2="90" />
				<line x1="132" y1="82" x2="108" y2="90" />
			</g>
		{:else if mood === 'denkt'}
			<path d="M106 84 q12 -9 24 -2" stroke="#fff" stroke-width="4.5" fill="none" stroke-linecap="round" />
		{/if}

		<ellipse cx="66" cy="122" rx="7" ry="4.5" fill="#f97316" opacity="0.8" />
		<ellipse cx="134" cy="122" rx="7" ry="4.5" fill="#f97316" opacity="0.8" />

		{#if c.mouth === 'smile'}
			<path d="M88 122 q12 11 24 0" stroke="#fff" stroke-width="4.5" fill="none" stroke-linecap="round" />
		{:else if c.mouth === 'hmm'}
			<path d="M98 127 q7 -4 14 0" stroke="#fff" stroke-width="4.5" fill="none" stroke-linecap="round" />
		{:else if c.mouth === 'laugh'}
			<path d="M85 119 h30 q0 18 -15 18 q-15 0 -15 -18 Z" fill="#0b2a5b" />
			<path d="M92 131 q8 -6 16 0 q-2 6 -8 6 q-6 0 -8 -6 Z" fill="#f97316" />
		{:else if c.mouth === 'grin'}
			<path d="M86 120 h28 q-3 13 -14 13 q-11 0 -14 -13 Z" fill="#fff" />
		{:else}
			<ellipse cx="100" cy="126" rx="4.5" ry="5.5" fill="#0b2a5b" />
		{/if}

		<path d="M14 120 A86 28 0 0 0 186 120" transform="rotate(-20 100 120)" stroke={orbit} stroke-width="5" stroke-dasharray={dash} fill="none" />
		{#if mood === 'feuer'}
			<g stroke="#f97316" stroke-width="3.5" stroke-linecap="round" fill="none" opacity="0.7">
				<path d="M124 140 q10 -2 18 -8" />
				<path d="M118 147 q12 -1 22 -8" />
			</g>
		{/if}
		<circle cx="149" cy="128" r="9" fill={c.sleepy ? '#7dd3fc' : '#f97316'} />
	</g>

	{#if mood === 'freude'}
		<polygon points="164,30 167.5,39 176,42 167.5,45 164,54 160.5,45 152,42 160.5,39" fill="#fcd34d" />
		<polygon points="40,40 42,45 47,47 42,49 40,54 38,49 33,47 38,45" fill="#38bdf8" />
	{:else if mood === 'denkt'}
		<circle cx="146" cy="58" r="3" fill="#fff" stroke="#0b6bcb" stroke-width="2" />
		<circle cx="156" cy="46" r="4.5" fill="#fff" stroke="#0b6bcb" stroke-width="2" />
		<circle cx="174" cy="24" r="17" fill="#fff" stroke="#0b6bcb" stroke-width="2.5" />
		<text x="174" y="32" text-anchor="middle" font-family="Nunito Variable, Nunito, sans-serif" font-size="24" font-weight="900" fill="#0b6bcb">?</text>
	{:else if mood === 'jubel'}
		<rect x="36" y="20" width="9" height="9" rx="2" fill="#fcd34d" transform="rotate(20 40 24)" />
		<rect x="152" y="16" width="9" height="9" rx="2" fill="#38bdf8" transform="rotate(-20 156 20)" />
		<circle cx="178" cy="62" r="5" fill="#f97316" />
		<circle cx="22" cy="70" r="4.5" fill="#f97316" />
		<circle cx="66" cy="12" r="4" fill="#0b6bcb" />
		<polygon points="140,40 143,47 150,50 143,53 140,60 137,53 130,50 137,47" fill="#fcd34d" />
		<rect x="176" y="100" width="7" height="7" rx="2" fill="#0b6bcb" />
	{:else if mood === 'schlaf'}
		<text x="146" y="54" font-family="Nunito Variable, Nunito, sans-serif" font-size="28" font-weight="900" fill="#0b6bcb">Z</text>
		<text x="168" y="32" font-family="Nunito Variable, Nunito, sans-serif" font-size="20" font-weight="900" fill="#38bdf8">z</text>
	{/if}
</svg>
