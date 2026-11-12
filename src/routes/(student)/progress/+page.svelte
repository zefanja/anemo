<script lang="ts">
	import StarMap from '$lib/components/student/StarMap.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const starAtoms = $derived(data.starMapAtoms.filter((a) => a.level === 'atom'));
	const glowing = $derived(starAtoms.filter((a) => a.isMastered).length);
	const rising = $derived(starAtoms.filter((a) => !a.isMastered && a.mastery > 0).length);
	const waiting = $derived(starAtoms.filter((a) => !a.isMastered && a.mastery === 0).length);

	const MONTH_NAMES = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];

	function heatLevel(count: number): number {
		if (count === 0) return 0;
		if (count <= 3) return 1;
		if (count <= 7) return 2;
		if (count <= 15) return 3;
		return 4;
	}

	function localDateStr(d: Date): string {
		const y = d.getFullYear();
		const m = String(d.getMonth() + 1).padStart(2, '0');
		const day = String(d.getDate()).padStart(2, '0');
		return `${y}-${m}-${day}`;
	}

	const heatWeeks = $derived.by(() => {
		const map = new Map(data.activityDays.map((d) => [d.date, d.count]));

		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const todayStr = localDateStr(today);

		// Start from Monday at least 84 days back
		const start = new Date(today);
		start.setDate(start.getDate() - 83);
		const dow = start.getDay();
		start.setDate(start.getDate() - (dow === 0 ? 6 : dow - 1));

		const cells: { date: string; count: number; isFuture: boolean; isToday: boolean }[] = [];
		const d = new Date(start);
		while (d <= today) {
			const dateStr = localDateStr(d);
			cells.push({ date: dateStr, count: map.get(dateStr) ?? 0, isFuture: false, isToday: dateStr === todayStr });
			d.setDate(d.getDate() + 1);
		}
		while (cells.length % 7 !== 0) {
			cells.push({ date: '', count: 0, isFuture: true, isToday: false });
		}
		return Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
	});

	function monthLabel(wi: number): string | null {
		const first = heatWeeks[wi]?.[0];
		if (!first?.date) return null;
		const [, m] = first.date.split('-').map(Number);
		if (wi === 0) return MONTH_NAMES[m - 1];
		const prev = heatWeeks[wi - 1]?.[0];
		if (!prev?.date) return MONTH_NAMES[m - 1];
		const [, pm] = prev.date.split('-').map(Number);
		return m !== pm ? MONTH_NAMES[m - 1] : null;
	}

	function cellTitle(cell: { date: string; count: number }): string {
		if (!cell.date) return '';
		const [y, m, d] = cell.date.split('-');
		return `${d}.${m}.${y}: ${cell.count} Aufgabe${cell.count !== 1 ? 'n' : ''}`;
	}
</script>

<svelte:head><title>Anemo – Sterne</title></svelte:head>

