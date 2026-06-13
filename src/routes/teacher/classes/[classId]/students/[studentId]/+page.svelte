<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let searchQuery = $state('');
	let filterStatus = $state<'all' | 'mastered' | 'started' | 'not_started'>('all');

	function relativeDate(d: Date | string | null): string {
		if (!d) return '–';
		const diff = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
		if (diff === 0) return 'heute';
		if (diff === 1) return 'gestern';
		if (diff < 30) return `vor ${diff} Tagen`;
		return new Date(d).toLocaleDateString('de-DE');
	}

	function masteryColor(pct: number, mastered: boolean): string {
		if (mastered) return '#16a34a';
		if (pct >= 60) return '#d97706';
		if (pct > 0) return '#f97316';
		return '#9ca3af';
	}

	function atomStatus(atom: { isMastered: boolean; totalAttempts: number }): 'mastered' | 'started' | 'not_started' {
		if (atom.isMastered) return 'mastered';
		if (atom.totalAttempts > 0) return 'started';
		return 'not_started';
	}

	let overallPct = $derived(
		data.totalAtoms > 0 ? Math.round((data.masteredCount / data.totalAtoms) * 100) : 0
	);

	let filteredDomains = $derived(
		data.atomsByDomain
			.map((d) => ({
				...d,
				atoms: d.atoms.filter((a) => {
					const matchesSearch =
						!searchQuery || a.label.toLowerCase().includes(searchQuery.toLowerCase());
					const matchesFilter =
						filterStatus === 'all' ||
						(filterStatus === 'mastered' && a.isMastered) ||
						(filterStatus === 'started' && !a.isMastered && a.totalAttempts > 0) ||
						(filterStatus === 'not_started' && a.totalAttempts === 0);
					return matchesSearch && matchesFilter;
				})
			}))
			.filter((d) => d.atoms.length > 0)
	);
</script>

<svelte:head>
	<title>Anemo – {data.student.displayName}</title>
</svelte:head>

