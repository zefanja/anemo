<script lang="ts">
	import Ato from '$lib/components/Ato.svelte';
	import { buildSky, nextStarId, type PlacedStar, type StarAtom } from '$lib/constellations';

	let { atoms }: { atoms: StarAtom[] } = $props();

	// Hidden constellations shown per domain before the "more" toggle
	const LOCKED_PREVIEW = 4;

	const sky = $derived(buildSky(atoms));
	const openSkies = $derived(sky.filter((d) => d.unlocked));
	const hiddenSkies = $derived(sky.filter((d) => !d.unlocked));
	const nextId = $derived(nextStarId(atoms));

	let expanded = $state<Record<string, boolean>>({});
	let selected = $state<{ key: string; star: PlacedStar } | null>(null);

	function select(key: string, star: PlacedStar) {
		selected = selected?.star.id === star.id ? null : { key, star };
	}

	function onStarKey(e: KeyboardEvent, key: string, star: PlacedStar) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			select(key, star);
		} else if (e.key === 'Escape') {
			selected = null;
		}
	}

	// Four-pointed sparkle instead of a plain dot
	function sparkle(cx: number, cy: number, R: number): string {
		const q = R * 0.4;
		let d = '';
		for (let i = 0; i < 4; i++) {
			const a = (i * Math.PI) / 2 - Math.PI / 2;
			const b = a + Math.PI / 4;
			d += `${i ? 'L' : 'M'}${(cx + R * Math.cos(a)).toFixed(2)} ${(cy + R * Math.sin(a)).toFixed(2)}`;
			d += `L${(cx + q * Math.cos(b)).toFixed(2)} ${(cy + q * Math.sin(b)).toFixed(2)}`;
		}
		return d + 'Z';
	}

	function cap(s: string) {
		return s ? s[0].toUpperCase() + s.slice(1) : s;
	}

	function starLabel(s: PlacedStar): string {
		return s.status === 'mastered'
			? `${cap(s.label)}: gemeistert`
			: `${cap(s.label)}: ${Math.round(s.mastery * 100)} Prozent`;
	}
</script>