<div class="progress-page">
	<header class="sky-header">
		<h1>Deine Sternenkarte</h1>
		<p>Jedes gemeisterte Thema lässt einen Stern leuchten.</p>
	</header>

	<div class="sky-stats">
		<div class="sky-stat"><strong class="gold">{glowing}</strong><span>leuchten</span></div>
		<div class="sky-stat"><strong class="sky">{rising}</strong><span>am Aufgehen</span></div>
		<div class="sky-stat"><strong>{waiting}</strong><span>warten noch</span></div>
	</div>

	<StarMap atoms={data.starMapAtoms} />

	<a href="/practice" class="btn-3d sky-cta">Nächsten Stern zünden</a>

	<section class="heatmap-card" aria-label="Aktivität der letzten 12 Wochen">
		<div class="heatmap-top">
			<span class="heatmap-title">Aktivität – letzte 12 Wochen</span>
			<div class="heatmap-legend" aria-hidden="true">
				<span class="legend-text">Wenig</span>
				{#each [0, 1, 2, 3, 4] as lvl}
					<span class="heat-cell-lg" data-level={lvl}></span>
				{/each}
				<span class="legend-text">Viel</span>
			</div>
		</div>
		<div class="heatmap-body">
			<div class="day-labels" aria-hidden="true">
				<span>Mo</span><span></span><span>Mi</span><span></span><span>Fr</span><span></span><span></span>
			</div>
			<div class="heat-grid-wrap" style="--ncols: {heatWeeks.length}">
				<div class="month-row">
					{#each heatWeeks as _, wi}
						<span>{monthLabel(wi) ?? ''}</span>
					{/each}
				</div>
				<div class="week-grid">
					{#each heatWeeks as week}
						{#each week as cell}
							<div
								class="heat-cell"
								data-level={cell.isFuture ? -1 : heatLevel(cell.count)}
								class:today={cell.isToday}
								title={cellTitle(cell)}
							></div>
						{/each}
					{/each}
				</div>
			</div>
		</div>
	</section>
</div>

<style>
	.progress-page {
		padding: 1rem 1rem 2rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		max-width: 640px;
		width: 100%;
		margin: 0 auto;
		color: #fff;
	}

	.sky-header { padding-top: 0.5rem; }
	.sky-header h1 { font-size: 1.65rem; font-weight: 900; letter-spacing: -0.01em; }
	.sky-header p { font-weight: 700; color: #bfdbfe; }

	.sky-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.5rem; }
	.sky-stat { background: var(--c-navy-2); border-radius: 14px; padding: 0.6rem 0.75rem; display: flex; flex-direction: column; }
	.sky-stat strong { font-size: 1.4rem; font-weight: 900; line-height: 1.2; }
	.sky-stat strong.gold { color: var(--c-star); }
	.sky-stat strong.sky { color: var(--c-sky-soft); }
	.sky-stat span { font-size: 0.75rem; font-weight: 800; color: #bfdbfe; }

	/* ── Heatmap, in the same night colours as the sky ── */
	.heatmap-card {
		--h0: rgba(255, 255, 255, 0.08);
		--h1: #1e4a7a;
		--h2: #0b6bcb;
		--h3: #38bdf8;
		--h4: #bae6fd;
		background: var(--c-navy-2);
		border-radius: 20px;
		padding: 1rem 1.1rem;
	}
	.heatmap-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 0.75rem;
		flex-wrap: wrap;
		gap: 0.4rem;
	}
	.heatmap-title {
		font-size: 0.72rem;
		font-weight: 900;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: #bfdbfe;
	}
	.heatmap-legend { display: flex; align-items: center; gap: 3px; }
	.legend-text { font-size: 0.62rem; font-weight: 700; color: #8fa6c8; margin: 0 2px; }
	.heat-cell-lg { width: 10px; height: 10px; border-radius: 2px; flex-shrink: 0; }

	.heatmap-body { display: flex; gap: 4px; }
	.day-labels {
		flex-shrink: 0;
		width: 16px;
		padding-top: 18px;
		display: flex;
		flex-direction: column;
	}
	.day-labels span {
		flex: 1;
		font-size: 0.6rem;
		font-weight: 700;
		color: #8fa6c8;
		display: flex;
		align-items: center;
	}
	.heat-grid-wrap { flex: 1; min-width: 0; }
	.month-row {
		display: grid;
		grid-template-columns: repeat(var(--ncols), 1fr);
		gap: 2px;
		height: 16px;
		margin-bottom: 2px;
	}
	.month-row span { font-size: 0.6rem; font-weight: 700; color: #8fa6c8; white-space: nowrap; }
	.week-grid {
		display: grid;
		grid-template-columns: repeat(var(--ncols), 1fr);
		grid-template-rows: repeat(7, auto);
		grid-auto-flow: column;
		gap: 2px;
	}
	.heat-cell { aspect-ratio: 1; border-radius: 2px; }
	[data-level="-1"] { background: transparent; }
	[data-level="0"] { background: var(--h0); }
	[data-level="1"] { background: var(--h1); }
	[data-level="2"] { background: var(--h2); }
	[data-level="3"] { background: var(--h3); }
	[data-level="4"] { background: var(--h4); }
	.heat-cell.today { outline: 2px solid var(--c-star); outline-offset: 1px; }
</style>
