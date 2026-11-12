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

	let selectedClassId = $state<string | null>(null);

	// ── Leaderboard sort ───────────────────────────────────────────────────────
	type SortKey = 'displayName' | 'className' | 'level' | 'xp' | 'masteredCount' | 'streakDays';
	let sortKey = $state<SortKey>('xp');
	let sortDir = $state<'asc' | 'desc'>('desc');

	const LEADERBOARD_N = 10;
	const ACTIVITY_N = 15;

	let filteredLeaderboard = $derived(
		(selectedClassId === null
			? data.leaderboard
			: data.leaderboard.filter((e) => e.classId === selectedClassId)
		).slice(0, LEADERBOARD_N)
	);

	let sortedLeaderboard = $derived(
		[...filteredLeaderboard].sort((a, b) => {
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

	// ── Atom stats with class filter ───────────────────────────────────────────
	const TOP_N = 5;
	let expandedAtomId = $state<string | null>(null);

	let currentAtomStats = $derived(
		selectedClassId === null
			? data.atomStats
			: (data.classAtomStats.find((c) => c.classId === selectedClassId)?.atomStats ?? [])
	);

	let bestAtoms = $derived(currentAtomStats.slice(0, TOP_N));
	let worstAtoms = $derived([...currentAtomStats].reverse().slice(0, TOP_N));

	function toggleClass(classId: string | null) {
		selectedClassId = classId;
		expandedAtomId = null;
	}

	function toggleAtom(atomId: string) {
		expandedAtomId = expandedAtomId === atomId ? null : atomId;
	}

	let selectedClass = $derived(data.classes.find((c) => c.id === selectedClassId) ?? null);

	let currentStats = $derived.by(() => {
		if (selectedClassId === null) return data.stats;
		const cs = data.classStats.find((c) => c.classId === selectedClassId);
		return {
			...data.stats,
			studentCount: cs?.studentCount ?? 0,
			masteredCount: cs?.masteredCount ?? 0
		};
	});

	let currentActivity = $derived(
		(selectedClassId === null
			? data.recentActivity
			: data.recentActivity.filter((a) => a.classId === selectedClassId)
		).slice(0, ACTIVITY_N)
	);

	const showClassColumn = $derived(selectedClassId === null && data.classAtomStats.length > 1);
</script>

<svelte:head><title>Anemo – Dashboard</title></svelte:head>

<div class="page">
	<h1 class="page-title">Dashboard</h1>

	<!-- Class filter tabs -->
	{#if data.classes.length > 1}
		<div class="class-tabs">
			<button
				class="class-tab"
				class:active={selectedClassId === null}
				onclick={() => toggleClass(null)}
			>
				Alle Klassen
			</button>
			{#each data.classes as cls}
				<button
					class="class-tab"
					class:active={selectedClassId === cls.id}
					onclick={() => toggleClass(cls.id)}
				>
					{cls.name}
				</button>
			{/each}
		</div>
	{/if}

	<!-- Stat cards -->
	<div class="stat-grid">
		<div class="stat-card">
			<div class="stat-num">{data.stats.classCount}</div>
			<div class="stat-lbl">Klassen</div>
		</div>
		<div class="stat-card">
			<div class="stat-num">{currentStats.studentCount}</div>
			<div class="stat-lbl">Schüler</div>
		</div>
		<div class="stat-card">
			<div class="stat-num">{currentStats.masteredCount}</div>
			<div class="stat-lbl">Gemeisterte Atome</div>
		</div>
		<div class="stat-card">
			<div class="stat-num">{data.stats.totalAtoms}</div>
			<div class="stat-lbl">Atome gesamt</div>
		</div>
	</div>

	<!-- Atom stats -->
	{#if data.atomStats.length > 0}
		<div class="two-col">
			<section class="card">
				<div class="card-header">
					<h2>Gut gemeistert</h2>
					<span class="badge badge-green">Top {bestAtoms.length}</span>
				</div>
				{#if bestAtoms.length === 0}
					<p class="empty-note">Keine Daten für diese Klasse.</p>
				{:else}
					<ul class="atom-list">
						{#each bestAtoms as a}
							{@const isExpanded = expandedAtomId === a.atomId + '-best'}
							<li class="atom-row">
								<button class="atom-btn" onclick={() => toggleAtom(a.atomId + '-best')}>
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
										<span class="atom-chevron" class:open={isExpanded}>›</span>
									</div>
								</button>
								{#if isExpanded}
									<ul class="student-detail-list">
										{#each a.students as s}
											<li class="student-detail-row">
												<a
													href="/teacher/classes/{s.classId}/students/{s.studentId}"
													class="student-detail-name"
												>
													{s.displayName}
												</a>
												{#if showClassColumn}
													<span class="student-detail-class">{s.className}</span>
												{/if}
												<div class="student-detail-bar-wrap">
													<div class="student-detail-bar">
														<div class="student-detail-fill fill-green" style="width:{pct(s.mastery)}"></div>
													</div>
													<span class="student-detail-pct">{pct(s.mastery)}</span>
												</div>
												{#if s.isMastered}
													<span class="mastered-badge">✓</span>
												{/if}
											</li>
										{/each}
									</ul>
								{/if}
							</li>
						{/each}
					</ul>
				{/if}
			</section>

			<section class="card">
				<div class="card-header">
					<h2>Schwierige Atome</h2>
					<span class="badge badge-red">Flop {worstAtoms.length}</span>
				</div>
				{#if worstAtoms.length === 0}
					<p class="empty-note">Keine Daten für diese Klasse.</p>
				{:else}
					<ul class="atom-list">
						{#each worstAtoms as a}
							{@const isExpanded = expandedAtomId === a.atomId + '-worst'}
							<li class="atom-row">
								<button class="atom-btn" onclick={() => toggleAtom(a.atomId + '-worst')}>
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
										<span class="atom-chevron" class:open={isExpanded}>›</span>
									</div>
								</button>
								{#if isExpanded}
									<ul class="student-detail-list">
										{#each a.students as s}
											<li class="student-detail-row">
												<a
													href="/teacher/classes/{s.classId}/students/{s.studentId}"
													class="student-detail-name"
												>
													{s.displayName}
												</a>
												{#if showClassColumn}
													<span class="student-detail-class">{s.className}</span>
												{/if}
												<div class="student-detail-bar-wrap">
													<div class="student-detail-bar">
														<div class="student-detail-fill fill-red" style="width:{pct(s.mastery)}"></div>
													</div>
													<span class="student-detail-pct">{pct(s.mastery)}</span>
												</div>
												{#if s.isMastered}
													<span class="mastered-badge">✓</span>
												{/if}
											</li>
										{/each}
									</ul>
								{/if}
							</li>
						{/each}
					</ul>
				{/if}
			</section>
		</div>
	{/if}

	<!-- School-wide leaderboard -->
	{#if sortedLeaderboard.length > 0}
		<section class="card">
			<div class="card-header">
				<h2>Leaderboard – {selectedClass ? selectedClass.name : 'Schule gesamt'}</h2>
				<span class="link-more">Top {sortedLeaderboard.length} · Spalten anklicken zum Sortieren</span>
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
				<h2>Letzte Aktivitäten{selectedClass ? ` – ${selectedClass.name}` : ''}</h2>
			</div>
			{#if currentActivity.length === 0}
				<p class="empty-note">Noch keine Versuche vorhanden.</p>
			{:else}
				<ul class="activity-list">
					{#each currentActivity as a}
						<li class="activity-item">
							<div class="activity-score-wrap">
								<span class="activity-score" title="{a.correct}/{a.total} richtig">
									{a.correct}/{a.total}
								</span>
								<div class="activity-bar">
									<div class="activity-bar-fill" style="width:{a.total > 0 ? Math.round(a.correct/a.total*100) : 0}%"></div>
								</div>
							</div>
							<span class="activity-body">
								<a href="/teacher/classes/{a.classId}/students/{a.studentId}" class="activity-link">
									<strong>{a.studentName}</strong>
								</a>
								<span class="activity-atom">zuletzt: {a.lastAtomLabel}</span>
							</span>
							<span class="activity-time">{timeAgo(a.lastAnsweredAt)}</span>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	</div>
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

	/* Class filter tabs */
	.class-tabs {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}
	.class-tab {
		padding: 0.35rem 0.85rem;
		border-radius: 9999px;
		border: 1.5px solid #e5e7eb;
		background: #f9fafb;
		color: #374151;
		font-size: 0.8rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.15s;
	}
	.class-tab:hover { border-color: #16a34a; color: #16a34a; background: #f0fdf4; }
	.class-tab.active { background: #16a34a; color: #fff; border-color: #16a34a; }

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

	.activity-list { list-style: none; display: flex; flex-direction: column; gap: 0.6rem; }
	.activity-item {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		font-size: 0.85rem;
	}
	.activity-score-wrap {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.15rem;
		flex-shrink: 0;
		width: 3rem;
	}
	.activity-score {
		font-size: 0.7rem;
		font-weight: 700;
		color: #374151;
		white-space: nowrap;
	}
	.activity-bar {
		width: 100%;
		height: 4px;
		background: #f3f4f6;
		border-radius: 9999px;
		overflow: hidden;
	}
	.activity-bar-fill {
		height: 100%;
		background: #16a34a;
		border-radius: 9999px;
	}
	.activity-body {
		flex: 1;
		color: #374151;
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		min-width: 0;
	}
	.activity-link { color: inherit; text-decoration: none; }
	.activity-link:hover { color: #16a34a; text-decoration: underline; }
	.activity-atom {
		font-size: 0.72rem;
		color: #9ca3af;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.activity-time { font-size: 0.75rem; color: #9ca3af; white-space: nowrap; }

	/* Atom stats */
	.atom-list { list-style: none; display: flex; flex-direction: column; gap: 0.4rem; }
	.atom-row { display: flex; flex-direction: column; }

	.atom-btn {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		background: none;
		border: none;
		cursor: pointer;
		text-align: left;
		padding: 0.4rem 0.5rem;
		border-radius: 0.4rem;
		transition: background 0.12s;
		width: 100%;
	}
	.atom-btn:hover { background: #f9fafb; }

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
	.atom-chevron {
		font-size: 1rem;
		color: #9ca3af;
		display: inline-block;
		transition: transform 0.2s;
		line-height: 1;
	}
	.atom-chevron.open { transform: rotate(90deg); }

	/* Student detail list */
	.student-detail-list {
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		background: #f9fafb;
		border-radius: 0.4rem;
		padding: 0.5rem 0.6rem;
		margin: 0 0.1rem 0.2rem;
	}
	.student-detail-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.78rem;
	}
	.student-detail-name {
		min-width: 7rem;
		font-weight: 600;
		color: #111827;
		text-decoration: none;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.student-detail-name:hover { color: #16a34a; text-decoration: underline; }
	.student-detail-class {
		font-size: 0.7rem;
		color: #9ca3af;
		white-space: nowrap;
		min-width: 4rem;
	}
	.student-detail-bar-wrap {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 0.3rem;
		min-width: 0;
	}
	.student-detail-bar {
		flex: 1;
		height: 4px;
		background: #e5e7eb;
		border-radius: 9999px;
		overflow: hidden;
	}
	.student-detail-fill {
		height: 100%;
		border-radius: 9999px;
	}
	.student-detail-pct {
		font-size: 0.7rem;
		color: #6b7280;
		white-space: nowrap;
		min-width: 2rem;
		text-align: right;
	}
	.mastered-badge {
		font-size: 0.7rem;
		color: #16a34a;
		font-weight: 700;
	}

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
