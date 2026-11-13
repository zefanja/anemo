<script lang="ts">
	import { untrack } from 'svelte';
	import type { PageData } from './$types';
	import MathText from '$lib/components/student/MathText.svelte';
	import ActivityCharts from '$lib/components/teacher/ActivityCharts.svelte';
	import TIcon from '$lib/components/teacher/TIcon.svelte';

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

	function retrievabilityClass(r: number): string {
		if (r >= 0.8) return 'badge-green';
		if (r >= 0.6) return 'badge-blue';
		return 'badge-orange';
	}

	function masteryClass(atom: { isMastered: boolean }): string {
		return atom.isMastered ? 'green' : '';
	}

	let initials = $derived.by(() => {
		const parts = data.student.displayName.trim().split(/\s+/);
		return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
	});

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
	let selectedExtras = $state<Set<string>>(untrack(() => new Set(data.student.extraDomains ?? [])));
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

{#snippet statusBadge(status: 'mastered' | 'started' | 'not_started')}
	{#if status === 'mastered'}
		<span class="badge badge-green">Gemeistert</span>
	{:else if status === 'started'}
		<span class="badge badge-blue">In Arbeit</span>
	{:else}
		<span class="badge">Nicht begonnen</span>
	{/if}
{/snippet}

{#snippet attemptHistory(atomId: string, label: string)}
	{@const cachedAttempts = attemptCache.get(atomId)}
	{#if loadingAtomId === atomId}
		<div class="detail-note">Lädt …</div>
	{:else if cachedAttempts}
		{#if cachedAttempts.length === 0}
			<div class="detail-note">Keine Versuche gefunden.</div>
		{:else}
			<div class="history">
				<div class="history-head">
					<span class="history-title">Aufgaben-Verlauf für „{label}"</span>
					<span class="history-count">{cachedAttempts.length} Versuch{cachedAttempts.length !== 1 ? 'e' : ''}</span>
				</div>
				<ul class="attempts">
					{#each cachedAttempts as attempt}
						<li class="attempt">
							<span class="result" class:ok={attempt.isCorrect} aria-label={attempt.isCorrect ? 'richtig' : 'falsch'}>{attempt.isCorrect ? '✓' : '✗'}</span>
							<span class="attempt-prompt">
								{#if attempt.taskPrompt}
									<MathText text={attempt.taskPrompt} />
								{:else}
									<span class="muted">Prozedurale Aufgabe</span>
								{/if}
							</span>
							<span class="attempt-answers">
								<span class="given" class:wrong={!attempt.isCorrect}>
									<span class="lbl">Antwort</span>
									{#if attempt.givenAnswer !== null}<MathText text={attempt.givenAnswer} />{:else}–{/if}
								</span>
								{#if !attempt.isCorrect}
									<span class="solution"><span class="lbl">Lösung</span><MathText text={attempt.correctAnswer ?? '–'} /></span>
								{/if}
							</span>
							<span class="attempt-time">{formatDateTime(attempt.answeredAt)}</span>
						</li>
					{/each}
				</ul>
			</div>
		{/if}
	{/if}
{/snippet}

<div class="page">
	<!-- Header -->
	<div class="head">
		<nav class="breadcrumb" aria-label="Brotkrumen">
			<a href="/teacher/classes">Klassen</a><span aria-hidden="true">›</span>
			<a href="/teacher/classes/{data.class.id}">{data.class.name}</a><span aria-hidden="true">›</span>
			<span>{data.student.displayName}</span>
		</nav>
		<div class="profile">
			<span class="big-avatar" aria-hidden="true">{initials}</span>
			<div class="profile-text">
				<h1 class="page-title">{data.student.displayName}</h1>
				<span class="page-sub">
					Klasse {data.class.name} · zuletzt aktiv {relativeDate(data.student.lastActiveAt)} ·
					{data.student.placementDone ? 'Einstufung abgeschlossen' : 'Einstufung ausstehend'}
				</span>
			</div>
		</div>
	</div>

	<!-- Stats -->
	<div class="tiles">
		<div class="stat-card"><span class="stat-lbl">Level</span><span class="stat-num">{data.gami.level}</span></div>
		<div class="stat-card"><span class="stat-lbl">XP</span><span class="stat-num">{data.gami.xp.toLocaleString('de-DE')}</span></div>
		<div class="stat-card"><span class="stat-lbl">Streak</span><span class="stat-num streak">{data.gami.streakDays} <small>{data.gami.streakDays === 1 ? 'Tag' : 'Tage'}</small></span></div>
		<div class="stat-card">
			<span class="stat-lbl">Gemeistert</span>
			<span class="stat-num mastered">{data.masteredCount} <small>/ {data.totalAtoms}</small></span>
			<span class="track thin"><span class="green" style="width:{overallPct}%"></span></span>
		</div>
		<div class="stat-card"><span class="stat-lbl">In Arbeit</span><span class="stat-num working">{data.inProgressCount}</span></div>
		<div class="stat-card"><span class="stat-lbl">Nicht begonnen</span><span class="stat-num open">{data.totalAtoms - data.masteredCount - data.inProgressCount}</span></div>
	</div>

	<!-- Activity: time spent, tasks done, mastery trend -->
	<ActivityCharts dailyStats={data.dailyStats} masteryTimeline={data.masteryTimeline} />

	<!-- Domain-unlock panel (only shown when class has restricted domains) -->
	{#if lockedDomains.length > 0}
		<section class="card unlock">
			<div class="card-header">
				<div>
					<h2>Zusätzliche Bereiche freischalten</h2>
					<span class="card-sub">Die Klasse hat eingeschränkte Bereiche. Hier kannst du für diese:n Schüler:in weitere freischalten.</span>
				</div>
			</div>
			<div class="chips">
				{#each lockedDomains as domain}
					<label class="chip-btn check" class:active={selectedExtras.has(domain)}>
						<input
							type="checkbox"
							class="sr-only"
							checked={selectedExtras.has(domain)}
							onchange={() => {
								const next = new Set(selectedExtras);
								if (next.has(domain)) next.delete(domain);
								else next.add(domain);
								selectedExtras = next;
								domainSaveMsg = null;
							}}
						/>
						{#if selectedExtras.has(domain)}<TIcon name="check" size={16} />{/if}
						{domain}
					</label>
				{/each}
			</div>
			<div class="unlock-actions">
				<button class="btn btn-primary btn-sm" disabled={savingDomains} onclick={saveExtraDomains}>
					{savingDomains ? 'Speichert …' : 'Speichern'}
				</button>
				{#if domainSaveMsg}
					<span class="save-msg" role="status">{domainSaveMsg}</span>
				{/if}
			</div>
		</section>
	{/if}

	<!-- Atoms -->
	<section class="card atoms-card">
		<div class="card-header">
			<h2>Atome</h2>
			<label class="search atom-search">
				<TIcon name="search" size={18} />
				<span class="sr-only">Atom suchen</span>
				<input type="search" placeholder="Atom suchen …" bind:value={searchQuery} />
			</label>
		</div>
		<div class="chips scroll filter-chips" role="group" aria-label="Status-Filter">
			<button class="chip-btn" class:active={filterStatus === 'all'} aria-pressed={filterStatus === 'all'} onclick={() => (filterStatus = 'all')}>
				Alle · {data.totalAtoms}
			</button>
			<button class="chip-btn" class:active={filterStatus === 'mastered'} aria-pressed={filterStatus === 'mastered'} onclick={() => (filterStatus = 'mastered')}>
				<span class="dot" style="background:var(--c-success)"></span>Gemeistert · {data.masteredCount}
			</button>
			<button class="chip-btn" class:active={filterStatus === 'started'} aria-pressed={filterStatus === 'started'} onclick={() => (filterStatus = 'started')}>
				<span class="dot" style="background:var(--c-primary)"></span>In Arbeit · {data.inProgressCount}
			</button>
			<button class="chip-btn" class:active={filterStatus === 'not_started'} aria-pressed={filterStatus === 'not_started'} onclick={() => (filterStatus = 'not_started')}>
				<span class="dot" style="background:var(--c-gray-400)"></span>Nicht begonnen · {data.totalAtoms - data.masteredCount - data.inProgressCount}
			</button>
		</div>

		{#if filteredDomains.length === 0}
			<p class="empty-note">Keine Atome gefunden.</p>
		{:else}
			{#each filteredDomains as domainGroup}
				{@const domainMastered = domainGroup.atoms.filter((a) => a.isMastered).length}
				{@const domainTotal = domainGroup.atoms.length}
				{@const domainPct = Math.round((domainMastered / domainTotal) * 100)}
				<div class="domain-section">
					<div class="domain-header">
						<h3 class="domain-title">{domainGroup.domain}</h3>
						<span class="domain-meta">{domainMastered}/{domainTotal} gemeistert</span>
						<span class="track domain-track"><span class="green" style="width:{domainPct}%"></span></span>
						<span class="domain-pct">{domainPct}%</span>
					</div>

					<!-- Desktop table -->
					<div class="table-wrap desktop-only">
						<table class="t-table atom-table">
							<thead>
								<tr>
									<th class="col-chevron"><span class="sr-only">Verlauf</span></th>
									<th>Atom</th>
									<th>Status</th>
									<th>Beherrschung</th>
									<th class="num">Versuche</th>
									<th class="num">Richtig</th>
									<th>Zuletzt</th>
									<th>Gemeistert am</th>
									<th>Abrufbarkeit</th>
								</tr>
							</thead>
							<tbody>
								{#each domainGroup.atoms as atom}
									{@const status = atomStatus(atom)}
									{@const isExpanded = expandedAtomId === atom.id}
									{@const hasAttempts = atom.totalAttempts > 0}
									<tr class:clickable={hasAttempts} class:expanded={isExpanded} onclick={() => toggleAtom(atom.id, hasAttempts)}>
										<td class="col-chevron">
											{#if hasAttempts}
												<button
													class="chev-btn"
													class:open={isExpanded}
													aria-expanded={isExpanded}
													aria-label="Aufgaben-Verlauf für {atom.label}"
													onclick={(e) => { e.stopPropagation(); toggleAtom(atom.id, hasAttempts); }}
												>›</button>
											{/if}
										</td>
										<td class="atom-label">
											{atom.label}
											{#if atom.subdomain}<span class="subdomain">{atom.subdomain}</span>{/if}
										</td>
										<td>{@render statusBadge(status)}</td>
										<td class="mastery-cell">
											{#if hasAttempts}
												<span class="mastery"><span class="track"><span class={masteryClass(atom)} style="width:{atom.mastery}%"></span></span><span class="mastery-pct">{atom.mastery}%</span></span>
											{:else}<span class="muted">–</span>{/if}
										</td>
										<td class="num">{hasAttempts ? atom.totalAttempts : '–'}</td>
										<td class="num">
											{#if hasAttempts}
												{atom.correctAttempts} <span class="muted">({Math.round(atom.correctAttempts / atom.totalAttempts * 100)}%)</span>
											{:else}<span class="muted">–</span>{/if}
										</td>
										<td class="muted">{relativeDate(atom.lastPracticedAt)}</td>
										<td class="muted">{relativeDate(atom.masteredAt)}</td>
										<td>
											{#if atom.retrievability !== null}
												<span class="badge {retrievabilityClass(atom.retrievability)}">{Math.round(atom.retrievability * 100)}%</span>
											{:else}<span class="muted">–</span>{/if}
										</td>
									</tr>
									{#if isExpanded}
										<tr class="detail-row">
											<td colspan="9">{@render attemptHistory(atom.id, atom.label)}</td>
										</tr>
									{/if}
								{/each}
							</tbody>
						</table>
					</div>

					<!-- Mobile list -->
					<ul class="m-list atom-mlist">
						{#each domainGroup.atoms as atom}
							{@const status = atomStatus(atom)}
							{@const isExpanded = expandedAtomId === atom.id}
							{@const hasAttempts = atom.totalAttempts > 0}
							<li class="m-atom" class:expanded={isExpanded}>
								<button class="m-atom-btn" disabled={!hasAttempts} aria-expanded={hasAttempts ? isExpanded : undefined} onclick={() => toggleAtom(atom.id, hasAttempts)}>
									<span class="m-atom-top"><span class="m-atom-label">{atom.label}</span>{@render statusBadge(status)}</span>
									{#if hasAttempts}
										<span class="mastery"><span class="track thin"><span class={masteryClass(atom)} style="width:{atom.mastery}%"></span></span><span class="mastery-pct">{atom.mastery}%</span></span>
										<span class="m-meta">
											<span>{atom.totalAttempts} Versuche · {atom.correctAttempts} richtig</span>
											<span>{relativeDate(atom.lastPracticedAt)}</span>
											{#if atom.retrievability !== null}<span>Abrufbarkeit {Math.round(atom.retrievability * 100)}%</span>{/if}
										</span>
									{/if}
								</button>
								{#if isExpanded}
									<div class="m-history">{@render attemptHistory(atom.id, atom.label)}</div>
								{/if}
							</li>
						{/each}
					</ul>
				</div>
			{/each}
		{/if}
	</section>
</div>

<style>
	.head { display: flex; flex-direction: column; gap: 0.5rem; }
	.profile { display: flex; align-items: center; gap: 1rem; }
	.profile-text { display: flex; flex-direction: column; min-width: 0; }
	.big-avatar {
		width: 4.25rem; height: 4.25rem; flex: none; border-radius: 50%;
		background: var(--c-sky); color: var(--c-navy);
		display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 1.6rem;
	}

	.tiles { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 0.875rem; }
	.tiles .stat-num { font-size: 1.6rem; }
	.stat-num small { font-size: 0.85rem; font-weight: 800; color: var(--c-ink-2); }
	.streak { color: var(--c-orange-text); }
	.mastered { color: var(--c-success-dark); }
	.working { color: var(--c-primary-dark); }
	.open { color: var(--c-ink-2); }
	.tiles .track { flex: none; margin-top: 0.35rem; }

	.unlock .card-header { margin-bottom: 0.6rem; }
	.chip-btn.check { cursor: pointer; }
	.unlock-actions { display: flex; align-items: center; gap: 0.75rem; margin-top: 0.875rem; }
	.save-msg { font-size: 0.875rem; font-weight: 800; color: var(--c-success-dark); }

	.atom-search { width: 100%; max-width: 20rem; }
	.filter-chips { margin-bottom: 0.5rem; }

	.domain-section { margin-top: 1.25rem; }
	.domain-header {
		display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;
		padding: 0.5rem 0; border-bottom: 2px solid var(--c-line);
	}
	.domain-title { font-size: 0.8rem !important; font-weight: 900; text-transform: uppercase; letter-spacing: 0.08em; color: var(--c-primary) !important; }
	.domain-meta { font-size: 0.8rem; font-weight: 800; color: var(--c-ink-2); }
	.domain-track { max-width: 10rem; margin-left: auto; }
	.domain-pct { font-size: 0.85rem; font-weight: 900; min-width: 2.6rem; text-align: right; }

	.atom-table th { border-bottom-width: 1px; }
	.atom-table tr.clickable { cursor: pointer; }
	.atom-table tr.expanded td { background: var(--c-ground); }
	.col-chevron { width: 2.25rem; padding-right: 0 !important; }
	.chev-btn {
		width: 1.9rem; height: 1.9rem; border: 0; background: none; border-radius: 8px; cursor: pointer;
		font: 900 1.2rem var(--font); color: var(--c-ink-2); transition: transform 0.15s;
	}
	.chev-btn:hover { background: var(--c-track); color: var(--c-navy); }
	.chev-btn.open { transform: rotate(90deg); color: var(--c-primary); }
	.atom-label { font-weight: 800; min-width: 12rem; }
	.subdomain { display: block; font-size: 0.75rem; font-weight: 800; color: var(--c-ink-2); }
	.mastery-cell { min-width: 10rem; }
	.mastery { display: flex; align-items: center; gap: 0.5rem; }
	.mastery-pct { font-size: 0.85rem; font-weight: 900; min-width: 2.5rem; text-align: right; }
	.muted { color: var(--c-ink-2); font-weight: 700; }
	.t-table td.muted { white-space: nowrap; }
	.detail-row td { background: var(--c-ground) !important; padding-top: 0 !important; }

	/* Attempt history */
	.detail-note { padding: 0.75rem; font-weight: 800; color: var(--c-ink-2); }
	.history { background: #fff; border: 1px solid var(--c-line); border-radius: 14px; padding: 0.75rem 1rem; }
	.history-head { display: flex; justify-content: space-between; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.25rem; }
	.history-title { font-size: 0.75rem; font-weight: 900; text-transform: uppercase; letter-spacing: 0.06em; color: var(--c-ink-2); }
	.history-count { font-size: 0.8rem; font-weight: 800; color: var(--c-ink-2); }
	.attempts { list-style: none; display: flex; flex-direction: column; }
	.attempt {
		display: grid; grid-template-columns: 1.75rem minmax(0, 1.4fr) minmax(0, 1fr) auto;
		gap: 0.75rem; align-items: center; padding: 0.5rem 0; border-top: 1px solid var(--c-track); font-size: 0.9rem;
	}
	.result {
		width: 1.6rem; height: 1.6rem; border-radius: 50%; display: flex; align-items: center; justify-content: center;
		font-weight: 900; background: var(--c-orange-light); color: var(--c-orange-text);
	}
	.result.ok { background: var(--c-success-light); color: var(--c-success-dark); }
	.attempt-prompt { font-weight: 800; min-width: 0; overflow-wrap: anywhere; }
	.attempt-answers { display: flex; flex-wrap: wrap; gap: 0.25rem 1rem; font-weight: 800; }
	.attempt-answers .lbl { font-size: 0.7rem; font-weight: 900; text-transform: uppercase; letter-spacing: 0.05em; color: var(--c-ink-2); margin-right: 0.35rem; }
	.given.wrong { color: var(--c-orange-text); }
	.attempt-time { font-size: 0.8rem; font-weight: 700; color: var(--c-ink-2); white-space: nowrap; }

	/* Mobile atoms */
	.m-atom { border-bottom: 1px solid var(--c-track); }
	.m-atom:last-child { border-bottom: 0; }
	.m-atom.expanded { background: var(--c-ground); margin: 0 -1rem; padding: 0 1rem 0.75rem; }
	.m-atom-btn {
		width: 100%; display: flex; flex-direction: column; gap: 0.35rem; padding: 0.75rem 0;
		border: 0; background: none; text-align: left; font: inherit; color: inherit; cursor: pointer;
	}
	.m-atom-btn:disabled { cursor: default; opacity: 1; }
	.m-atom-top { display: flex; justify-content: space-between; align-items: baseline; gap: 0.5rem; }
	.m-atom-label { font-weight: 800; font-size: 0.95rem; }
	.m-history .history { padding: 0.5rem 0.75rem; }
	.m-history .attempt { grid-template-columns: 1.75rem minmax(0, 1fr); row-gap: 0.15rem; }
	.m-history .attempt-answers, .m-history .attempt-time { grid-column: 2; }

	@media (max-width: 1100px) { .tiles { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
	@media (max-width: 899px) {
		.big-avatar { width: 3.5rem; height: 3.5rem; font-size: 1.3rem; }
		.tiles { gap: 0.5rem; }
		.tiles .stat-card { padding: 0.6rem 0.7rem; align-items: center; text-align: center; }
		.tiles .stat-num { font-size: 1.25rem; order: -1; }
		.tiles .stat-lbl { font-size: 0.72rem; }
		.tiles .stat-num small { display: none; }
		.atom-search { max-width: none; }
		.domain-track { margin-left: 0; flex: 1 1 6rem; max-width: none; }
	}
</style>
