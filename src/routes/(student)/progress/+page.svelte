<script lang="ts">
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let showConfirm = $state(false);
	let resetting = $state(false);

	async function resetProgress() {
		resetting = true;
		try {
			const res = await fetch('/api/reset-progress', { method: 'POST' });
			if (!res.ok) throw new Error();
			goto('/placement');
		} catch {
			resetting = false;
			alert('Fehler beim Zurücksetzen. Bitte versuche es erneut.');
		}
	}

	const BADGE_LABELS: Record<string, string> = {
		first_atom: '🏅 Erstes Atom',
		atoms_10: '⭐ 10 Atome',
		atoms_50: '🌟 50 Atome',
		atoms_all: '🏆 Alle Atome',
		streak_7: '🔥 7-Tage-Streak',
		streak_30: '🔥 30-Tage-Streak',
		cluster_complete: '📦 Bereich fertig'
	};

	function capitalize(s: string): string {
		return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
	}

	function masteryColor(mastery: number, isMastered: boolean): string {
		if (isMastered) return 'mastered';
		if (mastery > 0.5) return 'partial-high';
		if (mastery > 0) return 'partial-low';
		return 'untouched';
	}

	let overallPct = $derived(
		data.totalAtoms > 0 ? Math.round((data.masteredAtoms / data.totalAtoms) * 100) : 0
	);

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
	<!-- ── Overall stats ── -->
	<div class="stats-card">
		<div class="stats-row">
			<div class="stat">
				<span class="stat-value">{data.masteredAtoms}</span>
				<span class="stat-label">Gemeistert</span>
			</div>
			<div class="stat-divider"></div>
			<div class="stat">
				<span class="stat-value">{data.totalAtoms}</span>
				<span class="stat-label">Gesamt</span>
			</div>
			<div class="stat-divider"></div>
			<div class="stat">
				<span class="stat-value">{overallPct}%</span>
				<span class="stat-label">Fortschritt</span>
			</div>
		</div>
		<div class="overall-track">
			<div class="overall-fill" style="width: {overallPct}%"></div>
		</div>
	</div>

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

	<!-- ── Badges ── -->
	{#if data.badges.length > 0}
		<div class="section-title">Abzeichen</div>
		<div class="badges-row">
			{#each data.badges as badge}
				<span class="badge-chip">{BADGE_LABELS[badge] ?? badge}</span>
			{/each}
		</div>
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

	<!-- ── Reset progress ── -->
	<div class="reset-section">
		{#if !showConfirm}
			<button class="reset-btn" onclick={() => showConfirm = true}>
				Lernfortschritt zurücksetzen
			</button>
		{:else}
			<div class="confirm-box">
				<p class="confirm-text">Wirklich alles zurücksetzen? XP, Abzeichen und Lernfortschritt werden gelöscht und der Einstufungstest startet neu.</p>
				<div class="confirm-actions">
					<button class="cancel-btn" onclick={() => showConfirm = false} disabled={resetting}>Abbrechen</button>
					<button class="confirm-reset-btn" onclick={resetProgress} disabled={resetting}>
						{resetting ? 'Wird zurückgesetzt…' : 'Ja, zurücksetzen'}
					</button>
				</div>
			</div>
		{/if}
	</div>

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
	.stats-card {
		background: #fff;
		border-radius: var(--radius);
		padding: 1.25rem;
		box-shadow: var(--shadow-sm);
		margin-bottom: 0.5rem;
	}
	.stats-row {
		display: flex;
		align-items: center;
		justify-content: space-around;
		margin-bottom: 0.75rem;
	}
	.stat {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
	}
	.stat-value {
		font-size: 1.5rem;
		font-weight: 700;
		color: var(--c-primary);
	}
	.stat-label {
		font-size: 0.7rem;
		color: var(--c-gray-600);
		text-transform: uppercase;
		letter-spacing: .05em;
	}
	.stat-divider {
		width: 1px;
		height: 32px;
		background: var(--c-gray-200);
	}
	.overall-track {
		height: 10px;
		background: var(--c-gray-200);
		border-radius: 999px;
		overflow: hidden;
	}
	.overall-fill {
		height: 100%;
		background: var(--c-primary);
		border-radius: 999px;
		transition: width .4s ease;
	}

	/* ── Badges ── */
	.badges-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin-bottom: 0.5rem;
	}
	.badge-chip {
		background: var(--c-primary-light);
		color: var(--c-primary-dark);
		border-radius: 999px;
		padding: 0.3rem 0.75rem;
		font-size: 0.8rem;
		font-weight: 600;
	}

	/* ── Domain sections ── */
	.section-title {
		font-size: 0.7rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: .08em;
		color: var(--c-gray-600);
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
		color: var(--c-gray-600);
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

	/* ── Reset section ── */
	.reset-section {
		margin-top: 0.5rem;
	}
	.reset-btn {
		width: 100%;
		padding: 0.75rem 1rem;
		background: none;
		border: 1px solid var(--c-gray-300);
		border-radius: var(--radius);
		color: var(--c-gray-500);
		font-size: 0.85rem;
		cursor: pointer;
		transition: border-color .15s, color .15s;
	}
	.reset-btn:hover {
		border-color: var(--c-error);
		color: var(--c-error);
	}
	.confirm-box {
		background: #fff;
		border: 1px solid var(--c-error);
		border-radius: var(--radius);
		padding: 1rem;
	}
	.confirm-text {
		font-size: 0.875rem;
		color: var(--c-gray-900);
		margin: 0 0 0.75rem;
	}
	.confirm-actions {
		display: flex;
		gap: 0.5rem;
		justify-content: flex-end;
	}
	.cancel-btn {
		padding: 0.5rem 1rem;
		background: none;
		border: 1px solid var(--c-gray-300);
		border-radius: var(--radius);
		color: var(--c-gray-700);
		font-size: 0.85rem;
		cursor: pointer;
	}
	.cancel-btn:disabled { opacity: 0.5; cursor: default; }
	.confirm-reset-btn {
		padding: 0.5rem 1rem;
		background: var(--c-error);
		border: none;
		border-radius: var(--radius);
		color: #fff;
		font-size: 0.85rem;
		font-weight: 600;
		cursor: pointer;
	}
	.confirm-reset-btn:disabled { opacity: 0.6; cursor: default; }

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
	.heat-cell-lg[data-level="1"] { background: #c7d2fe; }
	.heat-cell-lg[data-level="2"] { background: #818cf8; }
	.heat-cell-lg[data-level="3"] { background: #6366f1; }
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
	.heat-cell[data-level="1"]  { background: #c7d2fe; }
	.heat-cell[data-level="2"]  { background: #818cf8; }
	.heat-cell[data-level="3"]  { background: #6366f1; }
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
</style>
