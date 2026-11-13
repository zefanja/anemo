<script lang="ts">
	import type { PageData } from './$types';
	import TIcon from '$lib/components/teacher/TIcon.svelte';
	import type { FsrsStateLabel } from './+page.server';

	let { data }: { data: PageData } = $props();

	function pct(v: number): string {
		return `${Math.round(v * 100)}%`;
	}

	const FSRS_OPTIONS: { key: FsrsStateLabel; label: string; color: string; text: string }[] = [
		{ key: 'none', label: 'Kein FSRS', color: '#cbd5e1', text: '#4a5b78' },
		{ key: 'new', label: 'Neu', color: '#7dd3fc', text: '#0a4f99' },
		{ key: 'learning', label: 'Lernen', color: '#fcd34d', text: '#92400e' },
		{ key: 'review', label: 'Wiederholung', color: '#16a34a', text: '#166534' },
		{ key: 'relearning', label: 'Neu lernen', color: '#f97316', text: '#c2410c' }
	];
	const FSRS_COLOR = new Map(FSRS_OPTIONS.map((o) => [o.key, o.color]));
	const FSRS_TEXT = new Map(FSRS_OPTIONS.map((o) => [o.key, o.text]));
	const FSRS_LABEL = new Map(FSRS_OPTIONS.map((o) => [o.key, o.label]));

	// ── Filters ──────────────────────────────────────────────────────────────
	let selectedClassId = $state<string | null>(null);
	let masteryMin = $state(0);
	let masteryMax = $state(100);
	let activeFsrsStates = $state<Set<FsrsStateLabel>>(new Set(FSRS_OPTIONS.map((o) => o.key)));
	let expandedAtomId = $state<string | null>(null);

	function toggleFsrsState(key: FsrsStateLabel) {
		const next = new Set(activeFsrsStates);
		if (next.has(key)) {
			if (next.size > 1) next.delete(key);
		} else {
			next.add(key);
		}
		activeFsrsStates = next;
	}

	function toggleClass(classId: string | null) {
		selectedClassId = classId;
		expandedAtomId = null;
	}

	function resetFilters() {
		selectedClassId = null;
		masteryMin = 0;
		masteryMax = 100;
		activeFsrsStates = new Set(FSRS_OPTIONS.map((o) => o.key));
	}

	let filtersActive = $derived(
		selectedClassId !== null ||
			masteryMin > 0 ||
			masteryMax < 100 ||
			activeFsrsStates.size < FSRS_OPTIONS.length
	);

	let filteredRows = $derived(
		data.rows.filter((r) => {
			if (selectedClassId !== null && r.classId !== selectedClassId) return false;
			const masteryPct = r.mastery * 100;
			if (masteryPct < masteryMin || masteryPct > masteryMax) return false;
			if (!activeFsrsStates.has(r.fsrsState as FsrsStateLabel)) return false;
			return true;
		})
	);

	type Row = (typeof data.rows)[number];
	type AtomAgg = {
		atomId: string;
		atomLabel: string;
		domain: string;
		studentCount: number;
		masteredCount: number;
		masterySum: number;
		firstTryTotal: number;
		firstTryCorrectCount: number;
		fsrsCounts: Record<FsrsStateLabel, number>;
		students: Row[];
	};

	let atomStats = $derived.by(() => {
		const map = new Map<string, AtomAgg>();
		for (const r of filteredRows) {
			let entry = map.get(r.atomId);
			if (!entry) {
				entry = {
					atomId: r.atomId,
					atomLabel: r.atomLabel,
					domain: r.domain,
					studentCount: 0,
					masteredCount: 0,
					masterySum: 0,
					firstTryTotal: 0,
					firstTryCorrectCount: 0,
					fsrsCounts: { none: 0, new: 0, learning: 0, review: 0, relearning: 0 },
					students: []
				};
				map.set(r.atomId, entry);
			}
			entry.studentCount++;
			if (r.isMastered) entry.masteredCount++;
			entry.masterySum += r.mastery;
			entry.fsrsCounts[r.fsrsState as FsrsStateLabel]++;
			if (r.firstTryCorrect !== null) {
				entry.firstTryTotal++;
				if (r.firstTryCorrect) entry.firstTryCorrectCount++;
			}
			entry.students.push(r);
		}
		return Array.from(map.values()).map((e) => ({
			...e,
			avgMastery: e.studentCount > 0 ? e.masterySum / e.studentCount : 0,
			masteryRate: e.studentCount > 0 ? e.masteredCount / e.studentCount : 0,
			firstTryRate: e.firstTryTotal > 0 ? e.firstTryCorrectCount / e.firstTryTotal : null,
			students: [...e.students].sort((a, b) => a.mastery - b.mastery)
		}));
	});

	// ── Sorting ──────────────────────────────────────────────────────────────
	type SortKey =
		| 'atomLabel'
		| 'domain'
		| 'studentCount'
		| 'avgMastery'
		| 'masteryRate'
		| 'firstTryRate';
	let sortKey = $state<SortKey>('firstTryRate');
	let sortDir = $state<'asc' | 'desc'>('asc');

	function toggleSort(key: SortKey) {
		if (sortKey === key) {
			sortDir = sortDir === 'asc' ? 'desc' : 'asc';
		} else {
			sortKey = key;
			sortDir = key === 'atomLabel' || key === 'domain' ? 'asc' : 'desc';
		}
	}

	function sortIcon(key: SortKey): string {
		if (sortKey !== key) return '⇅';
		return sortDir === 'asc' ? '▲' : '▼';
	}

	let sortedAtomStats = $derived(
		[...atomStats].sort((a, b) => {
			const av = a[sortKey];
			const bv = b[sortKey];
			if (typeof av === 'string' && typeof bv === 'string') {
				return sortDir === 'asc' ? av.localeCompare(bv, 'de') : bv.localeCompare(av, 'de');
			}
			// atoms without first-try data always sort to the bottom
			if (av === null && bv === null) return 0;
			if (av === null) return 1;
			if (bv === null) return -1;
			return sortDir === 'asc'
				? (av as number) - (bv as number)
				: (bv as number) - (av as number);
		})
	);

	function toggleAtom(atomId: string) {
		expandedAtomId = expandedAtomId === atomId ? null : atomId;
	}

	function fsrsSegments(e: (typeof atomStats)[number]) {
		if (e.studentCount === 0) return [];
		return FSRS_OPTIONS.filter((o) => e.fsrsCounts[o.key] > 0).map((o) => ({
			...o,
			count: e.fsrsCounts[o.key],
			widthPct: (e.fsrsCounts[o.key] / e.studentCount) * 100
		}));
	}

	const showClassColumn = $derived(selectedClassId === null && data.classes.length > 1);
