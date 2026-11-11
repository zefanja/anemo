<script lang="ts">
	import type { PageData } from './$types';
	import type { FsrsStateLabel } from './+page.server';

	let { data }: { data: PageData } = $props();

	function pct(v: number): string {
		return `${Math.round(v * 100)}%`;
	}

	const FSRS_OPTIONS: { key: FsrsStateLabel; label: string; color: string }[] = [
		{ key: 'none', label: 'Kein FSRS', color: '#9ca3af' },
		{ key: 'new', label: 'Neu', color: '#3b82f6' },
		{ key: 'learning', label: 'Lernen', color: '#f59e0b' },
		{ key: 'review', label: 'Wiederholung', color: '#16a34a' },
		{ key: 'relearning', label: 'Neu lernen', color: '#dc2626' }
	];
	const FSRS_COLOR = new Map(FSRS_OPTIONS.map((o) => [o.key, o.color]));
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

<div class="page">
	<h1 class="page-title">Atom-Insights</h1>
	<p class="page-sub">
		Filtere nach Mastery, FSRS-Status und Klasse, um zu sehen, welche Atome direkt sitzen und wo
		Schüler oft beim ersten Versuch scheitern.
	</p>

	<!-- Filters -->
	<section class="card filter-card">
		<div class="filter-row">
			<span class="filter-label">Klasse</span>
			<div class="chip-row">
				<button
					class="chip"
					class:active={selectedClassId === null}
					onclick={() => toggleClass(null)}
				>
					Alle Klassen
				</button>
				{#each data.classes as c}
					<button
						class="chip"
						class:active={selectedClassId === c.id}
						onclick={() => toggleClass(c.id)}
					>
						{c.name}
					</button>
				{/each}
			</div>
		</div>

		<div class="filter-row">
			<span class="filter-label">FSRS-Status</span>
			<div class="chip-row">
				{#each FSRS_OPTIONS as o}
					<button
						class="chip chip-dot"
						class:active={activeFsrsStates.has(o.key)}
						onclick={() => toggleFsrsState(o.key)}
					>
						<span class="chip-swatch" style="background:{o.color}"></span>
						{o.label}
					</button>
				{/each}
			</div>
		</div>

		<div class="filter-row">
			<span class="filter-label">Mastery</span>
			<div class="range-wrap">
				<label class="range-field">
					<span>Min {masteryMin}%</span>
					<input type="range" min="0" max="100" bind:value={masteryMin} />
				</label>
				<label class="range-field">
					<span>Max {masteryMax}%</span>
					<input type="range" min="0" max="100" bind:value={masteryMax} />
				</label>
			</div>
		</div>

		<div class="filter-footer">
			<span class="filter-count">
				{sortedAtomStats.length} Atome · {filteredRows.length} Schüler-Atom-Ergebnisse
			</span>
			{#if filtersActive}
				<button class="reset-btn" onclick={resetFilters}>Filter zurücksetzen</button>
			{/if}
		</div>
	</section>

	<!-- Atom table -->
	<section class="card">
		{#if sortedAtomStats.length === 0}
			<p class="empty-note">Keine Atome für diese Filterkombination.</p>
		{:else}
			<div class="tbl-wrap">
				<table class="tbl">
					<thead>
						<tr>
							<th></th>
							<th>
								<button
									class="sort-btn"
									class:sorted={sortKey === 'domain'}
									onclick={() => toggleSort('domain')}
								>
									Domäne <span class="sort-icon" class:active={sortKey === 'domain'}
										>{sortIcon('domain')}</span
									>
								</button>
							</th>
							<th>
								<button
									class="sort-btn"
									class:sorted={sortKey === 'atomLabel'}
									onclick={() => toggleSort('atomLabel')}
								>
									Atom <span class="sort-icon" class:active={sortKey === 'atomLabel'}
										>{sortIcon('atomLabel')}</span
									>
								</button>
							</th>
							<th class="tbl-num">
								<button
									class="sort-btn sort-btn-right"
									class:sorted={sortKey === 'studentCount'}
									onclick={() => toggleSort('studentCount')}
								>
									<span class="sort-icon" class:active={sortKey === 'studentCount'}
										>{sortIcon('studentCount')}</span
									> Schüler
								</button>
							</th>
							<th class="tbl-num">
								<button
									class="sort-btn sort-btn-right"
									class:sorted={sortKey === 'avgMastery'}
									onclick={() => toggleSort('avgMastery')}
								>
									<span class="sort-icon" class:active={sortKey === 'avgMastery'}
										>{sortIcon('avgMastery')}</span
									> Ø Mastery
								</button>
							</th>
							<th class="tbl-num">
								<button
									class="sort-btn sort-btn-right"
									class:sorted={sortKey === 'masteryRate'}
									onclick={() => toggleSort('masteryRate')}
								>
									<span class="sort-icon" class:active={sortKey === 'masteryRate'}
										>{sortIcon('masteryRate')}</span
									> Gemeistert
								</button>
							</th>
							<th class="tbl-num">
								<button
									class="sort-btn sort-btn-right"
									class:sorted={sortKey === 'firstTryRate'}
									onclick={() => toggleSort('firstTryRate')}
								>
									<span class="sort-icon" class:active={sortKey === 'firstTryRate'}
										>{sortIcon('firstTryRate')}</span
									> Erstversuch richtig
								</button>
							</th>
							<th>FSRS-Verteilung</th>
						</tr>
					</thead>
					<tbody>
						{#each sortedAtomStats as a}
							{@const isExpanded = expandedAtomId === a.atomId}
							<tr class="tbl-row" onclick={() => toggleAtom(a.atomId)}>
								<td class="tbl-chevron"><span class:open={isExpanded}>›</span></td>
								<td class="tbl-domain">{a.domain}</td>
								<td class="tbl-label">{a.atomLabel}</td>
								<td class="tbl-num">{a.studentCount}</td>
								<td class="tbl-num">{pct(a.avgMastery)}</td>
								<td class="tbl-num">
									{pct(a.masteryRate)}
									<span class="tbl-frac">({a.masteredCount}/{a.studentCount})</span>
								</td>
								<td class="tbl-num">
									{#if a.firstTryRate === null}
										<span class="no-data">–</span>
									{:else}
										<span
											class="first-try-pct"
											class:first-try-bad={a.firstTryRate < 0.5}
											class:first-try-good={a.firstTryRate >= 0.8}
										>
											{pct(a.firstTryRate)}
										</span>
										<span class="tbl-frac">({a.firstTryCorrectCount}/{a.firstTryTotal})</span>
									{/if}
								</td>
								<td class="tbl-fsrs">
									<div class="fsrs-bar" title={fsrsSegments(a).map((s) => `${s.label}: ${s.count}`).join(' · ')}>
										{#each fsrsSegments(a) as seg}
											<div class="fsrs-seg" style="width:{seg.widthPct}%;background:{seg.color}"></div>
										{/each}
									</div>
								</td>
							</tr>
							{#if isExpanded}
								<tr class="detail-row">
									<td colspan="8">
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
															<div
																class="student-detail-fill"
																class:fill-green={s.isMastered}
																class:fill-red={!s.isMastered}
																style="width:{pct(s.mastery)}"
															></div>
														</div>
														<span class="student-detail-pct">{pct(s.mastery)}</span>
													</div>
													<span
														class="first-try-badge"
														class:ft-yes={s.firstTryCorrect === true}
														class:ft-no={s.firstTryCorrect === false}
													>
														{#if s.firstTryCorrect === true}✓ Erstversuch{:else if s.firstTryCorrect === false}✗ Erstversuch{:else}–{/if}
													</span>
													<span
														class="fsrs-badge"
														style="background:{FSRS_COLOR.get(s.fsrsState as FsrsStateLabel)}20;color:{FSRS_COLOR.get(s.fsrsState as FsrsStateLabel)}"
													>
														{FSRS_LABEL.get(s.fsrsState as FsrsStateLabel)}
													</span>
													{#if s.isMastered}
														<span class="mastered-badge">✓ gemeistert</span>
													{/if}
												</li>
											{/each}
										</ul>
									</td>
								</tr>
							{/if}
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</section>
</div>

<style>
	.page { display: flex; flex-direction: column; gap: 1.5rem; }
	.page-title { font-size: 1.5rem; font-weight: 700; margin: 0; }
	.page-sub { font-size: 0.875rem; color: #6b7280; margin: -1rem 0 0; }

	.card {
		background: #fff;
		border-radius: 0.75rem;
		padding: 1.25rem;
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.07);
	}
	.empty-note { font-size: 0.875rem; color: #9ca3af; margin: 0; }

	/* Filters */
	.filter-card { display: flex; flex-direction: column; gap: 1rem; }
	.filter-row { display: flex; flex-direction: column; gap: 0.5rem; }
	.filter-label { font-size: 0.75rem; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.04em; }

	.chip-row { display: flex; flex-wrap: wrap; gap: 0.4rem; }
	.chip {
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
	.chip:hover { border-color: #16a34a; color: #16a34a; background: #f0fdf4; }
	.chip.active { background: #16a34a; color: #fff; border-color: #16a34a; }
	.chip-dot { display: inline-flex; align-items: center; gap: 0.4rem; }
	.chip-dot.active .chip-swatch { outline: 2px solid #fff; }
	.chip-swatch { width: 0.6rem; height: 0.6rem; border-radius: 9999px; flex-shrink: 0; }

	.range-wrap { display: flex; flex-wrap: wrap; gap: 1.5rem; }
	.range-field { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.8rem; color: #374151; font-weight: 600; min-width: 180px; }
	.range-field input[type='range'] { accent-color: #16a34a; }

	.filter-footer {
		display: flex;
		justify-content: space-between;
		align-items: center;
		border-top: 1px solid #f3f4f6;
		padding-top: 0.75rem;
	}
	.filter-count { font-size: 0.78rem; color: #9ca3af; }
	.reset-btn {
		background: none;
		border: none;
		color: #16a34a;
		font-size: 0.8rem;
		font-weight: 600;
		cursor: pointer;
		padding: 0.2rem 0.4rem;
	}
	.reset-btn:hover { text-decoration: underline; }

	/* Table */
	.tbl-wrap { overflow-x: auto; }
	.tbl { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
	.tbl th {
		padding: 0;
		text-align: left;
		font-size: 0.72rem;
		color: #6b7280;
		font-weight: 600;
		border-bottom: 2px solid #e5e7eb;
		background: #f9fafb;
		white-space: nowrap;
	}
	.tbl td { padding: 0.6rem 0.6rem; border-bottom: 1px solid #f3f4f6; vertical-align: middle; }
	.tbl-row { cursor: pointer; }
	.tbl-row:hover { background: #f9fafb; }
	.tbl-chevron { width: 1.25rem; color: #9ca3af; }
	.tbl-chevron span { display: inline-block; transition: transform 0.2s; }
	.tbl-chevron span.open { transform: rotate(90deg); }
	.tbl-domain { color: #9ca3af; font-size: 0.75rem; white-space: nowrap; }
	.tbl-label { font-weight: 600; color: #111827; }
	.tbl-num { text-align: right; white-space: nowrap; }
	.tbl-frac { font-size: 0.7rem; color: #9ca3af; margin-left: 0.2rem; }
	.tbl-fsrs { min-width: 120px; }
	.no-data { color: #d1d5db; }

	.first-try-pct { font-weight: 700; }
	.first-try-bad { color: #dc2626; }
	.first-try-good { color: #16a34a; }

	.fsrs-bar {
		display: flex;
		height: 8px;
		width: 100%;
		min-width: 90px;
		border-radius: 9999px;
		overflow: hidden;
		background: #f3f4f6;
	}
	.fsrs-seg { height: 100%; }

	.sort-btn {
		background: none;
		border: none;
		cursor: pointer;
		font-size: 0.72rem;
		color: #6b7280;
		font-weight: 600;
		padding: 0.5rem 0.6rem;
		display: flex;
		align-items: center;
		gap: 0.3rem;
		white-space: nowrap;
		width: 100%;
	}
	.sort-btn:hover { background: #f0fdf4; color: #15803d; }
	.sort-btn-right { justify-content: flex-end; }
	.sort-btn.sorted { color: #15803d; background: #f0fdf4; }
	.sort-icon { font-size: 0.65rem; opacity: 0.35; flex-shrink: 0; }
	.sort-icon.active { opacity: 1; color: #16a34a; }

	/* Detail rows */
	.detail-row td { padding: 0; border-bottom: 1px solid #f3f4f6; }
	.student-detail-list {
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		background: #f9fafb;
		padding: 0.75rem 1rem;
		margin: 0;
	}
	.student-detail-row { display: flex; align-items: center; gap: 0.6rem; font-size: 0.8rem; flex-wrap: wrap; }
	.student-detail-name { min-width: 7rem; font-weight: 600; color: #111827; text-decoration: none; }
	.student-detail-name:hover { color: #16a34a; text-decoration: underline; }
	.student-detail-class { font-size: 0.7rem; color: #9ca3af; min-width: 4rem; }
	.student-detail-bar-wrap { display: flex; align-items: center; gap: 0.3rem; width: 140px; }
	.student-detail-bar { flex: 1; height: 4px; background: #e5e7eb; border-radius: 9999px; overflow: hidden; }
	.student-detail-fill { height: 100%; border-radius: 9999px; }
	.fill-green { background: #16a34a; }
	.fill-red { background: #dc2626; }
	.student-detail-pct { font-size: 0.7rem; color: #6b7280; min-width: 2rem; text-align: right; }

	.first-try-badge { font-size: 0.7rem; font-weight: 700; color: #9ca3af; white-space: nowrap; }
	.ft-yes { color: #16a34a; }
	.ft-no { color: #dc2626; }

	.fsrs-badge {
		font-size: 0.68rem;
		font-weight: 700;
		padding: 0.15rem 0.5rem;
		border-radius: 9999px;
		white-space: nowrap;
	}

	.mastered-badge { font-size: 0.7rem; color: #16a34a; font-weight: 700; white-space: nowrap; }
</style>
