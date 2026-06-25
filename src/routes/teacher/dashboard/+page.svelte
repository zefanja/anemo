<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	function timeAgo(date: Date | string): string {
		const d = new Date(date);
		const diff = Math.floor((Date.now() - d.getTime()) / 1000);
		if (diff < 60) return 'gerade eben';
		if (diff < 3600) return `vor ${Math.floor(diff / 60)} Min.`;
		if (diff < 86400) return `vor ${Math.floor(diff / 3600)} Std.`;
		return `vor ${Math.floor(diff / 86400)} Tagen`;
	}

	function rankIcon(i: number): string {
		if (i === 0) return '🥇';
		if (i === 1) return '🥈';
		if (i === 2) return '🥉';
		return `${i + 1}.`;
	}

	function pct(v: number): string {
		return `${Math.round(v * 100)}%`;
	}

	// ── Leaderboard sort ───────────────────────────────────────────────────────
	type SortKey = 'displayName' | 'className' | 'level' | 'xp' | 'masteredCount' | 'streakDays';
	let sortKey = $state<SortKey>('xp');
	let sortDir = $state<'asc' | 'desc'>('desc');

	let sortedLeaderboard = $derived(
		[...data.leaderboard].sort((a, b) => {
			const av = a[sortKey];
			const bv = b[sortKey];
			if (typeof av === 'string' && typeof bv === 'string') {
				return sortDir === 'asc' ? av.localeCompare(bv, 'de') : bv.localeCompare(av, 'de');
			}
			return sortDir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number);
		})
	);

	function toggleSort(key: SortKey) {
		if (sortKey === key) {
			sortDir = sortDir === 'asc' ? 'desc' : 'asc';
		} else {
			sortKey = key;
			sortDir = key === 'displayName' || key === 'className' ? 'asc' : 'desc';
		}
	}

	function sortIcon(key: SortKey): string {
		if (sortKey !== key) return '⇅';
		return sortDir === 'asc' ? '▲' : '▼';
	}

	// ── Atom stats ─────────────────────────────────────────────────────────────
	const TOP_N = 5;
	let bestAtoms = $derived(data.atomStats.slice(0, TOP_N));
	let worstAtoms = $derived([...data.atomStats].reverse().slice(0, TOP_N));
</script>

<svelte:head><title>Anemo – Dashboard</title></svelte:head>