</script>

<svelte:head><title>Anemo – Atom-Insights</title></svelte:head>

{#snippet studentList(a: (typeof sortedAtomStats)[number])}
	<ul class="student-detail-list">
		{#each a.students as s}
			<li class="student-detail-row">
				<a href="/teacher/classes/{s.classId}/students/{s.studentId}" class="student-detail-name">{s.displayName}</a>
				{#if showClassColumn}
					<span class="student-detail-class">{s.className}</span>
				{/if}
				<span class="sd-bar">
					<span class="track thin"><span class:green={s.isMastered} class:orange={!s.isMastered && s.mastery < 0.5} style="width:{pct(s.mastery)}"></span></span>
					<span class="student-detail-pct">{pct(s.mastery)}</span>
				</span>
				<span class="sd-badges">
					{#if s.firstTryCorrect === true}
						<span class="badge badge-green">✓ Erstversuch</span>
					{:else if s.firstTryCorrect === false}
						<span class="badge badge-orange">✗ Erstversuch</span>
					{/if}
					<span class="badge fsrs-badge" style="--dot:{FSRS_COLOR.get(s.fsrsState as FsrsStateLabel)};color:{FSRS_TEXT.get(s.fsrsState as FsrsStateLabel)}">
						{FSRS_LABEL.get(s.fsrsState as FsrsStateLabel)}
					</span>
					{#if s.isMastered}<span class="badge badge-green">gemeistert</span>{/if}
				</span>
			</li>
		{/each}
	</ul>
{/snippet}

{#snippet fsrsBar(a: (typeof sortedAtomStats)[number])}
	<div class="fsrs-bar" role="img" aria-label={'FSRS: ' + fsrsSegments(a).map((s) => `${s.label} ${s.count}`).join(', ')} title={fsrsSegments(a).map((s) => `${s.label}: ${s.count}`).join(' · ')}>
		{#each fsrsSegments(a) as seg}
			<span class="fsrs-seg" style="width:{seg.widthPct}%;background:{seg.color}"></span>
		{/each}
	</div>
{/snippet}

<div class="page">
	<div class="page-header">
		<div>
			<h1 class="page-title">Atom-Insights</h1>
			<p class="page-sub intro">
				Welche Atome sitzen direkt – und wo scheitern Schüler:innen oft beim ersten Versuch?
			</p>
		</div>
	</div>

	<!-- Filters -->
	<section class="card filter-card">
		<div class="filter-row">
			<span class="filter-label" id="lbl-class">Klasse</span>
			<div class="chips scroll" role="group" aria-labelledby="lbl-class">
				<button class="chip-btn" class:active={selectedClassId === null} aria-pressed={selectedClassId === null} onclick={() => toggleClass(null)}>Alle Klassen</button>
				{#each data.classes as c}
					<button class="chip-btn" class:active={selectedClassId === c.id} aria-pressed={selectedClassId === c.id} onclick={() => toggleClass(c.id)}>{c.name}</button>
				{/each}
			</div>
		</div>

		<div class="filter-row">
			<span class="filter-label" id="lbl-fsrs">FSRS-Status</span>
			<div class="chips scroll" role="group" aria-labelledby="lbl-fsrs">
				{#each FSRS_OPTIONS as o}
					<button class="chip-btn fsrs-chip" class:on={activeFsrsStates.has(o.key)} aria-pressed={activeFsrsStates.has(o.key)} onclick={() => toggleFsrsState(o.key)}>
						<span class="dot" style="background:{o.color}"></span>
						{o.label}
					</button>
				{/each}
			</div>
		</div>

		<div class="filter-row">
			<span class="filter-label">Mastery</span>
			<div class="range-wrap">
				<label class="range-field">
					<span>Min <b>{masteryMin} %</b></span>
					<input type="range" min="0" max="100" bind:value={masteryMin} />
				</label>
				<label class="range-field">
					<span>Max <b>{masteryMax} %</b></span>
					<input type="range" min="0" max="100" bind:value={masteryMax} />
				</label>
			</div>
		</div>

		<div class="filter-footer">
			<span class="filter-count">{sortedAtomStats.length} Atome · {filteredRows.length} Schüler-Atom-Ergebnisse</span>
			{#if filtersActive}
				<button class="btn btn-ghost btn-sm" onclick={resetFilters}><TIcon name="refresh" size={16} />Filter zurücksetzen</button>
			{/if}
		</div>
	</section>

	<!-- Atom table -->
	<section class="card">
		{#if sortedAtomStats.length === 0}
			<p class="empty-note">Keine Atome für diese Filterkombination.</p>
		{:else}
			<div class="table-wrap desktop-only">
				<table class="t-table">
					<thead>
						<tr>
							<th style="width:2rem"><span class="sr-only">Details</span></th>
							<th><button class="sort-btn" class:sorted={sortKey === 'domain'} onclick={() => toggleSort('domain')}>Domäne <span class="sort-icon" class:active={sortKey === 'domain'}>{sortIcon('domain')}</span></button></th>
							<th><button class="sort-btn" class:sorted={sortKey === 'atomLabel'} onclick={() => toggleSort('atomLabel')}>Atom <span class="sort-icon" class:active={sortKey === 'atomLabel'}>{sortIcon('atomLabel')}</span></button></th>
							<th class="num"><button class="sort-btn" class:sorted={sortKey === 'studentCount'} onclick={() => toggleSort('studentCount')}><span class="sort-icon" class:active={sortKey === 'studentCount'}>{sortIcon('studentCount')}</span> Schüler</button></th>
							<th class="num"><button class="sort-btn" class:sorted={sortKey === 'avgMastery'} onclick={() => toggleSort('avgMastery')}><span class="sort-icon" class:active={sortKey === 'avgMastery'}>{sortIcon('avgMastery')}</span> Ø Mastery</button></th>
							<th class="num"><button class="sort-btn" class:sorted={sortKey === 'masteryRate'} onclick={() => toggleSort('masteryRate')}><span class="sort-icon" class:active={sortKey === 'masteryRate'}>{sortIcon('masteryRate')}</span> Gemeistert</button></th>
							<th class="num"><button class="sort-btn" class:sorted={sortKey === 'firstTryRate'} onclick={() => toggleSort('firstTryRate')}><span class="sort-icon" class:active={sortKey === 'firstTryRate'}>{sortIcon('firstTryRate')}</span> Erstversuch richtig</button></th>
							<th>FSRS-Verteilung</th>
						</tr>
					</thead>
					<tbody>
						{#each sortedAtomStats as a}
							{@const isExpanded = expandedAtomId === a.atomId}
							<tr class="tbl-row" class:expanded={isExpanded} onclick={() => toggleAtom(a.atomId)}>
								<td>
									<button class="chev-btn" class:open={isExpanded} aria-expanded={isExpanded} aria-label="Schüler:innen für {a.atomLabel}" onclick={(e) => { e.stopPropagation(); toggleAtom(a.atomId); }}>›</button>
								</td>
								<td class="tbl-domain">{a.domain}</td>
								<td class="tbl-label">{a.atomLabel}</td>
								<td class="num">{a.studentCount}</td>
								<td class="num">{pct(a.avgMastery)}</td>
								<td class="num">{pct(a.masteryRate)} <span class="tbl-frac">({a.masteredCount}/{a.studentCount})</span></td>
								<td class="num">
									{#if a.firstTryRate === null}
										<span class="tbl-frac">–</span>
									{:else}
										<span class="badge" class:badge-orange={a.firstTryRate < 0.5} class:badge-green={a.firstTryRate >= 0.8} class:badge-blue={a.firstTryRate >= 0.5 && a.firstTryRate < 0.8}>{pct(a.firstTryRate)}</span>
										<span class="tbl-frac">({a.firstTryCorrectCount}/{a.firstTryTotal})</span>
									{/if}
								</td>
								<td class="tbl-fsrs">{@render fsrsBar(a)}</td>
							</tr>
							{#if isExpanded}
								<tr class="detail-row">
									<td colspan="8">{@render studentList(a)}</td>
								</tr>
							{/if}
						{/each}
					</tbody>
				</table>
			</div>

			<!-- Mobile -->
			<div class="mobile-only m-sort">
				<label for="m-sort" class="hint">Sortieren nach</label>
				<select id="m-sort" value={sortKey} onchange={(e) => { const k = (e.target as HTMLSelectElement).value as typeof sortKey; sortKey = k; sortDir = k === 'atomLabel' || k === 'domain' ? 'asc' : k === 'firstTryRate' ? 'asc' : 'desc'; }}>
					<option value="firstTryRate">Erstversuch richtig</option>
					<option value="avgMastery">Ø Mastery</option>
					<option value="masteryRate">Gemeistert</option>
					<option value="studentCount">Schüler</option>
					<option value="atomLabel">Atom</option>
					<option value="domain">Domäne</option>
				</select>
				<button class="icon-btn" aria-label={sortDir === 'asc' ? 'Aufsteigend – umkehren' : 'Absteigend – umkehren'} onclick={() => (sortDir = sortDir === 'asc' ? 'desc' : 'asc')}>{sortDir === 'asc' ? '▲' : '▼'}</button>
			</div>
			<ul class="m-list">
				{#each sortedAtomStats as a}
					{@const isExpanded = expandedAtomId === a.atomId}
					<li class="m-atom" class:expanded={isExpanded}>
						<button class="m-atom-btn" aria-expanded={isExpanded} onclick={() => toggleAtom(a.atomId)}>
							<span class="m-atom-top">
								<span class="m-atom-label">{a.atomLabel}</span>
								{#if a.firstTryRate !== null}
									<span class="badge" class:badge-orange={a.firstTryRate < 0.5} class:badge-green={a.firstTryRate >= 0.8} class:badge-blue={a.firstTryRate >= 0.5 && a.firstTryRate < 0.8}>{pct(a.firstTryRate)} 1. Versuch</span>
								{/if}
							</span>
							<span class="m-meta"><span>{a.domain}</span><span>{a.studentCount} Schüler</span><span>Ø {pct(a.avgMastery)}</span><span>{a.masteredCount} gemeistert</span></span>
							{@render fsrsBar(a)}
						</button>
						{#if isExpanded}{@render studentList(a)}{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</div>

<style>
	.intro { max-width: 42rem; font-weight: 700; }

	.filter-card { display: flex; flex-direction: column; gap: 0.875rem; }
	.filter-row { display: grid; grid-template-columns: 8rem minmax(0, 1fr); gap: 0.75rem; align-items: center; }
	.filter-label { font-size: 0.75rem; font-weight: 900; text-transform: uppercase; letter-spacing: 0.08em; color: var(--c-ink-2); }
	.fsrs-chip { color: var(--c-ink-2); }
	.fsrs-chip.on { border-color: var(--c-navy); color: var(--c-navy); background: #fff; }
	.fsrs-chip:not(.on) .dot { opacity: 0.35; }
	.fsrs-chip:not(.on) { text-decoration: line-through; }
	.range-wrap { display: flex; gap: 1.5rem; flex-wrap: wrap; }
	.range-field { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.85rem; font-weight: 700; color: var(--c-ink-2); min-width: 12rem; flex: 1 1 12rem; max-width: 20rem; }
	.range-field b { color: var(--c-navy); }
	.range-field input { accent-color: var(--c-primary); width: 100%; min-height: 1.75rem; }
	.filter-footer { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; flex-wrap: wrap; border-top: 1px solid var(--c-track); padding-top: 0.75rem; }
	.filter-count { font-size: 0.85rem; font-weight: 800; color: var(--c-ink-2); }

	.tbl-row { cursor: pointer; }
	.tbl-row.expanded td { background: var(--c-ground); }
	.chev-btn { width: 1.9rem; height: 1.9rem; border: 0; background: none; border-radius: 8px; cursor: pointer; font: 900 1.2rem var(--font); color: var(--c-ink-2); transition: transform 0.15s; }
	.chev-btn:hover { background: var(--c-track); }
	.chev-btn.open { transform: rotate(90deg); color: var(--c-primary); }
	.tbl-domain { font-size: 0.8rem; color: var(--c-ink-2) !important; white-space: nowrap; }
	.tbl-label { font-weight: 800; min-width: 12rem; }
	.tbl-frac { font-size: 0.78rem; font-weight: 700; color: var(--c-ink-2); }
	.tbl-fsrs { min-width: 9rem; }
	.fsrs-bar { display: flex; height: 10px; border-radius: 999px; overflow: hidden; background: var(--c-track); gap: 2px; }
	.fsrs-seg { display: block; height: 100%; }
	.detail-row td { background: var(--c-ground) !important; padding-top: 0 !important; }

	.student-detail-list { list-style: none; display: flex; flex-direction: column; background: #fff; border: 1px solid var(--c-line); border-radius: 14px; padding: 0.35rem 0.875rem; }
	.student-detail-row { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; padding: 0.45rem 0; border-bottom: 1px solid var(--c-track); font-size: 0.875rem; }
	.student-detail-row:last-child { border-bottom: 0; }
	.student-detail-name { flex: 1 1 9rem; min-width: 0; font-weight: 800; color: var(--c-navy); text-decoration: none; }
	.student-detail-name:hover { color: var(--c-primary); }
	.student-detail-class { font-size: 0.75rem; font-weight: 800; color: var(--c-ink-2); }
	.sd-bar { display: flex; align-items: center; gap: 0.5rem; flex: 0 1 10rem; }
	.student-detail-pct { font-size: 0.8rem; font-weight: 900; min-width: 2.4rem; text-align: right; }
	.sd-badges { display: flex; gap: 0.35rem; flex-wrap: wrap; }
	.fsrs-badge { background: #fff; border: 1px solid var(--c-line); }
	.fsrs-badge::before { content: ''; width: 8px; height: 8px; border-radius: 50%; background: var(--dot); }

	.m-sort { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem; }
	.m-sort select { flex: 1; }
	.m-atom { border-bottom: 1px solid var(--c-track); }
	.m-atom:last-child { border-bottom: 0; }
	.m-atom.expanded { padding-bottom: 0.75rem; }
	.m-atom-btn { width: 100%; display: flex; flex-direction: column; gap: 0.4rem; padding: 0.75rem 0; border: 0; background: none; text-align: left; font: inherit; color: inherit; cursor: pointer; }
	.m-atom-top { display: flex; justify-content: space-between; align-items: baseline; gap: 0.5rem; }
	.m-atom-label { font-weight: 800; }

	@media (max-width: 899px) {
		.filter-row { grid-template-columns: minmax(0, 1fr); gap: 0.4rem; }
		.range-field { max-width: none; }
		.student-detail-list { padding: 0.25rem 0.65rem; }
	}
</style>
