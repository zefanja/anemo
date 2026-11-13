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

	function rankClass(i: number): string {
		return i < 3 ? `rank r${i + 1}` : 'rank';
	}

	function initials(name: string): string {
		let parts = name.trim().split(/\s+/);
		// single-word names like "LustigerKoala" → "LK"
		if (parts.length === 1) parts = parts[0].split(/(?=[A-ZÄÖÜ])/);
		return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
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

	type LbPeriod = 'day' | 'week' | 'month' | 'all';
	const LB_PERIODS: { key: LbPeriod; label: string; xpLabel: string }[] = [
		{ key: 'day', label: 'Heute', xpLabel: 'XP heute' },
		{ key: 'week', label: 'Woche', xpLabel: 'XP Woche' },
		{ key: 'month', label: 'Monat', xpLabel: 'XP Monat' },
		{ key: 'all', label: 'Gesamt', xpLabel: 'XP' }
	];
	let lbPeriod = $state<LbPeriod>('week');
	const lbPeriodInfo = $derived(LB_PERIODS.find((p) => p.key === lbPeriod)!);

	// In a period view `xp` is the XP earned in that period; only students who
	// earned XP in it are listed. Top N is taken by XP before column sorting.
	let filteredLeaderboard = $derived(
		(selectedClassId === null
			? data.leaderboard
			: data.leaderboard.filter((e) => e.classId === selectedClassId)
		)
			.map((e) => ({ ...e, xp: lbPeriod === 'all' ? e.xp : e.periodXp[lbPeriod] }))
			.filter((e) => lbPeriod === 'all' || e.xp > 0)
			.sort((a, b) => b.xp - a.xp)
			.slice(0, LEADERBOARD_N)
	);

	const hasStudents = $derived(
		selectedClassId === null
			? data.leaderboard.length > 0
			: data.leaderboard.some((e) => e.classId === selectedClassId)
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

	// Students who earned XP today count as "active today"
	const scopedStudents = $derived(
		selectedClassId === null ? data.leaderboard : data.leaderboard.filter((e) => e.classId === selectedClassId)
	);
	const activeToday = $derived(scopedStudents.filter((e) => e.periodXp.day > 0).length);
	const weekXp = $derived(scopedStudents.reduce((sum, e) => sum + e.periodXp.week, 0));
	const avgMastered = $derived(
		currentStats.studentCount > 0 ? Math.round(currentStats.masteredCount / currentStats.studentCount) : 0
	);
	function classActivity(classId: string) {
		const list = data.leaderboard.filter((e) => e.classId === classId);
		const active = list.filter((e) => e.periodXp.day > 0).length;
		return { active, pct: list.length > 0 ? Math.round((active / list.length) * 100) : 0 };
	}

	const showClassColumn = $derived(selectedClassId === null && data.classAtomStats.length > 1);
</script>

<svelte:head><title>Anemo – Dashboard</title></svelte:head>

{#snippet atomCard(title: string, badge: string, badgeClass: string, list: typeof bestAtoms, kind: 'best' | 'worst')}
	<section class="card">
		<div class="card-header">
			<h2>{title}</h2>
			<span class="badge {badgeClass}">{badge}</span>
		</div>
		{#if list.length === 0}
			<p class="empty-note">Keine Daten für diese Klasse.</p>
		{:else}
			<ul class="atom-list">
				{#each list as a}
					{@const key = a.atomId + '-' + kind}
					{@const isExpanded = expandedAtomId === key}
					<li class="atom-row">
						<button class="atom-btn" onclick={() => toggleAtom(key)} aria-expanded={isExpanded}>
							<span class="atom-meta">
								<span class="atom-label">{a.label}</span>
								<span class="atom-domain">{a.domain}</span>
							</span>
							<span class="atom-bar-wrap">
								<span class="track"><span class:orange={kind === 'worst'} style="width:{pct(a.masteryRate)}"></span></span>
								<span class="atom-pct">{pct(a.masteryRate)}</span>
								<span class="atom-frac">{a.masteredCount}/{a.studentCount}</span>
								<span class="atom-chevron" class:open={isExpanded} aria-hidden="true">›</span>
							</span>
						</button>
						{#if isExpanded}
							<ul class="student-detail-list">
								{#each a.students as s}
									<li class="student-detail-row">
										<a href="/teacher/classes/{s.classId}/students/{s.studentId}" class="student-detail-name">{s.displayName}</a>
										{#if showClassColumn}
											<span class="student-detail-class">{s.className}</span>
										{/if}
										<span class="track thin sd-track"><span class:orange={kind === 'worst'} style="width:{pct(s.mastery)}"></span></span>
										<span class="student-detail-pct">{pct(s.mastery)}</span>
										<span class="mastered-badge" aria-label={s.isMastered ? 'gemeistert' : undefined}>{s.isMastered ? '✓' : ''}</span>
									</li>
								{/each}
							</ul>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</section>
{/snippet}

<div class="page">
	<div class="page-header">
		<div>
			<span class="page-sub">{new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
			<h1 class="page-title">Dashboard</h1>
		</div>
		{#if data.classes.length > 1}
			<div class="seg desktop-only" role="tablist" aria-label="Klassenfilter">
				<button role="tab" aria-selected={selectedClassId === null} class:active={selectedClassId === null} onclick={() => toggleClass(null)}>Alle Klassen</button>
				{#each data.classes as cls}
					<button role="tab" aria-selected={selectedClassId === cls.id} class:active={selectedClassId === cls.id} onclick={() => toggleClass(cls.id)}>{cls.name}</button>
				{/each}
			</div>
		{/if}
	</div>

	{#if data.classes.length > 1}
		<div class="chips scroll mobile-only" role="tablist" aria-label="Klassenfilter">
			<button class="chip-btn" role="tab" aria-selected={selectedClassId === null} class:active={selectedClassId === null} onclick={() => toggleClass(null)}>Alle Klassen</button>
			{#each data.classes as cls}
				<button class="chip-btn" role="tab" aria-selected={selectedClassId === cls.id} class:active={selectedClassId === cls.id} onclick={() => toggleClass(cls.id)}>{cls.name}</button>
			{/each}
		</div>
	{/if}

	<div class="stat-grid">
		<div class="stat-card">
			<span class="stat-lbl">Schüler:innen</span>
			<span class="stat-num">{currentStats.studentCount}</span>
			<span class="stat-sub" class:pos={activeToday > 0}>{activeToday} heute aktiv</span>
		</div>
		<div class="stat-card">
			<span class="stat-lbl">Gemeisterte Atome</span>
			<span class="stat-num">{currentStats.masteredCount.toLocaleString('de-DE')}</span>
			<span class="stat-sub">Ø {avgMastered} pro Schüler:in</span>
		</div>
		<div class="stat-card">
			<span class="stat-lbl">XP diese Woche</span>
			<span class="stat-num">{weekXp.toLocaleString('de-DE')}</span>
			<span class="stat-sub">{selectedClass ? `Klasse ${selectedClass.name}` : 'alle Klassen'}</span>
		</div>
		<div class="stat-card">
			<span class="stat-lbl">Atome gesamt</span>
			<span class="stat-num">{data.stats.totalAtoms}</span>
			<span class="stat-sub">{data.stats.classCount} {data.stats.classCount === 1 ? 'Klasse' : 'Klassen'}</span>
		</div>
	</div>

	{#if data.atomStats.length > 0}
		<div class="grid-2">
			{@render atomCard('Schwierige Atome', 'Brauchen Hilfe', 'badge-orange', worstAtoms, 'worst')}
			{@render atomCard('Gut gemeistert', `Top ${bestAtoms.length}`, 'badge-blue', bestAtoms, 'best')}
		</div>
	{/if}

	{#if hasStudents}
		<section class="card">
			<div class="card-header">
				<div class="lb-title">
					<h2>Rangliste · {selectedClass ? selectedClass.name : 'Schule gesamt'}</h2>
					{#if sortedLeaderboard.length > 0}
						<span class="card-sub desktop-only">Top {sortedLeaderboard.length} · Spalten anklicken zum Sortieren</span>
					{/if}
				</div>
				<div class="seg stretch" role="tablist" aria-label="Zeitraum">
					{#each LB_PERIODS as p}
						<button type="button" role="tab" aria-selected={lbPeriod === p.key} class:active={lbPeriod === p.key} onclick={() => (lbPeriod = p.key)}>{p.label}</button>
					{/each}
				</div>
			</div>
			{#if sortedLeaderboard.length === 0}
				<p class="empty-note">
					{lbPeriod === 'day' ? 'Heute' : lbPeriod === 'week' ? 'Diese Woche' : 'Diesen Monat'} hat noch niemand XP gesammelt.
				</p>
			{:else}
				<div class="table-wrap desktop-only">
					<table class="t-table">
						<thead>
							<tr>
								<th style="width:3rem">#</th>
								<th><button class="sort-btn" class:sorted={sortKey === 'displayName'} onclick={() => toggleSort('displayName')}>Name <span class="sort-icon" class:active={sortKey === 'displayName'}>{sortIcon('displayName')}</span></button></th>
								<th><button class="sort-btn" class:sorted={sortKey === 'className'} onclick={() => toggleSort('className')}>Klasse <span class="sort-icon" class:active={sortKey === 'className'}>{sortIcon('className')}</span></button></th>
								<th class="num"><button class="sort-btn" class:sorted={sortKey === 'level'} onclick={() => toggleSort('level')}><span class="sort-icon" class:active={sortKey === 'level'}>{sortIcon('level')}</span> Level</button></th>
								<th class="num"><button class="sort-btn" class:sorted={sortKey === 'xp'} onclick={() => toggleSort('xp')}><span class="sort-icon" class:active={sortKey === 'xp'}>{sortIcon('xp')}</span> {lbPeriodInfo.xpLabel}</button></th>
								<th class="num"><button class="sort-btn" class:sorted={sortKey === 'masteredCount'} onclick={() => toggleSort('masteredCount')}><span class="sort-icon" class:active={sortKey === 'masteredCount'}>{sortIcon('masteredCount')}</span> Gemeistert</button></th>
								<th class="num"><button class="sort-btn" class:sorted={sortKey === 'streakDays'} onclick={() => toggleSort('streakDays')}><span class="sort-icon" class:active={sortKey === 'streakDays'}>{sortIcon('streakDays')}</span> Streak</button></th>
							</tr>
						</thead>
						<tbody>
							{#each sortedLeaderboard as entry, i}
								<tr>
									<td><span class={rankClass(i)}>{i + 1}</span></td>
									<td><a href="/teacher/classes/{entry.classId}/students/{entry.id}">{entry.displayName}</a></td>
									<td><a href="/teacher/classes/{entry.classId}" class="badge">{entry.className}</a></td>
									<td class="num">Lv. {entry.level}</td>
									<td class="num xp">{lbPeriod === 'all' ? '' : '+'}{entry.xp.toLocaleString('de-DE')}</td>
									<td class="num">{entry.masteredCount}</td>
									<td class="num streak">{entry.streakDays > 0 ? `${entry.streakDays} ${entry.streakDays === 1 ? 'Tag' : 'Tage'}` : '–'}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				<ul class="m-list">
					{#each sortedLeaderboard as entry, i}
						<li>
							<a href="/teacher/classes/{entry.classId}/students/{entry.id}" class="m-row">
								<span class={rankClass(i)}>{i + 1}</span>
								<span class="m-main">
									<span class="m-title">{entry.displayName}</span>
									<span class="m-meta"><span>{entry.className}</span><span>Lv. {entry.level}</span><span>{entry.masteredCount} gemeistert</span>{#if entry.streakDays > 0}<span class="streak">{entry.streakDays} {entry.streakDays === 1 ? 'Tag' : 'Tage'} Streak</span>{/if}</span>
								</span>
								<span class="xp">{lbPeriod === 'all' ? '' : '+'}{entry.xp.toLocaleString('de-DE')}</span>
							</a>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	{/if}

	<div class="grid-2">
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
						{@const act = classActivity(c.id)}
						<li>
							<a href="/teacher/classes/{c.id}" class="class-item">
								<span class="class-name">{c.name}</span>
								<span class="class-body">
									<span class="class-count">{c.studentCount} Schüler:innen · {act.active} heute aktiv</span>
									<span class="track thin"><span style="width:{act.pct}%"></span></span>
								</span>
								<span class="m-chev" aria-hidden="true">›</span>
							</a>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<section class="card">
			<div class="card-header">
				<h2>Letzte Aktivität{selectedClass ? ` · ${selectedClass.name}` : ''}</h2>
			</div>
			{#if currentActivity.length === 0}
				<p class="empty-note">Noch keine Versuche vorhanden.</p>
			{:else}
				<ul class="activity-list">
					{#each currentActivity as a}
						{@const rate = a.total > 0 ? a.correct / a.total : 0}
						<li class="activity-item">
							<span class="avatar" class:good={rate >= 0.7} class:weak={rate < 0.5} aria-hidden="true">{initials(a.studentName)}</span>
							<span class="activity-body">
								<a href="/teacher/classes/{a.classId}/students/{a.studentId}" class="activity-link">{a.studentName}</a>
								<span class="activity-atom">zuletzt: {a.lastAtomLabel}</span>
							</span>
							<span class="activity-side">
								<span class="activity-score" title="{a.correct} von {a.total} richtig">{a.correct}/{a.total} richtig</span>
								<span class="activity-time">{timeAgo(a.lastAnsweredAt)}</span>
							</span>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	</div>
</div>

<style>
	.stat-sub.pos { color: var(--c-success-dark); }

	/* Atom stats */
	.atom-list { list-style: none; display: flex; flex-direction: column; }
	.atom-row { display: flex; flex-direction: column; border-bottom: 1px solid var(--c-track); }
	.atom-row:last-child { border-bottom: 0; }
	.atom-btn {
		display: flex; flex-direction: column; gap: 0.35rem; width: 100%;
		background: none; border: 0; cursor: pointer; text-align: left;
		padding: 0.6rem 0.4rem; border-radius: 10px; font: inherit; color: inherit;
	}
	.atom-btn:hover { background: #f8fbfe; }
	.atom-meta { display: flex; justify-content: space-between; align-items: baseline; gap: 0.75rem; }
	.atom-label { font-size: 0.95rem; font-weight: 800; color: var(--c-navy); }
	.atom-domain { font-size: 0.75rem; font-weight: 800; color: var(--c-ink-2); white-space: nowrap; }
	.atom-bar-wrap { display: flex; align-items: center; gap: 0.6rem; }
	.atom-pct { font-size: 0.875rem; font-weight: 900; min-width: 2.6rem; text-align: right; }
	.atom-frac { font-size: 0.8rem; font-weight: 700; color: var(--c-ink-2); min-width: 2.8rem; }
	.atom-chevron { font-size: 1.15rem; font-weight: 900; color: var(--c-ink-2); transition: transform 0.2s; line-height: 1; }
	.atom-chevron.open { transform: rotate(90deg); }

	.student-detail-list {
		list-style: none; display: flex; flex-direction: column;
		background: var(--c-ground); border-radius: 14px; padding: 0.35rem 0.75rem; margin: 0 0 0.6rem;
	}
	.student-detail-row { display: flex; align-items: center; gap: 0.6rem; font-size: 0.875rem; min-height: 2.25rem; }
	.student-detail-name {
		flex: 1 1 8rem; min-width: 0; font-weight: 800; color: var(--c-navy); text-decoration: none;
		white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
	}
	.student-detail-name:hover { color: var(--c-primary); }
	.student-detail-class { font-size: 0.75rem; font-weight: 800; color: var(--c-ink-2); min-width: 2rem; }
	.sd-track { max-width: 7rem; }
	.student-detail-pct { font-size: 0.8rem; font-weight: 800; min-width: 2.4rem; text-align: right; }
	.mastered-badge { width: 1rem; color: var(--c-success); font-weight: 900; }

	/* Leaderboard */
	.lb-title { display: flex; flex-direction: column; gap: 0.1rem; }
	.xp { font-weight: 900; color: var(--c-primary-dark); white-space: nowrap; }
	.streak { color: var(--c-orange-text); font-weight: 900; }
	.t-table .badge { text-decoration: none; }

	/* Classes */
	.class-list { list-style: none; display: flex; flex-direction: column; gap: 0.5rem; }
	.class-item {
		display: flex; align-items: center; gap: 0.875rem; padding: 0.6rem 0.75rem;
		border: 2px solid var(--c-line); border-radius: 14px; text-decoration: none; color: var(--c-navy);
		transition: border-color 0.15s;
	}
	.class-item:hover { border-color: var(--c-primary); }
	.class-name {
		min-width: 2.75rem; height: 2.75rem; padding: 0 0.5rem; flex: none; border-radius: 14px;
		background: var(--c-primary-light); color: var(--c-primary-dark);
		display: flex; align-items: center; justify-content: center; font-weight: 900;
	}
	.class-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.35rem; }
	.class-count { font-size: 0.9rem; font-weight: 800; }
	.class-body .track { flex: none; }

	/* Activity */
	.activity-list { list-style: none; display: flex; flex-direction: column; gap: 0.75rem; }
	.activity-item { display: flex; align-items: center; gap: 0.75rem; }
	.avatar { background: var(--c-primary-light); color: var(--c-primary-dark); }
	.avatar.good { background: var(--c-success-light); color: var(--c-success-dark); }
	.avatar.weak { background: var(--c-orange-light); color: var(--c-orange-text); }
	.activity-body { flex: 1; min-width: 0; display: flex; flex-direction: column; }
	.activity-link { font-weight: 800; color: var(--c-navy); text-decoration: none; }
	.activity-link:hover { color: var(--c-primary); }
	.activity-atom { font-size: 0.8rem; font-weight: 700; color: var(--c-ink-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.activity-side { display: flex; flex-direction: column; align-items: flex-end; gap: 0.05rem; flex: none; }
	.activity-score { font-size: 0.8rem; font-weight: 900; color: var(--c-navy); white-space: nowrap; }
	.activity-time { font-size: 0.75rem; font-weight: 800; color: var(--c-ink-2); white-space: nowrap; }

	@media (max-width: 899px) {
		.atom-frac { display: none; }
		.atom-meta { flex-direction: column; gap: 0.1rem; }
	}
</style>