<div class="page">
	<h1 class="page-title">Dashboard</h1>

	<!-- Stat cards -->
	<div class="stat-grid">
		<div class="stat-card">
			<div class="stat-num">{data.stats.classCount}</div>
			<div class="stat-lbl">Klassen</div>
		</div>
		<div class="stat-card">
			<div class="stat-num">{data.stats.studentCount}</div>
			<div class="stat-lbl">Schüler</div>
		</div>
		<div class="stat-card">
			<div class="stat-num">{data.stats.masteredCount}</div>
			<div class="stat-lbl">Gemeisterte Atome</div>
		</div>
		<div class="stat-card">
			<div class="stat-num">{data.stats.totalAtoms}</div>
			<div class="stat-lbl">Atome gesamt</div>
		</div>
	</div>

	<div class="two-col">
		<!-- Classes quick-links -->
		<section class="card">
			<div class="card-header">
				<h2>Klassen</h2>
				<a href="/teacher/classes" class="link-more">Alle anzeigen →</a>
			</div>
			{#if data.classes.length === 0}
				<p class="empty-note">Noch keine Klassen angelegt.</p>
				<a href="/teacher/classes" class="btn btn-primary">Erste Klasse anlegen</a>
			{:else}
				<ul class="class-list">
					{#each data.classes as c}
						<li>
							<a href="/teacher/classes/{c.id}" class="class-item">
								<span class="class-name">{c.name}</span>
								<span class="class-count">{c.studentCount} Schüler</span>
							</a>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<!-- Recent activity -->
		<section class="card">
			<div class="card-header">
				<h2>Letzte Aktivitäten</h2>
			</div>
			{#if data.recentAttempts.length === 0}
				<p class="empty-note">Noch keine Versuche vorhanden.</p>
			{:else}
				<ul class="activity-list">
					{#each data.recentAttempts as a}
						<li class="activity-item">
							<span class="activity-dot" class:correct={a.isCorrect} class:wrong={!a.isCorrect}></span>
							<span class="activity-body">
								<strong>{a.studentName}</strong> – {a.atomLabel}
							</span>
							<span class="activity-time">{timeAgo(a.answeredAt)}</span>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	</div>

	<!-- Atom stats -->
	{#if data.atomStats.length > 0}
		<div class="two-col">
			<section class="card">
				<div class="card-header">
					<h2>Gut gemeistert</h2>
					<span class="badge badge-green">Top {bestAtoms.length}</span>
				</div>
				<ul class="atom-list">
					{#each bestAtoms as a}
						<li class="atom-row">
							<div class="atom-meta">
								<span class="atom-label">{a.label}</span>
								<span class="atom-domain">{a.domain}</span>
							</div>
							<div class="atom-bar-wrap">
								<div class="atom-bar">
									<div class="atom-bar-fill fill-green" style="width:{pct(a.masteryRate)}"></div>
								</div>
								<span class="atom-pct">{pct(a.masteryRate)}</span>
								<span class="atom-frac">({a.masteredCount}/{a.studentCount})</span>
							</div>
						</li>
					{/each}
				</ul>
			</section>

			<section class="card">
				<div class="card-header">
					<h2>Schwierige Atome</h2>
					<span class="badge badge-red">Flop {worstAtoms.length}</span>
				</div>
				<ul class="atom-list">
					{#each worstAtoms as a}
						<li class="atom-row">
							<div class="atom-meta">
								<span class="atom-label">{a.label}</span>
								<span class="atom-domain">{a.domain}</span>
							</div>
							<div class="atom-bar-wrap">
								<div class="atom-bar">
									<div class="atom-bar-fill fill-red" style="width:{pct(a.masteryRate)}"></div>
								</div>
								<span class="atom-pct">{pct(a.masteryRate)}</span>
								<span class="atom-frac">({a.masteredCount}/{a.studentCount})</span>
							</div>
						</li>
					{/each}
				</ul>
			</section>
		</div>
	{/if}

	<!-- School-wide leaderboard -->
	{#if data.leaderboard.length > 0}
		<section class="card">
			<div class="card-header">
				<h2>Leaderboard – Schule gesamt</h2>
				<span class="link-more">Top {data.leaderboard.length} · Spalten anklicken zum Sortieren</span>
			</div>
			<div class="lb-table-wrap">
				<table class="lb-table">
					<thead>
						<tr>
							<th class="lb-rank">#</th>
							<th>
								<button class="sort-btn" class:sorted={sortKey === 'displayName'} onclick={() => toggleSort('displayName')}>
									Name <span class="sort-icon" class:active={sortKey === 'displayName'}>{sortIcon('displayName')}</span>
								</button>
							</th>
							<th>
								<button class="sort-btn" class:sorted={sortKey === 'className'} onclick={() => toggleSort('className')}>
									Klasse <span class="sort-icon" class:active={sortKey === 'className'}>{sortIcon('className')}</span>
								</button>
							</th>
							<th class="lb-num">
								<button class="sort-btn sort-btn-right" class:sorted={sortKey === 'level'} onclick={() => toggleSort('level')}>
									<span class="sort-icon" class:active={sortKey === 'level'}>{sortIcon('level')}</span> Level
								</button>
							</th>
							<th class="lb-num">
								<button class="sort-btn sort-btn-right" class:sorted={sortKey === 'xp'} onclick={() => toggleSort('xp')}>
									<span class="sort-icon" class:active={sortKey === 'xp'}>{sortIcon('xp')}</span> XP
								</button>
							</th>
							<th class="lb-num">
								<button class="sort-btn sort-btn-right" class:sorted={sortKey === 'masteredCount'} onclick={() => toggleSort('masteredCount')}>
									<span class="sort-icon" class:active={sortKey === 'masteredCount'}>{sortIcon('masteredCount')}</span> Gemeistert
								</button>
							</th>
							<th class="lb-num">
								<button class="sort-btn sort-btn-right" class:sorted={sortKey === 'streakDays'} onclick={() => toggleSort('streakDays')}>
									<span class="sort-icon" class:active={sortKey === 'streakDays'}>{sortIcon('streakDays')}</span> Streak
								</button>
							</th>
						</tr>
					</thead>
					<tbody>
						{#each sortedLeaderboard as entry, i}
							<tr class:lb-top3={i < 3}>
								<td class="lb-rank">{rankIcon(i)}</td>
								<td class="lb-name">
									<a href="/teacher/classes/{entry.classId}/students/{entry.id}" class="student-link">
										{entry.displayName}
									</a>
								</td>
								<td class="lb-class">
									<a href="/teacher/classes/{entry.classId}" class="class-link">
										{entry.className}
									</a>
								</td>
								<td class="lb-num">Lv.{entry.level}</td>
								<td class="lb-num lb-xp">{entry.xp.toLocaleString('de-DE')}</td>
								<td class="lb-num">{entry.masteredCount}</td>
								<td class="lb-num">🔥 {entry.streakDays}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>
	{/if}
</div>

<style>
	.page { display: flex; flex-direction: column; gap: 1.5rem; }
	.page-title { font-size: 1.5rem; font-weight: 700; margin: 0; }

	.stat-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
		gap: 1rem;
	}
	.stat-card {
		background: #fff;
		border-radius: 0.75rem;
		padding: 1.25rem;
		box-shadow: 0 1px 4px rgba(0,0,0,.07);
		text-align: center;
	}
	.stat-num { font-size: 2rem; font-weight: 800; color: #16a34a; }
	.stat-lbl { font-size: 0.8rem; color: #6b7280; margin-top: 0.25rem; }

	.two-col {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
	}
	@media (max-width: 700px) { .two-col { grid-template-columns: 1fr; } }

	.card {
		background: #fff;
		border-radius: 0.75rem;
		padding: 1.25rem;
		box-shadow: 0 1px 4px rgba(0,0,0,.07);
	}
	.card-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1rem;
	}
	.card-header h2 { font-size: 1rem; font-weight: 700; margin: 0; }
	.link-more { font-size: 0.8rem; color: #16a34a; text-decoration: none; }
	.empty-note { font-size: 0.875rem; color: #9ca3af; margin-bottom: 0.75rem; }

	.badge {
		font-size: 0.7rem;
		font-weight: 700;
		padding: 0.2rem 0.5rem;
		border-radius: 9999px;
	}
	.badge-green { background: #dcfce7; color: #16a34a; }
	.badge-red { background: #fee2e2; color: #dc2626; }

	.class-list { list-style: none; display: flex; flex-direction: column; gap: 0.35rem; }
	.class-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.6rem 0.75rem;
		border-radius: 0.5rem;
		text-decoration: none;
		color: inherit;
		background: #f9fafb;
		transition: background .15s;
	}
	.class-item:hover { background: #f0fdf4; }
	.class-name { font-weight: 600; font-size: 0.9rem; }
	.class-count { font-size: 0.75rem; color: #6b7280; }

	.activity-list { list-style: none; display: flex; flex-direction: column; gap: 0.5rem; }
	.activity-item {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		font-size: 0.85rem;
	}
	.activity-dot {
		width: 8px; height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}
	.activity-dot.correct { background: #16a34a; }
	.activity-dot.wrong { background: #dc2626; }
	.activity-body { flex: 1; color: #374151; }
	.activity-time { font-size: 0.75rem; color: #9ca3af; white-space: nowrap; }

	/* Atom stats */
	.atom-list { list-style: none; display: flex; flex-direction: column; gap: 0.6rem; }
	.atom-row { display: flex; flex-direction: column; gap: 0.2rem; }
	.atom-meta { display: flex; justify-content: space-between; align-items: baseline; }
	.atom-label { font-size: 0.85rem; font-weight: 600; color: #111827; }
	.atom-domain { font-size: 0.7rem; color: #9ca3af; }
	.atom-bar-wrap {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}
	.atom-bar {
		flex: 1;
		height: 6px;
		background: #f3f4f6;
		border-radius: 9999px;
		overflow: hidden;
	}
	.atom-bar-fill {
		height: 100%;
		border-radius: 9999px;
		transition: width 0.3s ease;
	}
	.fill-green { background: #16a34a; }
	.fill-red { background: #dc2626; }
	.atom-pct { font-size: 0.75rem; font-weight: 700; color: #374151; white-space: nowrap; min-width: 2.5rem; text-align: right; }
	.atom-frac { font-size: 0.7rem; color: #9ca3af; white-space: nowrap; }

	/* Leaderboard */
	.lb-table-wrap { overflow-x: auto; }
	.lb-table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
	.lb-table th {
		padding: 0;
		text-align: left;
		font-size: 0.75rem;
		color: #6b7280;
		font-weight: 600;
		border-bottom: 2px solid #e5e7eb;
		background: #f9fafb;
		white-space: nowrap;
	}
	.lb-table th:first-child { padding: 0.5rem 0.25rem; }
	.lb-table td { padding: 0.6rem 0.75rem; border-bottom: 1px solid #f3f4f6; }
	.lb-table tr:last-child td { border-bottom: none; }
	.lb-top3 td { background: #fafff7; }
	.lb-rank { text-align: center; width: 2.5rem; font-weight: 700; }
	.lb-num { text-align: right; white-space: nowrap; }
	.lb-xp { font-weight: 700; color: #16a34a; }
	.lb-name { font-weight: 600; }
	.lb-class { color: #6b7280; font-size: 0.8rem; }
	.student-link { color: inherit; text-decoration: none; }
	.student-link:hover { color: #16a34a; text-decoration: underline; }
	.class-link { color: #6b7280; text-decoration: none; }
	.class-link:hover { color: #16a34a; }

	.sort-btn {
		background: none;
		border: none;
		cursor: pointer;
		font-size: 0.75rem;
		color: #6b7280;
		font-weight: 600;
		padding: 0.5rem 0.75rem;
		display: flex;
		align-items: center;
		gap: 0.35rem;
		white-space: nowrap;
		width: 100%;
		transition: background 0.1s, color 0.1s;
		border-radius: 0;
	}
	.sort-btn:hover {
		background: #f0fdf4;
		color: #15803d;
	}
	.sort-btn-right { justify-content: flex-end; }
	.sort-btn.sorted {
		color: #15803d;
		background: #f0fdf4;
	}
	.sort-icon {
		font-size: 0.7rem;
		opacity: 0.35;
		flex-shrink: 0;
	}
	.sort-icon.active {
		opacity: 1;
		color: #16a34a;
	}
</style>
