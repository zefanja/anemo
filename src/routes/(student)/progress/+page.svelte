<script lang="ts">
	import { invalidate } from '$app/navigation';
	import { enhance } from '$app/forms';
	import StarMap from '$lib/components/student/StarMap.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	function rankIcon(i: number): string {
		if (i === 0) return '🥇';
		if (i === 1) return '🥈';
		if (i === 2) return '🥉';
		return `${i + 1}.`;
	}

	type LbPeriod = 'day' | 'week' | 'month' | 'all';
	const LB_TABS: { key: LbPeriod; label: string }[] = [
		{ key: 'day', label: 'Heute' },
		{ key: 'week', label: 'Woche' },
		{ key: 'month', label: 'Monat' },
		{ key: 'all', label: 'Gesamt' }
	];
	let lbPeriod = $state<LbPeriod>('day');

	const lbEntries = $derived(lbPeriod === 'all' ? data.leaderboard : data.periodBoards[lbPeriod]);

	// Competition ranking: equal XP → equal place (1, 2, 2, 4, …)
	const lbRanks = $derived.by(() => {
		const ranks: number[] = [];
		lbEntries.forEach((e, i) => {
			ranks.push(i > 0 && e.xp === lbEntries[i - 1].xp ? ranks[i - 1] : i);
		});
		return ranks;
	});

	const myIndex = $derived(lbEntries.findIndex((e) => e.id === data.studentId));
	const myRank = $derived(myIndex >= 0 ? lbRanks[myIndex] : -1);
	// myRank is the index of the first entry in my tie group, so the entry right
	// before it is the closest one with more XP
	const xpToNextRank = $derived(myRank > 0 ? lbEntries[myRank - 1].xp - lbEntries[myIndex].xp + 1 : 0);

	function isoWeek(d: Date): number {
		const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
		const day = t.getUTCDay() || 7;
		t.setUTCDate(t.getUTCDate() + 4 - day);
		const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
		return Math.ceil(((t.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
	}

	const MONTH_FULL = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];

	const lbPeriodText = $derived.by(() => {
		const now = new Date();
		if (lbPeriod === 'day') return 'heute';
		if (lbPeriod === 'week') return `diese Woche (KW ${isoWeek(now)})`;
		if (lbPeriod === 'month') return `im ${MONTH_FULL[now.getMonth()]}`;
		return 'insgesamt';
	});

	const lbEmptyText = $derived(
		lbPeriod === 'day'
			? 'Heute hat noch niemand XP gesammelt. Hol dir Platz 1!'
			: lbPeriod === 'week'
				? 'Diese Woche hat noch niemand XP gesammelt. Hol dir Platz 1!'
				: 'Diesen Monat hat noch niemand XP gesammelt. Hol dir Platz 1!'
	);

	function capitalize(s: string): string {
		return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
	}

	function masteryColor(mastery: number, isMastered: boolean): string {
		if (isMastered) return 'mastered';
		if (mastery > 0.5) return 'partial-high';
		if (mastery > 0) return 'partial-low';
		return 'untouched';
	}

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

	const todayLabel = $derived.by(() => {
		const now = new Date();
		return `${now.getDate()}. ${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}`;
	});
</script>

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

	<!-- ── Activity heatmap ── -->
	<div class="heatmap-card">
		<div class="heatmap-top">
			<span class="heatmap-title">Aktivität – letzte 12 Wochen</span>
			<div class="heatmap-legend">
				<span class="legend-text">Wenig</span>
				{#each [0,1,2,3,4] as lvl}
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
		<div class="heatmap-footer">
			<span class="today-label">Heute: {todayLabel}</span>
		</div>
	</div>

	<!-- ── Class leaderboard ── -->
	{#if data.showLeaderboard && data.leaderboard.length > 1}
		<div class="lb-header">
			<span class="section-title" style="padding: 0">Rangliste – Meine Klasse</span>
			<form method="POST" action="?/toggleLeaderboard" use:enhance={() => () => invalidate('app:progress')}>
				<button type="submit" class="lb-toggle-btn">
					{data.studentHidesLeaderboard ? 'Einblenden' : 'Ausblenden'}
				</button>
			</form>
		</div>
		{#if data.studentHidesLeaderboard}
			<div class="lb-hidden-note">
				Die Rangliste ist ausgeblendet. Du kannst sie jederzeit wieder einblenden.
			</div>
		{:else}
			<div class="lb-card">
				<div class="lb-tabs" role="tablist" aria-label="Zeitraum der Rangliste">
					{#each LB_TABS as tab}
						<button
							type="button"
							role="tab"
							aria-selected={lbPeriod === tab.key}
							class="lb-tab"
							class:active={lbPeriod === tab.key}
							onclick={() => (lbPeriod = tab.key)}
						>
							{tab.label}
						</button>
					{/each}
				</div>
				{#if lbEntries.length === 0}
					<div class="lb-empty">{lbEmptyText}</div>
				{:else}
					<div class="lb-my-rank">
						{#if myRank >= 0}
							Du bist {lbPeriodText} auf Platz <strong>{myRank + 1}</strong> von {lbEntries.length}
							{#if myRank === 0} – du führst die Rangliste an!
							{:else if myRank < 3} – weiter so!
							{:else}
								– noch <strong>{xpToNextRank.toLocaleString('de-DE')} XP</strong> bis zum nächsten Platz!
							{/if}
						{:else}
							Du hast {lbPeriodText} noch keine XP. Schon ein paar Aufgaben bringen dich auf die Liste!
						{/if}
					</div>
					<ul class="lb-list">
						{#each lbEntries as entry, i (entry.id)}
							<li class="lb-row" class:lb-me={entry.id === data.studentId} class:lb-top3={lbRanks[i] < 3}>
								<span class="lb-pos">{rankIcon(lbRanks[i])}</span>
								<span class="lb-name">{entry.id === data.studentId ? 'Du' : entry.displayName}</span>
								{#if lbPeriod === 'all'}
									<span class="lb-lv">Lv.{entry.level}</span>
								{/if}
								<span class="lb-xp">{lbPeriod === 'all' ? '' : '+'}{entry.xp.toLocaleString('de-DE')} XP</span>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		{/if}
	{/if}

	<!-- ── Active atoms by domain ── -->
	{#if data.domains.length === 0}
		<div class="empty-state">Alle aktuell erreichbaren Themen gemeistert!</div>
	{:else}
		<div class="section-title">Aktuelle Themen</div>
		{#each data.domains as domain}
			<div class="domain-section">
				<div class="domain-title">{capitalize(domain.name)}</div>

				{#each domain.groups as group}
					{#if group.name}
						<div class="subdomain-title">{capitalize(group.name)}</div>
					{/if}
					<div class="atom-list">
						{#each group.atoms as atom}
							{@const colorClass = masteryColor(atom.mastery, atom.isMastered)}
							<div
								class="atom-row {colorClass}"
								class:is-cluster={atom.level === 'cluster'}
								title="{atom.label} – {Math.round(atom.mastery * 100)}%"
							>
								<div class="atom-row-left">
									<div class="atom-status-dot {colorClass}"></div>
									<span class="atom-row-label">{atom.label}</span>
								</div>
								<div class="atom-row-right">
									{#if atom.mastery > 0}
										<div class="mini-track">
											<div class="mini-fill" style="width: {Math.round(atom.mastery * 100)}%"></div>
										</div>
										<span class="pct-label">{Math.round(atom.mastery * 100)}%</span>
									{:else}
										<span class="not-started">–</span>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				{/each}
			</div>
		{/each}
	{/if}

	<!-- ── Mastered atoms ── -->
	{#if data.masteredDomains.length > 0}
		<div class="section-title">Gemeistert</div>
		{#each data.masteredDomains as domain}
			<div class="domain-section mastered-section">
				<div class="domain-title mastered-title">{capitalize(domain.name)}</div>

				{#each domain.groups as group}
					{#if group.name}
						<div class="subdomain-title">{capitalize(group.name)}</div>
					{/if}
					<div class="atom-list">
						{#each group.atoms as atom}
							<div class="atom-row mastered" title={atom.label}>
								<div class="atom-row-left">
									<div class="atom-status-dot mastered"></div>
									<span class="atom-row-label">{atom.label}</span>
								</div>
								<div class="atom-row-right">
									<span class="mastered-check">✓</span>
								</div>
							</div>
						{/each}
					</div>
				{/each}
			</div>
		{/each}
	{/if}

	<div style="height: 1.5rem"></div>

	<div style="height: 1rem"></div>
</div>

<style>
	.progress-page {
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		max-width: 640px;
		width: 100%;
		margin: 0 auto;
	}

	/* ── Stats card ── */

	/* ── Badges ── */
	.badge-card.earned {
		background: var(--c-primary-light);
		border: 1.5px solid var(--c-primary);
	}
	.badge-card.locked {
		background: var(--c-gray-50);
		border: 1.5px solid var(--c-gray-200);
		opacity: 0.55;
	}
	.badge-card.locked .badge-emoji {
		filter: grayscale(1);
	}
	.badge-card.locked .badge-name {
		color: var(--c-gray-500);
	}

	/* ── Domain sections ── */
	.section-title {
		font-size: 0.8rem;
		font-weight: 900;
		text-transform: uppercase;
		letter-spacing: .08em;
		color: #bfdbfe;
		padding: 0.5rem 0 0.25rem;
	}
	.domain-section {
		background: #fff;
		border-radius: var(--radius);
		overflow: hidden;
		box-shadow: var(--shadow-sm);
	}
	.domain-title {
		padding: 0.75rem 1rem;
		font-size: 1rem;
		font-weight: 700;
		background: var(--c-primary);
		color: #fff;
	}
	.subdomain-title {
		padding: 0.4rem 1rem;
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--c-gray-600);
		background: var(--c-gray-50);
		border-bottom: 1px solid var(--c-gray-100);
	}

	/* ── Atom rows ── */
	.atom-list { display: flex; flex-direction: column; }
	.atom-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.65rem 1rem;
		border-bottom: 1px solid var(--c-gray-100);
		gap: 0.5rem;
	}
	.atom-row:last-child { border-bottom: none; }
	.atom-row.is-cluster {
		background: var(--c-gray-50);
		padding-left: 1rem;
	}
	.atom-row-left {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		min-width: 0;
	}
	.atom-status-dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		flex-shrink: 0;
	}
	.atom-status-dot.mastered { background: var(--c-success); }
	.atom-status-dot.partial-high { background: #facc15; }
	.atom-status-dot.partial-low { background: #fb923c; }
	.atom-status-dot.untouched { background: var(--c-gray-200); }
	.atom-row-label {
		font-size: 0.875rem;
		color: var(--c-gray-900);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.is-cluster .atom-row-label { font-weight: 600; color: var(--c-gray-700); }
	.atom-row-right {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		flex-shrink: 0;
	}
	.mastered-check { color: var(--c-success); font-weight: 700; font-size: 1rem; }
	.not-started { color: var(--c-gray-400); font-size: 0.85rem; }
	.pct-label { font-size: 0.7rem; color: var(--c-gray-600); min-width: 28px; text-align: right; }
	.cluster-badge {
		font-size: 0.65rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: .04em;
		color: var(--c-gray-600);
		background: var(--c-gray-200);
		border-radius: 999px;
		padding: 0.1rem 0.45rem;
	}
	.mastered-section { opacity: 0.75; }
	.mastered-title {
		background: var(--c-success);
	}
	.empty-state {
		text-align: center;
		padding: 2rem 1rem;
		color: #bfdbfe;
		font-weight: 700;
		font-size: 0.95rem;
	}
	.mini-track {
		width: 48px;
		height: 5px;
		background: var(--c-gray-200);
		border-radius: 999px;
		overflow: hidden;
	}
	.mini-fill {
		height: 100%;
		background: var(--c-primary);
		border-radius: 999px;
	}

	/* ── Class leaderboard ── */
	.lb-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.5rem 0 0.25rem;
	}
	.lb-toggle-btn {
		font-size: 0.7rem;
		font-weight: 600;
		color: var(--c-gray-500);
		background: none;
		border: 1px solid var(--c-gray-200);
		border-radius: 999px;
		padding: 0.2rem 0.65rem;
		cursor: pointer;
		transition: color .15s, border-color .15s;
	}
	.lb-toggle-btn:hover { color: var(--c-primary); border-color: var(--c-primary); }
	.lb-hidden-note {
		font-size: 0.8rem;
		color: #bfdbfe;
		text-align: center;
		padding: 0.75rem 1rem;
		background: var(--c-navy-2);
		border-radius: var(--radius);
		border: 1px solid var(--c-navy-3);
	}
	.lb-card {
		background: #fff;
		border-radius: var(--radius);
		padding: 1rem 1.25rem;
		box-shadow: var(--shadow-sm);
		margin-bottom: 0.25rem;
	}
	.lb-tabs {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 0.25rem;
		background: var(--c-gray-100);
		border-radius: 999px;
		padding: 0.2rem;
		margin-bottom: 0.75rem;
	}
	.lb-tab {
		font-size: 0.78rem;
		font-weight: 800;
		color: var(--c-gray-600);
		background: none;
		border: none;
		border-radius: 999px;
		padding: 0.35rem 0.25rem;
		cursor: pointer;
		transition: background .15s, color .15s;
	}
	.lb-tab:hover { color: var(--c-primary); }
	.lb-tab.active {
		background: #fff;
		color: var(--c-primary);
		box-shadow: var(--shadow-sm);
	}
	.lb-empty {
		font-size: 0.85rem;
		font-weight: 700;
		color: var(--c-gray-600);
		text-align: center;
		padding: 0.75rem 0.5rem;
	}
	.lb-my-rank {
		font-size: 0.825rem;
		color: var(--c-gray-700);
		margin-bottom: 0.75rem;
		padding-bottom: 0.5rem;
		border-bottom: 1px solid var(--c-gray-100);
	}
	.lb-list { list-style: none; display: flex; flex-direction: column; gap: 0.25rem; }
	.lb-row {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.45rem 0.5rem;
		border-radius: 0.4rem;
		font-size: 0.875rem;
	}
	.lb-row.lb-top3 { background: #fafff7; }
	.lb-row.lb-me {
		background: var(--c-primary-light);
		border: 1.5px solid var(--c-primary);
		font-weight: 700;
	}
	.lb-pos { width: 1.8rem; text-align: center; font-weight: 700; flex-shrink: 0; }
	.lb-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.lb-lv { font-size: 0.75rem; color: var(--c-gray-500); white-space: nowrap; }
	.lb-xp { font-size: 0.8rem; font-weight: 700; color: var(--c-primary); white-space: nowrap; }

	/* ── Reset section ── */

	/* ── Heatmap ── */
	.heatmap-card {
		background: #fff;
		border-radius: var(--radius);
		padding: 1rem 1.25rem;
		box-shadow: var(--shadow-sm);
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
		font-size: 0.7rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: .08em;
		color: var(--c-gray-600);
	}
	.heatmap-legend {
		display: flex;
		align-items: center;
		gap: 3px;
	}
	.legend-text {
		font-size: 0.6rem;
		color: var(--c-gray-400);
		margin: 0 2px;
	}
	.heat-cell-lg {
		width: 10px;
		height: 10px;
		border-radius: 2px;
		flex-shrink: 0;
	}
	.heat-cell-lg[data-level="0"] { background: var(--c-gray-100); }
	.heat-cell-lg[data-level="1"] { background: #bae6fd; }
	.heat-cell-lg[data-level="2"] { background: #38bdf8; }
	.heat-cell-lg[data-level="3"] { background: #0284c7; }
	.heat-cell-lg[data-level="4"] { background: var(--c-primary-dark); }

	/* Grid layout */
	.heatmap-body {
		display: flex;
		gap: 4px;
	}
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
		color: var(--c-gray-400);
		display: flex;
		align-items: center;
	}
	.heat-grid-wrap {
		flex: 1;
		min-width: 0;
	}
	.month-row {
		display: grid;
		grid-template-columns: repeat(var(--ncols), 1fr);
		gap: 2px;
		height: 16px;
		margin-bottom: 2px;
	}
	.month-row span {
		font-size: 0.6rem;
		color: var(--c-gray-500);
		overflow: visible;
		white-space: nowrap;
	}
	.week-grid {
		display: grid;
		grid-template-columns: repeat(var(--ncols), 1fr);
		grid-template-rows: repeat(7, auto);
		grid-auto-flow: column;
		gap: 2px;
	}
	.heat-cell {
		aspect-ratio: 1;
		border-radius: 2px;
	}
	.heat-cell[data-level="-1"] { background: transparent; }
	.heat-cell[data-level="0"]  { background: var(--c-gray-100); }
	.heat-cell[data-level="1"]  { background: #bae6fd; }
	.heat-cell[data-level="2"]  { background: #38bdf8; }
	.heat-cell[data-level="3"]  { background: #0284c7; }
	.heat-cell[data-level="4"]  { background: var(--c-primary-dark); }
	.heat-cell.today {
		outline: 2px solid var(--c-primary);
		outline-offset: 1px;
	}
	.heatmap-footer {
		margin-top: 0.5rem;
		display: flex;
		justify-content: flex-end;
	}
	.today-label {
		font-size: 0.7rem;
		color: var(--c-gray-500);
	}
	.progress-page { color: var(--c-navy); }
	.sky-header { color: #fff; padding-top: 0.5rem; }
	.sky-header h1 { font-size: 1.65rem; font-weight: 900; letter-spacing: -0.01em; }
	.sky-header p { font-weight: 700; color: #bfdbfe; }
	.sky-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.5rem; margin: 0.25rem 0 0.5rem; }
	.sky-stat { background: var(--c-navy-2); border-radius: 14px; padding: 0.6rem 0.75rem; display: flex; flex-direction: column; color: #fff; }
	.sky-stat strong { font-size: 1.4rem; font-weight: 900; line-height: 1.2; }
	.sky-stat strong.gold { color: var(--c-star); }
	.sky-stat strong.sky { color: var(--c-sky-soft); }
	.sky-stat span { font-size: 0.75rem; font-weight: 800; color: #bfdbfe; }
	.sky-cta { margin: 0.5rem 0; }
	.domain-title { background: var(--c-navy-2); }
</style>