<div class="page">
	<!-- Header -->
	<div class="page-header">
		<div>
			<a href="/teacher/classes/{data.class.id}" class="breadcrumb">← {data.class.name}</a>
			<h1 class="page-title">{data.student.displayName}</h1>
			<p class="meta">
				{data.student.placementDone ? 'Einstufungstest abgeschlossen' : 'Einstufungstest ausstehend'}
				· Zuletzt aktiv: {relativeDate(data.student.lastActiveAt)}
			</p>
		</div>
	</div>

	<!-- Stats row -->
	<div class="stats-row">
		<div class="stat-card">
			<div class="stat-value">{data.gami.level}</div>
			<div class="stat-label">Level</div>
		</div>
		<div class="stat-card">
			<div class="stat-value">{data.gami.xp}</div>
			<div class="stat-label">XP</div>
		</div>
		<div class="stat-card">
			<div class="stat-value">🔥 {data.gami.streakDays}</div>
			<div class="stat-label">Streak</div>
		</div>
		<div class="stat-card highlight">
			<div class="stat-value">{data.masteredCount}/{data.totalAtoms}</div>
			<div class="stat-label">Gemeistert</div>
			<div class="stat-bar">
				<div class="stat-bar-fill" style="width: {overallPct}%"></div>
			</div>
		</div>
		<div class="stat-card">
			<div class="stat-value">{data.startedCount - data.masteredCount}</div>
			<div class="stat-label">In Arbeit</div>
		</div>
		<div class="stat-card">
			<div class="stat-value">{data.totalAtoms - data.startedCount}</div>
			<div class="stat-label">Noch nicht begonnen</div>
		</div>
	</div>

	<!-- Filters -->
	<div class="filters">
		<input
			type="search"
			class="search-input"
			placeholder="Atom suchen…"
			bind:value={searchQuery}
		/>
		<div class="filter-buttons">
			<button class="filter-btn" class:active={filterStatus === 'all'} onclick={() => (filterStatus = 'all')}>
				Alle ({data.totalAtoms})
			</button>
			<button class="filter-btn mastered" class:active={filterStatus === 'mastered'} onclick={() => (filterStatus = 'mastered')}>
				✅ Gemeistert ({data.masteredCount})
			</button>
			<button class="filter-btn started" class:active={filterStatus === 'started'} onclick={() => (filterStatus = 'started')}>
				🟡 In Arbeit ({data.startedCount - data.masteredCount})
			</button>
			<button class="filter-btn not-started" class:active={filterStatus === 'not_started'} onclick={() => (filterStatus = 'not_started')}>
				⬜ Nicht begonnen ({data.totalAtoms - data.startedCount})
			</button>
		</div>
	</div>

	<!-- Atom list grouped by domain -->
	{#if filteredDomains.length === 0}
		<div class="empty-state">
			<p>Keine Atome gefunden.</p>
		</div>
	{:else}
		{#each filteredDomains as domainGroup}
			{@const domainMastered = domainGroup.atoms.filter((a) => a.isMastered).length}
			{@const domainTotal = domainGroup.atoms.length}
			{@const domainPct = Math.round((domainMastered / domainTotal) * 100)}
			<div class="domain-section">
				<div class="domain-header">
					<div class="domain-title">{domainGroup.domain}</div>
					<div class="domain-meta">
						{domainMastered}/{domainTotal} gemeistert
					</div>
					<div class="domain-bar-wrap">
						<div class="domain-bar">
							<div class="domain-bar-fill" style="width: {domainPct}%; background: {domainPct >= 80 ? '#16a34a' : domainPct >= 50 ? '#d97706' : '#f97316'}"></div>
						</div>
						<span class="domain-pct">{domainPct}%</span>
					</div>
				</div>

				<div class="atom-table-wrap">
					<table class="atom-table">
						<thead>
							<tr>
								<th>Atom</th>
								<th>Status</th>
								<th>Beherrschung</th>
								<th>Versuche</th>
								<th>Richtig</th>
								<th>Zuletzt</th>
								<th>Gemeistert am</th>
							</tr>
						</thead>
						<tbody>
							{#each domainGroup.atoms as atom}
								{@const status = atomStatus(atom)}
								<tr class="atom-row-{status}">
									<td class="atom-label">
										{atom.label}
										{#if atom.subdomain}
											<span class="subdomain">{atom.subdomain}</span>
										{/if}
									</td>
									<td class="atom-status">
										{#if status === 'mastered'}
											<span class="badge badge-mastered">✅ Gemeistert</span>
										{:else if status === 'started'}
											<span class="badge badge-started">🟡 In Arbeit</span>
										{:else}
											<span class="badge badge-not-started">⬜ Nicht begonnen</span>
										{/if}
									</td>
									<td class="atom-mastery">
										{#if atom.totalAttempts > 0}
											<div class="mastery-wrap">
												<div class="mastery-bar">
													<div
														class="mastery-bar-fill"
														style="width: {atom.mastery}%; background: {masteryColor(atom.mastery, atom.isMastered)}"
													></div>
												</div>
												<span class="mastery-pct" style="color: {masteryColor(atom.mastery, atom.isMastered)}">
													{atom.mastery}%
												</span>
											</div>
										{:else}
											<span class="muted">–</span>
										{/if}
									</td>
									<td class="center">{atom.totalAttempts > 0 ? atom.totalAttempts : '–'}</td>
									<td class="center">
										{#if atom.totalAttempts > 0}
											<span style="color: {atom.correctAttempts / atom.totalAttempts >= 0.7 ? '#16a34a' : '#d97706'}">
												{atom.correctAttempts}
												<span class="muted">({Math.round(atom.correctAttempts / atom.totalAttempts * 100)}%)</span>
											</span>
										{:else}
											<span class="muted">–</span>
										{/if}
									</td>
									<td class="center muted">{relativeDate(atom.lastPracticedAt)}</td>
									<td class="center muted">{relativeDate(atom.masteredAt)}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>
		{/each}
	{/if}
</div>

<style>
	.page { display: flex; flex-direction: column; gap: 1.25rem; }
	.page-header { }
	.page-title { font-size: 1.5rem; font-weight: 700; margin: 0.25rem 0; }
	.breadcrumb { font-size: 0.8rem; color: #6b7280; text-decoration: none; }
	.breadcrumb:hover { color: #16a34a; }
	.meta { font-size: 0.8rem; color: #9ca3af; margin: 0; }

	/* Stats row */
	.stats-row {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
		gap: 0.75rem;
	}
	.stat-card {
		background: #fff;
		border-radius: 0.75rem;
		padding: 0.875rem 1rem;
		box-shadow: 0 1px 4px rgba(0,0,0,.07);
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}
	.stat-card.highlight { border: 2px solid #16a34a; }
	.stat-value { font-size: 1.35rem; font-weight: 800; color: #111827; }
	.stat-label { font-size: 0.7rem; color: #9ca3af; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
	.stat-bar { height: 4px; background: #e5e7eb; border-radius: 99px; margin-top: 0.35rem; overflow: hidden; }
	.stat-bar-fill { height: 100%; background: #16a34a; border-radius: 99px; transition: width .3s; }

	/* Filters */
	.filters { display: flex; gap: 0.75rem; flex-wrap: wrap; align-items: center; }
	.search-input {
		padding: 0.45rem 0.75rem;
		border: 1.5px solid #d1d5db;
		border-radius: 0.5rem;
		font-size: 0.875rem;
		outline: none;
		width: 200px;
	}
	.search-input:focus { border-color: #16a34a; }
	.filter-buttons { display: flex; gap: 0.375rem; flex-wrap: wrap; }
	.filter-btn {
		padding: 0.35rem 0.75rem;
		border: 1.5px solid #e5e7eb;
		border-radius: 0.5rem;
		background: #fff;
		font-size: 0.8rem;
		font-weight: 600;
		color: #6b7280;
		cursor: pointer;
		transition: all .15s;
	}
	.filter-btn:hover { border-color: #d1d5db; background: #f9fafb; }
	.filter-btn.active { background: #f0fdf4; border-color: #16a34a; color: #15803d; }
	.filter-btn.mastered.active { background: #f0fdf4; border-color: #16a34a; }
	.filter-btn.started.active { background: #fffbeb; border-color: #d97706; color: #92400e; }
	.filter-btn.not-started.active { background: #f9fafb; border-color: #9ca3af; color: #374151; }

	/* Domain section */
	.domain-section {
		background: #fff;
		border-radius: 0.75rem;
		box-shadow: 0 1px 4px rgba(0,0,0,.07);
		overflow: hidden;
	}
	.domain-header {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0.75rem 1rem;
		background: #f9fafb;
		border-bottom: 1px solid #e5e7eb;
		flex-wrap: wrap;
	}
	.domain-title { font-weight: 700; font-size: 0.95rem; color: #111827; flex: 1; min-width: 100px; }
	.domain-meta { font-size: 0.8rem; color: #6b7280; white-space: nowrap; }
	.domain-bar-wrap { display: flex; align-items: center; gap: 0.5rem; min-width: 120px; }
	.domain-bar { flex: 1; height: 6px; background: #e5e7eb; border-radius: 99px; overflow: hidden; }
	.domain-bar-fill { height: 100%; border-radius: 99px; transition: width .3s; }
	.domain-pct { font-size: 0.75rem; font-weight: 700; color: #6b7280; white-space: nowrap; }

	/* Atom table */
	.atom-table-wrap { overflow-x: auto; }
	.atom-table { width: 100%; border-collapse: collapse; font-size: 0.825rem; }
	.atom-table th {
		padding: 0.5rem 0.875rem;
		text-align: left;
		font-size: 0.7rem;
		color: #9ca3af;
		font-weight: 600;
		border-bottom: 1px solid #f3f4f6;
		white-space: nowrap;
	}
	.atom-table td { padding: 0.55rem 0.875rem; border-bottom: 1px solid #f9fafb; }
	.atom-table tr:last-child td { border-bottom: none; }
	.atom-row-mastered td { background: #f0fdf4; }
	.atom-row-mastered:hover td { background: #dcfce7; }
	.atom-row-started:hover td { background: #fffbeb; }
	.atom-row-not_started { opacity: 0.6; }
	.atom-row-not_started:hover { opacity: 1; }
	.atom-label { font-weight: 600; }
	.subdomain { font-size: 0.7rem; color: #9ca3af; font-weight: 400; margin-left: 0.35rem; }
	.atom-status { white-space: nowrap; }
	.badge {
		display: inline-block;
		padding: 0.15rem 0.5rem;
		border-radius: 0.375rem;
		font-size: 0.7rem;
		font-weight: 700;
		white-space: nowrap;
	}
	.badge-mastered { background: #f0fdf4; color: #15803d; }
	.badge-started { background: #fffbeb; color: #92400e; }
	.badge-not-started { background: #f9fafb; color: #9ca3af; }
	.atom-mastery { min-width: 120px; }
	.mastery-wrap { display: flex; align-items: center; gap: 0.5rem; }
	.mastery-bar { flex: 1; height: 6px; background: #e5e7eb; border-radius: 99px; overflow: hidden; }
	.mastery-bar-fill { height: 100%; border-radius: 99px; transition: width .3s; }
	.mastery-pct { font-size: 0.75rem; font-weight: 700; white-space: nowrap; min-width: 35px; text-align: right; }
	.center { text-align: center; }
	.muted { color: #9ca3af; }

	.empty-state { text-align: center; padding: 2rem; color: #9ca3af; }
</style>