<div class="sky">
	{#if openSkies.length === 0}
		<p class="sky-empty">Sobald du die ersten Aufgaben löst, erscheinen hier deine Sternbilder.</p>
	{/if}

	{#each openSkies as d (d.domain)}
		{@const shown = d.constellations.filter((c) => !c.locked)}
		{@const locked = d.constellations.filter((c) => c.locked)}
		{@const lockedTotal = locked.length}
		{@const lockedShown = expanded[d.domain] ? locked : locked.slice(0, LOCKED_PREVIEW)}
		<section class="domain" aria-label={d.name}>
			<header class="domain-head">
				<h2>{d.name}</h2>
				<span class="domain-count">{d.completeCount} von {d.constellations.length} Sternbildern</span>
			</header>

			<div class="tiles">
				{#each shown as c (c.key)}
					<div class="tile" class:wide={c.wide} class:complete={c.complete}>
						<div class="tile-sky">
							<svg viewBox="0 0 {c.width} {c.height}" role="group" aria-label="Sternbild {c.name}">
								{#each c.lines as ln}
									<line
										x1={ln.x1}
										y1={ln.y1}
										x2={ln.x2}
										y2={ln.y2}
										class={ln.gold ? 'ln-gold' : 'ln-dim'}
									/>
								{/each}
								{#each c.stars as s (s.id)}
									{#if s.status === 'locked'}
										<circle cx={s.x} cy={s.y} r="2.2" class="st-locked" />
									{:else}
										<g
											class="star {s.status}"
											class:selected={selected?.star.id === s.id}
											role="button"
											tabindex="0"
											aria-label={starLabel(s)}
											aria-pressed={selected?.star.id === s.id}
											onclick={() => select(c.key, s)}
											onkeydown={(e) => onStarKey(e, c.key, s)}
										>
											<circle cx={s.x} cy={s.y} r="14" class="hit" />
											{#if s.status === 'mastered'}
												<circle cx={s.x} cy={s.y} r="8" class="glow" />
												<path d={sparkle(s.x, s.y, 7.5)} class="sp-gold" />
											{:else}
												{#if s.id === nextId}
													<circle cx={s.x} cy={s.y} r="8" class="pulse" />
												{/if}
												{#if s.mastery > 0}
													<circle
														cx={s.x}
														cy={s.y}
														r="9.5"
														class="progress"
														pathLength="100"
														stroke-dasharray="{Math.round(s.mastery * 100)} 100"
														transform="rotate(-90 {s.x} {s.y})"
													/>
												{/if}
												<path d={sparkle(s.x, s.y, 6)} class="sp-open" />
											{/if}
											<circle cx={s.x} cy={s.y} r="12" class="ring" />
										</g>
									{/if}
								{/each}
							</svg>
							{#each c.stars as s (s.id)}
								{#if s.id === nextId}
									<div
										class="ato-mark"
										style:left="{((s.x + 14) / c.width) * 100}%"
										style:top="{((s.y - 14) / c.height) * 100}%"
									>
										<Ato size={30} label="Ato: Dein nächster Stern" />
									</div>
								{/if}
							{/each}
						</div>

						<div class="tile-foot">
							<span class="tile-name">{c.name}</span>
							<span class="tile-count">
								{#if c.complete}✓ {c.total}/{c.total}{:else}{c.mastered}/{c.total}{/if}
							</span>
						</div>

						{#if selected?.key === c.key}
							{@const s = selected.star}
							<div class="tip" class:gold={s.status === 'mastered'} class:top={s.y > c.height / 2} role="status">
								<div class="tip-name">{cap(s.label)}</div>
								{#if s.status === 'mastered'}
									<div class="tip-status gold">✓ Gemeistert</div>
								{:else}
									<div class="tip-status blue">{Math.round(s.mastery * 100)} % – In Arbeit</div>
								{/if}
							</div>
						{/if}
					</div>
				{/each}
			</div>

			{#if lockedTotal > 0}
				<ul class="chips" aria-label="Noch verborgene Sternbilder">
					{#each lockedShown as c (c.key)}
						<li class="chip">
							<span class="tile-name">{c.name}</span>
							<span class="chip-count">{c.total} ☆</span>
						</li>
					{/each}
				</ul>
			{/if}

			{#if lockedTotal > LOCKED_PREVIEW}
				<button
					type="button"
					class="more"
					aria-expanded={!!expanded[d.domain]}
					onclick={() => (expanded = { ...expanded, [d.domain]: !expanded[d.domain] })}
				>
					{expanded[d.domain]
						? 'Weniger anzeigen'
						: `↓ ${lockedTotal - LOCKED_PREVIEW} weitere Sternbilder`}
				</button>
			{/if}
		</section>
	{/each}

	{#if hiddenSkies.length > 0}
		<section class="domain hidden-domains" aria-label="Noch verborgene Bereiche">
			<h2>Noch verborgen</h2>
			<ul>
				{#each hiddenSkies as d (d.domain)}
					<li>
						<span>{d.name}</span>
						<span class="hidden-count">{d.constellations.length} {d.constellations.length === 1 ? 'Sternbild' : 'Sternbilder'}</span>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</div>

<style>
	.sky {
		--sky-1: #12305f;
		--sky-2: #050d1f;
		--star: #fcd34d;
		--star-glow: #f59e0b;
		--open: #38bdf8;
		--dim: #5d7198;
		--sky-text: #dbe8fb;
		position: relative;
		border-radius: 20px;
		padding: 1rem 0.75rem 0.75rem;
		background:
			radial-gradient(1px 1px at 12% 18%, rgba(255, 255, 255, 0.35), transparent),
			radial-gradient(1px 1px at 68% 9%, rgba(255, 255, 255, 0.3), transparent),
			radial-gradient(1px 1px at 84% 42%, rgba(255, 255, 255, 0.25), transparent),
			radial-gradient(1px 1px at 33% 61%, rgba(255, 255, 255, 0.25), transparent),
			radial-gradient(1px 1px at 52% 88%, rgba(255, 255, 255, 0.3), transparent),
			radial-gradient(ellipse at 50% 0%, var(--sky-1), var(--sky-2) 85%);
		box-shadow: 0 10px 30px rgba(5, 13, 31, 0.35);
		color: var(--sky-text);
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	.sky-empty {
		font-weight: 700;
		text-align: center;
		padding: 1.5rem 0.5rem;
	}

	.domain {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}

	.domain-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0 0.25rem;
	}

	h2 {
		font-size: 1rem;
		font-weight: 900;
		color: #fff;
	}

	.domain-count {
		font-size: 0.78rem;
		font-weight: 800;
		color: var(--star);
		white-space: nowrap;
	}

	.tiles {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		grid-auto-flow: row dense;
		gap: 0.5rem;
	}

	.tile {
		position: relative;
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		border-radius: 16px;
		background: rgba(255, 255, 255, 0.07);
		border: 1px solid rgba(255, 255, 255, 0.12);
		min-width: 0;
	}

	.tile.wide {
		grid-column: 1 / -1;
	}

	.tile.complete {
		border: 1.5px solid rgba(252, 211, 77, 0.7);
		box-shadow: 0 0 18px rgba(245, 158, 11, 0.18);
	}


	.chips {
		list-style: none;
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.5rem;
	}

	.chip {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 0.4rem;
		padding: 0.6rem 0.75rem;
		border: 1px dashed rgba(93, 113, 152, 0.7);
		border-radius: 14px;
		font-size: 0.74rem;
		font-weight: 800;
		color: var(--dim);
	}

	.chip .tile-name {
		color: var(--dim);
	}

	.chip-count {
		white-space: nowrap;
	}

	.tile-sky {
		position: relative;
	}

	svg {
		display: block;
		width: 100%;
		height: auto;
		overflow: visible;
	}

	.ln-gold {
		stroke: var(--star);
		stroke-width: 1.4;
		opacity: 0.75;
	}

	.ln-dim {
		stroke: var(--dim);
		stroke-width: 1;
		stroke-dasharray: 2 4;
		opacity: 0.5;
	}


	.st-locked {
		fill: var(--dim);
		opacity: 0.8;
	}

	.star {
		cursor: pointer;
		outline: none;
	}

	.hit {
		fill: transparent;
	}

	.glow {
		fill: var(--star-glow);
		opacity: 0.5;
		filter: blur(3px);
	}

	.sp-gold {
		fill: var(--star);
	}

	.sp-open {
		fill: none;
		stroke: var(--open);
		stroke-width: 1.6;
		stroke-linejoin: round;
	}

	.progress {
		fill: none;
		stroke: var(--open);
		stroke-width: 1.6;
		stroke-linecap: round;
		opacity: 0.75;
	}

	.pulse {
		fill: none;
		stroke: var(--open);
		stroke-width: 1.5;
		opacity: 0.7;
		transform-box: fill-box;
		transform-origin: center;
	}

	.ring {
		fill: none;
		stroke: #fff;
		stroke-width: 1.4;
		opacity: 0;
	}

	.star.selected .ring,
	.star:focus-visible .ring {
		opacity: 0.8;
	}

	@media (prefers-reduced-motion: no-preference) {
		.pulse {
			animation: pulse 1.8s ease-in-out infinite;
		}
	}

	@keyframes pulse {
		50% {
			transform: scale(1.35);
			opacity: 0.35;
		}
	}

	.ato-mark {
		position: absolute;
		transform: translate(-50%, -50%);
		pointer-events: none;
		line-height: 0;
	}

	.tile-foot {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 0.4rem;
		padding: 0 0.7rem 0.55rem;
		font-size: 0.74rem;
		font-weight: 800;
	}

	.tile-name {
		color: var(--sky-text);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		min-width: 0;
	}

	.tile-count {
		color: var(--open);
		font-weight: 900;
		white-space: nowrap;
	}

	.complete .tile-count {
		color: var(--star);
	}


	.tip {
		position: absolute;
		left: 0.35rem;
		right: 0.35rem;
		bottom: 0.35rem;
		z-index: 2;
		background: rgba(6, 13, 30, 0.94);
		border: 1px solid rgba(125, 211, 252, 0.3);
		border-radius: 10px;
		padding: 0.45rem 0.6rem 0.5rem;
		text-align: center;
		pointer-events: none;
	}

	.tip.top {
		top: 0.35rem;
		bottom: auto;
	}

	.tip.gold {
		border-color: rgba(251, 191, 36, 0.4);
	}

	.tip-name {
		font-size: 0.8rem;
		font-weight: 800;
		color: #f1f5f9;
		line-height: 1.25;
	}

	.tip-status {
		display: inline-block;
		margin-top: 0.3rem;
		font-size: 0.7rem;
		font-weight: 800;
		border-radius: 999px;
		padding: 0.1rem 0.6rem;
	}

	.tip-status.gold {
		background: rgba(251, 191, 36, 0.18);
		color: var(--star);
	}

	.tip-status.blue {
		background: rgba(56, 189, 248, 0.18);
		color: #7dd3fc;
	}

	.more {
		align-self: center;
		background: none;
		border: none;
		color: var(--dim);
		font-size: 0.8rem;
		font-weight: 800;
		padding: 0.25rem 0.75rem;
	}

	.more:hover {
		color: var(--sky-text);
	}

	.hidden-domains ul {
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.hidden-domains li {
		display: flex;
		justify-content: space-between;
		border: 1px dashed rgba(93, 113, 152, 0.7);
		border-radius: 12px;
		padding: 0.5rem 0.75rem;
		font-size: 0.82rem;
		font-weight: 800;
		color: var(--dim);
	}
</style>
