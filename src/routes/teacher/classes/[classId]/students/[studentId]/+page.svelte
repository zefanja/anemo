<script lang="ts">
	import type { PageData } from './$types';
	import MathText from '$lib/components/student/MathText.svelte';

	let { data }: { data: PageData } = $props();

	function relativeDate(d: Date | string | null): string {
		if (!d) return '–';
		const diff = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
		if (diff === 0) return 'heute';
		if (diff === 1) return 'gestern';
		if (diff < 30) return `vor ${diff} Tagen`;
		return new Date(d).toLocaleDateString('de-DE');
	}

	function formatDateTime(d: Date | string): string {
		const date = new Date(d);
		return date.toLocaleDateString('de-DE') + ' ' + date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
	}

	function retrievabilityColor(r: number): string {
		if (r >= 0.8) return '#16a34a';
		if (r >= 0.6) return '#d97706';
		return '#dc2626';
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

	// Domain-unlock panel: only relevant when the class has restricted domains
	let lockedDomains = $derived(
		data.class.enabledDomains
			? data.allDomains.filter((d) => !data.class.enabledDomains!.includes(d))
			: []
	);
	let selectedExtras = $state<Set<string>>(new Set(data.student.extraDomains ?? []));
	let savingDomains = $state(false);
	let domainSaveMsg = $state<string | null>(null);

	async function saveExtraDomains() {
		savingDomains = true;
		domainSaveMsg = null;
		const fd = new FormData();
		for (const d of selectedExtras) fd.append('domain', d);
		try {
			const res = await fetch('?/updateExtraDomains', { method: 'POST', body: fd });
			domainSaveMsg = res.ok ? 'Gespeichert.' : 'Fehler beim Speichern.';
		} finally {
			savingDomains = false;
		}
	}

	let searchQuery = $state('');
	let filterStatus = $state<'all' | 'mastered' | 'started' | 'not_started'>('all');

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

	// ── Atom attempt history ───────────────────────────────────────────────────
	type AttemptEntry = {
		id: string;
		isCorrect: boolean;
		answeredAt: string;
		givenAnswer: string | null;
		taskPrompt: string | null;
		correctAnswer: string | null;
	};

	let expandedAtomId = $state<string | null>(null);
	let loadingAtomId = $state<string | null>(null);
	let attemptCache = $state(new Map<string, AttemptEntry[]>());

	async function toggleAtom(atomId: string, hasAttempts: boolean) {
		if (!hasAttempts) return;
		if (expandedAtomId === atomId) {
			expandedAtomId = null;
			return;
		}
		expandedAtomId = atomId;
		if (attemptCache.has(atomId)) return;

		loadingAtomId = atomId;
		try {
			const res = await fetch(
				`/api/teacher/atom-attempts?studentId=${data.student.id}&atomId=${atomId}`
			);
			if (res.ok) {
				const body = await res.json();
				attemptCache = new Map(attemptCache).set(atomId, body.attempts);
			}
		} finally {
			loadingAtomId = null;
		}
	}
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
			<div class="stat-value">{data.inProgressCount}</div>
			<div class="stat-label">In Arbeit</div>
		</div>
		<div class="stat-card">
			<div class="stat-value">{data.totalAtoms - data.masteredCount - data.inProgressCount}</div>
			<div class="stat-label">Noch nicht begonnen</div>
		</div>
	</div>

	<!-- Domain-unlock panel (only shown when class has restricted domains) -->
	{#if lockedDomains.length > 0}
		<div class="domain-unlock-panel">
			<div class="panel-header">
				<span class="panel-title">Zusätzliche Bereiche freischalten</span>
				<span class="panel-sub">Die Klasse hat eingeschränkte Bereiche. Hier kannst du für diesen Schüler weitere freischalten.</span>
			</div>
			<div class="domain-checkboxes">
				{#each lockedDomains as domain}
					<label class="domain-check-label" class:checked={selectedExtras.has(domain)}>
						<input
							type="checkbox"
							checked={selectedExtras.has(domain)}
							onchange={() => {
								const next = new Set(selectedExtras);
								if (next.has(domain)) next.delete(domain);
								else next.add(domain);
								selectedExtras = next;
								domainSaveMsg = null;
							}}
						/>
						{domain}
					</label>
				{/each}
			</div>
			<div class="panel-actions">
				<button class="btn-save" disabled={savingDomains} onclick={saveExtraDomains}>
					{savingDomains ? 'Speichert…' : 'Speichern'}
				</button>
				{#if domainSaveMsg}
					<span class="save-msg">{domainSaveMsg}</span>
				{/if}
			</div>
		</div>
	{/if}

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
				🟡 In Arbeit ({data.inProgressCount})
			</button>
			<button class="filter-btn not-started" class:active={filterStatus === 'not_started'} onclick={() => (filterStatus = 'not_started')}>
				⬜ Nicht begonnen ({data.totalAtoms - data.masteredCount - data.inProgressCount})
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
								<th class="col-chevron"></th>
								<th>Atom</th>
								<th>Status</th>
								<th>Beherrschung</th>
								<th>Versuche</th>
								<th>Richtig</th>
								<th>Zuletzt</th>
								<th>Gemeistert am</th>
									<th>Abrufbarkeit</th>
							</tr>
						</thead>
						<tbody>
							{#each domainGroup.atoms as atom}
								{@const status = atomStatus(atom)}
								{@const isExpanded = expandedAtomId === atom.id}
								{@const isLoading = loadingAtomId === atom.id}
								{@const hasAttempts = atom.totalAttempts > 0}
								{@const cachedAttempts = attemptCache.get(atom.id)}

								<tr
									class="atom-row-{status}"
									class:clickable={hasAttempts}
									class:expanded={isExpanded}
									onclick={() => toggleAtom(atom.id, hasAttempts)}
									title={hasAttempts ? 'Klicken für Aufgaben-Verlauf' : ''}
								>
									<td class="col-chevron">
										{#if hasAttempts}
											<span class="chevron" class:open={isExpanded}>▶</span>
										{/if}
									</td>
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
									<td class="center">
										{#if atom.retrievability !== null}
											<span class="retrievability-badge" style="color: {retrievabilityColor(atom.retrievability)}; border-color: {retrievabilityColor(atom.retrievability)}">
												{Math.round(atom.retrievability * 100)}%
											</span>
										{:else}
											<span class="muted">–</span>
										{/if}
									</td>
								</tr>

								{#if isExpanded}
									<tr class="detail-row">
										<td colspan="8" class="detail-cell">
											{#if isLoading}
												<div class="detail-loading">Lädt…</div>
											{:else if cachedAttempts}
												{#if cachedAttempts.length === 0}
													<div class="detail-empty">Keine Versuche gefunden.</div>
												{:else}
													<div class="detail-header">
														<span class="detail-title">Aufgaben-Verlauf für „{atom.label}"</span>
														<span class="detail-count">{cachedAttempts.length} Versuch{cachedAttempts.length !== 1 ? 'e' : ''}</span>
													</div>
													<table class="attempts-table">
														<thead>
															<tr>
																<th>Zeitpunkt</th>
																<th>Ergebnis</th>
																<th>Aufgabe</th>
																<th>Schülerantwort</th>
																<th>Richtige Lösung</th>
															</tr>
														</thead>
														<tbody>
															{#each cachedAttempts as attempt}
																<tr class:attempt-correct={attempt.isCorrect} class:attempt-wrong={!attempt.isCorrect}>
																	<td class="attempt-time">{formatDateTime(attempt.answeredAt)}</td>
																	<td class="attempt-result">
																		{#if attempt.isCorrect}
																			<span class="result-badge result-correct">✓ Richtig</span>
																		{:else}
																			<span class="result-badge result-wrong">✗ Falsch</span>
																		{/if}
																	</td>
																	<td class="attempt-prompt">
																		{#if attempt.taskPrompt}
																			<MathText text={attempt.taskPrompt} />
																		{:else}
																			<span class="muted">Prozedurale Aufgabe</span>
																		{/if}
																	</td>
																	<td class="attempt-given" class:given-wrong={!attempt.isCorrect}>
																		{#if attempt.givenAnswer !== null}
																			<MathText text={attempt.givenAnswer} />
																		{:else}
																			<span class="muted">–</span>
																		{/if}
																	</td>
																	<td class="attempt-answer" class:answer-hidden={attempt.isCorrect}>
																		{#if attempt.isCorrect}
																			<span class="muted">–</span>
																		{:else}
																			<MathText text={attempt.correctAnswer ?? '–'} />
																		{/if}
																	</td>
																</tr>
															{/each}
														</tbody>
													</table>
												{/if}
											{/if}
										</td>
									</tr>
								{/if}
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
	.atom-row-mastered.clickable:hover td { background: #dcfce7; cursor: pointer; }
	.atom-row-started.clickable:hover td { background: #fffbeb; cursor: pointer; }
	.atom-row-not_started { opacity: 0.6; }
	.atom-row-not_started:hover { opacity: 1; }
	.clickable { cursor: pointer; }
	.expanded td { border-bottom: none; }

	.col-chevron { width: 1.5rem; padding-right: 0; }
	.chevron {
		display: inline-block;
		font-size: 0.6rem;
		color: #9ca3af;
		transition: transform 0.2s;
		transform: rotate(0deg);
	}
	.chevron.open { transform: rotate(90deg); color: #16a34a; }

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

	/* Expanded detail row */
	.detail-row td { border-bottom: 1px solid #e5e7eb; padding: 0; }
	.detail-cell {
		background: #f8fafc;
		padding: 0.75rem 1rem 1rem 2.5rem;
		border-left: 3px solid #16a34a;
	}
	.detail-loading { color: #9ca3af; font-size: 0.8rem; padding: 0.5rem 0; }
	.detail-empty { color: #9ca3af; font-size: 0.8rem; padding: 0.5rem 0; }
	.detail-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.6rem;
	}
	.detail-title { font-size: 0.8rem; font-weight: 700; color: #374151; }
	.detail-count { font-size: 0.75rem; color: #9ca3af; }

	/* Attempts table */
	.attempts-table { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
	.attempts-table th {
		padding: 0.3rem 0.6rem;
		text-align: left;
		font-size: 0.68rem;
		color: #9ca3af;
		font-weight: 600;
		border-bottom: 1px solid #e5e7eb;
		white-space: nowrap;
	}
	.attempts-table td { padding: 0.4rem 0.6rem; border-bottom: 1px solid #f3f4f6; vertical-align: top; }
	.attempts-table tr:last-child td { border-bottom: none; }
	.attempt-correct td { }
	.attempt-wrong td { opacity: 0.85; }
	.attempt-time { white-space: nowrap; color: #6b7280; font-size: 0.75rem; }
	.attempt-result { white-space: nowrap; }
	.result-badge {
		display: inline-block;
		padding: 0.1rem 0.4rem;
		border-radius: 0.25rem;
		font-size: 0.7rem;
		font-weight: 700;
	}
	.result-correct { background: #dcfce7; color: #16a34a; }
	.result-wrong { background: #fee2e2; color: #dc2626; }
	.attempt-prompt { color: #374151; max-width: 300px; }
	.attempt-given { font-size: 0.85rem; font-weight: 600; white-space: nowrap; }
	.attempt-given.given-wrong { color: #dc2626; }
	.attempt-answer { font-size: 0.8rem; white-space: nowrap; color: #16a34a; font-weight: 600; }

	.retrievability-badge {
		display: inline-block;
		padding: 0.1rem 0.45rem;
		border-radius: 0.375rem;
		border: 1.5px solid;
		font-size: 0.72rem;
		font-weight: 700;
	}

	.empty-state { text-align: center; padding: 2rem; color: #9ca3af; }

	/* Domain-unlock panel */
	.domain-unlock-panel {
		background: #fff;
		border: 1.5px solid #d1fae5;
		border-radius: 0.75rem;
		padding: 1rem 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		box-shadow: 0 1px 4px rgba(0,0,0,.05);
	}
	.panel-header { display: flex; flex-direction: column; gap: 0.2rem; }
	.panel-title { font-weight: 700; font-size: 0.9rem; color: #111827; }
	.panel-sub { font-size: 0.78rem; color: #6b7280; }
	.domain-checkboxes {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.domain-check-label {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.35rem 0.7rem;
		border: 1.5px solid #e5e7eb;
		border-radius: 0.5rem;
		font-size: 0.82rem;
		font-weight: 600;
		color: #374151;
		cursor: pointer;
		transition: all .15s;
		background: #f9fafb;
	}
	.domain-check-label:hover { border-color: #6ee7b7; background: #f0fdf4; }
	.domain-check-label.checked { border-color: #16a34a; background: #f0fdf4; color: #15803d; }
	.domain-check-label input { accent-color: #16a34a; width: 15px; height: 15px; }
	.panel-actions { display: flex; align-items: center; gap: 0.75rem; }
	.btn-save {
		padding: 0.4rem 1rem;
		background: #16a34a;
		color: #fff;
		border: none;
		border-radius: 0.5rem;
		font-size: 0.85rem;
		font-weight: 600;
		cursor: pointer;
		transition: background .15s;
	}
	.btn-save:hover:not(:disabled) { background: #15803d; }
	.btn-save:disabled { opacity: 0.6; cursor: not-allowed; }
	.save-msg { font-size: 0.8rem; color: #16a34a; font-weight: 600; }
</style>
