<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let showAddForm = $state(false);
	let showBulkForm = $state(false);
	let confirmDelete = $state<string | null>(null);
	let confirmResetAll = $state(false);
	let activeTab = $state<'students' | 'heatmap' | 'stats' | 'leaderboard' | 'settings'>('students');
	let editingId = $state<string | null>(null);
	let editingName = $state('');

	// Domain filter state: null = all enabled
	let enabledDomains = $state<Set<string>>(
		untrack(() =>
			data.class.enabledDomains ? new Set(data.class.enabledDomains) : new Set(data.allDomains)
		)
	);
	let allDomainsEnabled = $derived(enabledDomains.size === data.allDomains.length);

	function toggleDomain(domain: string) {
		const next = new Set(enabledDomains);
		if (next.has(domain)) next.delete(domain);
		else next.add(domain);
		enabledDomains = next;
	}

	function toggleAllDomains() {
		if (allDomainsEnabled) {
			enabledDomains = new Set();
		} else {
			enabledDomains = new Set(data.allDomains);
		}
	}

	// Code reveal: single student
	let codeShown = $state(false);
	$effect(() => {
		if (form?.action === 'student_created' || form?.action === 'code_reset') codeShown = true;
	});

	// Code cards: bulk create or reset all
	let cardsShown = $state(false);
	$effect(() => {
		if (form?.action === 'bulk_created' || form?.action === 'all_codes_reset') cardsShown = true;
	});

	let codeCards = $derived(
		form?.action === 'bulk_created'
			? form.created
			: form?.action === 'all_codes_reset'
				? form.reset
				: null
	);

	let showLeaderboard = $state(untrack(() => data.class.showLeaderboard));

	// Sorting for students tab
	type StudentSortKey = 'displayName' | 'level' | 'xp' | 'streakDays' | 'masteredCount' | 'lastActiveAt' | 'todayMinutes' | 'weekMinutes';
	let studentSortKey = $state<StudentSortKey>('displayName');
	let studentSortDir = $state<'asc' | 'desc'>('asc');

	let sortedStudents = $derived(
		[...data.students].sort((a, b) => {
			const av = a[studentSortKey], bv = b[studentSortKey];
			if (studentSortKey === 'lastActiveAt') {
				const at = av ? new Date(av as string).getTime() : 0;
				const bt = bv ? new Date(bv as string).getTime() : 0;
				return studentSortDir === 'asc' ? at - bt : bt - at;
			}
			if (typeof av === 'string' && typeof bv === 'string') {
				return studentSortDir === 'asc' ? av.localeCompare(bv, 'de') : bv.localeCompare(av, 'de');
			}
			return studentSortDir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number);
		})
	);

	function toggleStudentSort(key: StudentSortKey) {
		if (studentSortKey === key) { studentSortDir = studentSortDir === 'asc' ? 'desc' : 'asc'; }
		else { studentSortKey = key; studentSortDir = key === 'displayName' ? 'asc' : 'desc'; }
	}
	function studentSortIcon(key: StudentSortKey): string {
		if (studentSortKey !== key) return '⇅';
		return studentSortDir === 'asc' ? '▲' : '▼';
	}

	// Sorting for leaderboard tab
	type LbSortKey = 'displayName' | 'level' | 'xp' | 'masteredCount' | 'streakDays';
	let lbSortKey = $state<LbSortKey>('xp');
	let lbSortDir = $state<'asc' | 'desc'>('desc');

	let leaderboard = $derived(
		[...data.students].sort((a, b) => {
			const av = a[lbSortKey], bv = b[lbSortKey];
			if (typeof av === 'string' && typeof bv === 'string') {
				return lbSortDir === 'asc' ? av.localeCompare(bv, 'de') : bv.localeCompare(av, 'de');
			}
			return lbSortDir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number);
		})
	);

	function toggleLbSort(key: LbSortKey) {
		if (lbSortKey === key) { lbSortDir = lbSortDir === 'asc' ? 'desc' : 'asc'; }
		else { lbSortKey = key; lbSortDir = key === 'displayName' ? 'asc' : 'desc'; }
	}
	function lbSortIcon(key: LbSortKey): string {
		if (lbSortKey !== key) return '⇅';
		return lbSortDir === 'asc' ? '▲' : '▼';
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

	function timeAgo(date: Date | string): string {
		const d = new Date(date);
		const diff = Math.floor((Date.now() - d.getTime()) / 1000);
		if (diff < 60) return 'gerade eben';
		if (diff < 3600) return `vor ${Math.floor(diff / 60)} Min.`;
		if (diff < 86400) return `vor ${Math.floor(diff / 3600)} Std.`;
		return `vor ${Math.floor(diff / 86400)} Tagen`;
	}

	// Atom stats
	const TOP_N = 5;
	let expandedAtomId = $state<string | null>(null);
	let bestAtoms = $derived(data.atomStats.slice(0, TOP_N));
	let worstAtoms = $derived([...data.atomStats].reverse().slice(0, TOP_N));

	function toggleAtom(key: string) {
		expandedAtomId = expandedAtomId === key ? null : key;
	}

	function pctColor(pct: number): string {
		if (pct >= 80) return '#16a34a';
		if (pct >= 50) return '#d97706';
		if (pct > 0) return '#f97316';
		return '#e5e7eb';
	}

	function fmtMinutes(min: number): string {
		if (min === 0) return '–';
		if (min < 60) return `${min} Min.`;
		const h = Math.floor(min / 60);
		const m = min % 60;
		return m === 0 ? `${h} Std.` : `${h} Std. ${m} Min.`;
	}

	function relativeDate(d: Date | string | null): string {
		if (!d) return '–';
		const diff = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
		if (diff === 0) return 'heute';
		if (diff === 1) return 'gestern';
		if (diff < 30) return `vor ${diff} Tagen`;
		return new Date(d).toLocaleDateString('de-DE');
	}

	function startEdit(id: string, name: string) {
		editingId = id;
		editingName = name;
		confirmDelete = null;
	}

	function printCodes(cards: { name: string; code: string }[], className: string) {
		const w = window.open('', '_blank');
		if (!w) return;
		const html = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<title>Anmeldecodes – ${className}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; background: #fff; }
  h1 { font-size: 14pt; padding: 6mm 8mm 4mm; color: #555; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5mm; padding: 0 8mm 8mm; }
  .card {
    border: 2px dashed #aaa;
    border-radius: 4mm;
    padding: 5mm 6mm;
    text-align: center;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .school { font-size: 7pt; color: #999; margin-bottom: 2mm; }
  .name { font-size: 13pt; font-weight: 700; margin-bottom: 3mm; word-break: break-word; }
  .code {
    font-size: 22pt;
    font-weight: 900;
    letter-spacing: 3mm;
    color: #15803d;
    font-family: 'Courier New', monospace;
    background: #f0fdf4;
    padding: 2mm 4mm;
    border-radius: 2mm;
    display: inline-block;
  }
  .hint { font-size: 7pt; color: #888; margin-top: 2mm; }
  @media print {
    @page { margin: 8mm; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
<h1>Anmeldecodes – ${className}</h1>
<div class="grid">
${cards.map((c) => `<div class="card">
  <div class="school">Anemo Lernkarten</div>
  <div class="name">${c.name}</div>
  <div class="code">${c.code}</div>
  <div class="hint">Anmelde-Code (geheim halten!)</div>
</div>`).join('\n')}
</div>
<script>window.onload = function() { window.print(); }<\/script>
</body>
</html>`;
		w.document.write(html);
		w.document.close();
	}
</script>

<svelte:head><title>Anemo – {data.class.name}</title></svelte:head>

<div class="page">
	<div class="page-header">
		<div>
			<a href="/teacher/classes" class="breadcrumb">← Klassen</a>
			<h1 class="page-title">{data.class.name}</h1>
			<p class="meta">{data.students.length} Schüler · {data.totalAtoms} Atome{data.class.enabledDomains ? ' (aktiviert)' : ' gesamt'}</p>
		</div>
	</div>

	<!-- Single student code reveal -->
	{#if codeShown && (form?.action === 'student_created' || form?.action === 'code_reset') && form?.code}
		<div class="code-reveal" role="alert">
			<div class="code-reveal-title">
				{form.action === 'student_created' ? '✅ Schüler angelegt:' : '🔄 Neuer Code für:'} <strong>{form.studentName}</strong>
			</div>
			<div class="code-display">{form.code}</div>
			<p class="code-warn">Bitte Code notieren! Er wird nur einmal angezeigt.</p>
			<button class="code-close" onclick={() => (codeShown = false)}>✕ Schließen</button>
		</div>
	{/if}

	<!-- Bulk code cards -->
	{#if cardsShown && codeCards && codeCards.length > 0}
		<div class="cards-panel">
			<div class="cards-header">
				<div>
					<strong>
						{form?.action === 'bulk_created'
							? `✅ ${codeCards.length} Schüler angelegt`
							: `🔄 Alle Codes zurückgesetzt (${codeCards.length} Schüler)`}
					</strong>
					<span class="code-warn-inline">Die Codes werden nur jetzt angezeigt!</span>
				</div>
				<div class="cards-actions">
					<button class="btn btn-primary btn-sm" onclick={() => printCodes(codeCards!, data.class.name)}>
						🖨️ Codes drucken
					</button>
					<button class="btn btn-ghost btn-sm" onclick={() => (cardsShown = false)}>✕ Schließen</button>
				</div>
			</div>
			<div class="code-grid">
				{#each codeCards as card}
					<div class="code-card">
						<div class="cc-name">{card.name}</div>
						<div class="cc-code">{card.code}</div>
					</div>
				{/each}
			</div>
		</div>
	{/if}

	{#if form?.action === 'student_deleted'}
		<div class="alert alert-success">Schüler „{form.studentName}" wurde entfernt.</div>
	{/if}
	{#if form?.action === 'settings_saved'}
		<div class="alert alert-success">Einstellungen gespeichert.</div>
	{/if}
	{#if form?.action === 'domains_saved'}
		<div class="alert alert-success">Themenbereiche gespeichert.</div>
	{/if}
	{#if form?.action === 'student_renamed'}
		<div class="alert alert-success">Name wurde geändert.</div>
	{/if}
	{#if form?.action === 'create_error' && form.createError}
		<div class="alert alert-error">{form.createError}</div>
	{/if}
	{#if form?.action === 'bulk_error' && form.bulkError}
		<div class="alert alert-error">{form.bulkError}</div>
	{/if}

	<!-- Tabs -->
	<div class="tabs">
		<button class="tab" class:active={activeTab === 'students'} onclick={() => (activeTab = 'students')}>
			Schüler ({data.students.length})
		</button>
		<button class="tab" class:active={activeTab === 'heatmap'} onclick={() => (activeTab = 'heatmap')}>
			Fortschritt
		</button>
		<button class="tab" class:active={activeTab === 'stats'} onclick={() => (activeTab = 'stats')}>
			Statistik
		</button>
		<button class="tab" class:active={activeTab === 'leaderboard'} onclick={() => (activeTab = 'leaderboard')}>
			Leaderboard
		</button>
		<button class="tab" class:active={activeTab === 'settings'} onclick={() => (activeTab = 'settings')}>
			Einstellungen
		</button>
	</div>

	<!-- ── Students tab ── -->
	{#if activeTab === 'students'}
		<div class="tab-content">
			<div class="tab-toolbar">
				<button class="btn btn-primary btn-sm" onclick={() => { showAddForm = !showAddForm; showBulkForm = false; }}>
					{showAddForm ? 'Abbrechen' : '+ Einzeln anlegen'}
				</button>
				<button class="btn btn-secondary btn-sm" onclick={() => { showBulkForm = !showBulkForm; showAddForm = false; }}>
					{showBulkForm ? 'Abbrechen' : '+ Mehrere anlegen (Tiernamen)'}
				</button>
				{#if data.students.length > 0}
					{#if confirmResetAll}
						<form method="POST" action="?/resetAllCodes" use:enhance={() => {
							confirmResetAll = false;
							return ({ update }) => { update(); };
						}} class="inline-form">
							<button type="submit" class="btn btn-danger btn-sm">⚠️ Wirklich alle Codes zurücksetzen?</button>
						</form>
						<button class="btn btn-ghost btn-sm" onclick={() => (confirmResetAll = false)}>Abbrechen</button>
					{:else}
						<button class="btn btn-ghost btn-sm" onclick={() => (confirmResetAll = true)}>
							🔑 Alle Codes neu (drucken)
						</button>
					{/if}
				{/if}
			</div>

			{#if showAddForm}
				<div class="add-form card">
					<h3>Einzelner Schüler</h3>
					<form method="POST" action="?/createStudent" use:enhance={() => {
						return ({ update }) => { update(); showAddForm = false; };
					}}>
						<div class="field-row">
							<input name="name" type="text" placeholder="Anzeigename (z.B. Max M.)" required />
							<button type="submit" class="btn btn-primary btn-sm">Anlegen &amp; Code zeigen</button>
						</div>
					</form>
					<p class="form-hint">Der 6-stellige Anmeldecode wird einmalig angezeigt.</p>
				</div>
			{/if}

			{#if showBulkForm}
				<div class="add-form card">
					<h3>Mehrere Schüler mit Tiernamen anlegen</h3>
					<form method="POST" action="?/bulkCreate" use:enhance={() => {
						return ({ update }) => { update(); showBulkForm = false; };
					}}>
						<div class="field-row">
							<label for="bulk-count" class="field-label">Anzahl:</label>
							<input id="bulk-count" name="count" type="number" min="1" max="40" value="5" style="width: 5rem" required />
							<button type="submit" class="btn btn-primary btn-sm">Anlegen &amp; Codes anzeigen</button>
						</div>
					</form>
					<p class="form-hint">Namen wie „StarkerTiger" oder „MutigerFalke" werden automatisch vergeben. Du kannst sie später umbenennen.</p>
				</div>
			{/if}

			{#if data.students.length === 0}
				<div class="empty-state">
					<div class="empty-icon">👥</div>
					<p>Noch keine Schüler in dieser Klasse.</p>
				</div>
			{:else}
				<div class="table-wrap">
					<table class="t">
						<thead>
							<tr>
								<th class="sort-th"><button class="sort-btn" class:sorted={studentSortKey==='displayName'} onclick={() => toggleStudentSort('displayName')}>Name <span class="sort-icon" class:active={studentSortKey==='displayName'}>{studentSortIcon('displayName')}</span></button></th>
								<th class="sort-th"><button class="sort-btn" class:sorted={studentSortKey==='level'} onclick={() => toggleStudentSort('level')}>Level <span class="sort-icon" class:active={studentSortKey==='level'}>{studentSortIcon('level')}</span></button></th>
								<th class="sort-th"><button class="sort-btn" class:sorted={studentSortKey==='xp'} onclick={() => toggleStudentSort('xp')}>XP <span class="sort-icon" class:active={studentSortKey==='xp'}>{studentSortIcon('xp')}</span></button></th>
								<th class="sort-th"><button class="sort-btn" class:sorted={studentSortKey==='streakDays'} onclick={() => toggleStudentSort('streakDays')}>Streak <span class="sort-icon" class:active={studentSortKey==='streakDays'}>{studentSortIcon('streakDays')}</span></button></th>
								<th class="sort-th"><button class="sort-btn" class:sorted={studentSortKey==='masteredCount'} onclick={() => toggleStudentSort('masteredCount')}>Gemeistert <span class="sort-icon" class:active={studentSortKey==='masteredCount'}>{studentSortIcon('masteredCount')}</span></button></th>
								<th class="sort-th"><button class="sort-btn" class:sorted={studentSortKey==='todayMinutes'} onclick={() => toggleStudentSort('todayMinutes')}>Heute <span class="sort-icon" class:active={studentSortKey==='todayMinutes'}>{studentSortIcon('todayMinutes')}</span></button></th>
								<th class="sort-th"><button class="sort-btn" class:sorted={studentSortKey==='weekMinutes'} onclick={() => toggleStudentSort('weekMinutes')}>Diese Woche <span class="sort-icon" class:active={studentSortKey==='weekMinutes'}>{studentSortIcon('weekMinutes')}</span></button></th>
								<th class="sort-th"><button class="sort-btn" class:sorted={studentSortKey==='lastActiveAt'} onclick={() => toggleStudentSort('lastActiveAt')}>Zuletzt aktiv <span class="sort-icon" class:active={studentSortKey==='lastActiveAt'}>{studentSortIcon('lastActiveAt')}</span></button></th>
								<th>Aktionen</th>
							</tr>
						</thead>
						<tbody>
							{#each sortedStudents as s}
								<tr>
									<td class="name-cell">
										{#if editingId === s.id}
											<form
												method="POST"
												action="?/renameStudent"
												use:enhance={() => {
													return ({ update }) => { update(); editingId = null; };
												}}
												class="rename-form"
											>
												<input type="hidden" name="studentId" value={s.id} />
												<input
													name="name"
													type="text"
													value={editingName}
													oninput={(e) => (editingName = (e.target as HTMLInputElement).value)}
													class="rename-input"
													required
												/>
												<button type="submit" class="btn-action" title="Speichern">✓</button>
												<button type="button" class="btn-action" onclick={() => (editingId = null)} title="Abbrechen">✕</button>
											</form>
										{:else}
											<a href="/teacher/classes/{data.class.id}/students/{s.id}" class="student-link">
												{s.displayName}
											</a>
											<button
												class="btn-action btn-icon"
												title="Umbenennen"
												onclick={() => startEdit(s.id, s.displayName)}
											>✏️</button>
										{/if}
									</td>
									<td class="center">{s.level}</td>
									<td class="center">{s.xp}</td>
									<td class="center">🔥 {s.streakDays}</td>
									<td class="center">{s.masteredCount}/{data.totalAtoms}</td>
									<td class="center" class:muted={s.todayMinutes === 0 && s.todayTasks === 0}>
										{#if s.todayTasks > 0}
											{fmtMinutes(s.todayMinutes)} <span class="muted">({s.todayTasks})</span>
										{:else}
											–
										{/if}
									</td>
									<td class="center" class:muted={s.weekMinutes === 0 && s.weekTasks === 0}>
										{#if s.weekTasks > 0}
											{fmtMinutes(s.weekMinutes)} <span class="muted">({s.weekTasks})</span>
										{:else}
											–
										{/if}
									</td>
									<td class="center muted">{relativeDate(s.lastActiveAt)}</td>
									<td class="actions-cell">
										<form method="POST" action="?/resetCode" use:enhance class="inline-form">
											<input type="hidden" name="studentId" value={s.id} />
											<button type="submit" class="btn-action" title="Code zurücksetzen">🔑</button>
										</form>
										{#if confirmDelete === s.id}
											<form method="POST" action="?/deleteStudent" use:enhance class="inline-form">
												<input type="hidden" name="studentId" value={s.id} />
												<button type="submit" class="btn-action danger" title="Löschen bestätigen">✓</button>
											</form>
											<button class="btn-action" title="Abbrechen" onclick={() => (confirmDelete = null)}>✕</button>
										{:else}
											<button
												class="btn-action danger"
												title="Schüler entfernen"
												onclick={() => (confirmDelete = s.id)}
											>🗑</button>
										{/if}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</div>

	<!-- ── Heatmap tab ── -->
	{:else if activeTab === 'heatmap'}
		<div class="tab-content">
			{#if data.students.length === 0}
				<p class="muted">Noch keine Schüler vorhanden.</p>
			{:else}
				<div class="heatmap-wrap">
					<table class="heatmap-table">
						<thead>
							<tr>
								<th class="heatmap-name">Schüler</th>
								{#each data.domains as domain}
									<th class="heatmap-domain" title={domain}>
										{domain.length > 12 ? domain.slice(0, 11) + '…' : domain}
									</th>
								{/each}
								<th class="heatmap-total">Gesamt</th>
							</tr>
						</thead>
						<tbody>
							{#each data.students as s}
								<tr>
									<td class="heatmap-name-cell">
										<a href="/teacher/classes/{data.class.id}/students/{s.id}" class="student-link">
											{s.displayName}
										</a>
									</td>
									{#each s.domainPct as pct}
										<td
											class="heatmap-cell"
											style="background: {pctColor(pct)}; color: {pct > 40 ? '#fff' : '#374151'}"
											title="{pct}%"
										>
											{pct > 0 ? pct + '%' : ''}
										</td>
									{/each}
									<td class="heatmap-total-cell">
										{s.masteredCount}/{data.totalAtoms}
										<div class="heatmap-bar">
											<div class="heatmap-bar-fill" style="width: {Math.round(s.masteredCount / data.totalAtoms * 100)}%"></div>
										</div>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				<p class="legend">
					<span class="legend-dot" style="background:#16a34a"></span> ≥80% &nbsp;
					<span class="legend-dot" style="background:#d97706"></span> 50–79% &nbsp;
					<span class="legend-dot" style="background:#f97316"></span> 1–49% &nbsp;
					<span class="legend-dot" style="background:#e5e7eb"></span> 0%
				</p>
			{/if}
		</div>

	<!-- ── Statistik tab ── -->
	{:else if activeTab === 'stats'}
		<div class="tab-content">
			{#if data.atomStats.length === 0}
				<p class="muted">Noch keine Übungsversuche vorhanden.</p>
			{:else}
				<div class="two-col">
					<section class="card stat-card-inner">
						<div class="card-header">
							<h3 class="card-title">Gut gemeistert</h3>
							<span class="badge badge-green">Top {bestAtoms.length}</span>
						</div>
						<ul class="atom-list">
							{#each bestAtoms as a}
								{@const key = a.atomId + '-best'}
								{@const isExpanded = expandedAtomId === key}
								<li class="atom-row">
									<button class="atom-btn" onclick={() => toggleAtom(key)}>
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
													<a href="/teacher/classes/{data.class.id}/students/{s.studentId}" class="student-detail-name">
														{s.displayName}
													</a>
													<div class="student-detail-bar-wrap">
														<div class="student-detail-bar">
															<div class="student-detail-fill fill-green" style="width:{pct(s.mastery)}"></div>
														</div>
														<span class="student-detail-pct">{pct(s.mastery)}</span>
													</div>
													{#if s.isMastered}<span class="mastered-badge">✓</span>{/if}
												</li>
											{/each}
										</ul>
									{/if}
								</li>
							{/each}
						</ul>
					</section>

					<section class="card stat-card-inner">
						<div class="card-header">
							<h3 class="card-title">Schwierige Atome</h3>
							<span class="badge badge-red">Flop {worstAtoms.length}</span>
						</div>
						<ul class="atom-list">
							{#each worstAtoms as a}
								{@const key = a.atomId + '-worst'}
								{@const isExpanded = expandedAtomId === key}
								<li class="atom-row">
									<button class="atom-btn" onclick={() => toggleAtom(key)}>
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
													<a href="/teacher/classes/{data.class.id}/students/{s.studentId}" class="student-detail-name">
														{s.displayName}
													</a>
													<div class="student-detail-bar-wrap">
														<div class="student-detail-bar">
															<div class="student-detail-fill fill-red" style="width:{pct(s.mastery)}"></div>
														</div>
														<span class="student-detail-pct">{pct(s.mastery)}</span>
													</div>
													{#if s.isMastered}<span class="mastered-badge">✓</span>{/if}
												</li>
											{/each}
										</ul>
									{/if}
								</li>
							{/each}
						</ul>
					</section>
				</div>

				<section class="card stat-card-inner">
					<div class="card-header">
						<h3 class="card-title">Letzte Aktivitäten</h3>
					</div>
					{#if data.recentActivity.length === 0}
						<p class="muted">Noch keine Versuche vorhanden.</p>
					{:else}
						<ul class="activity-list">
							{#each data.recentActivity as a}
								<li class="activity-item">
									<div class="activity-score-wrap">
										<span class="activity-score">{a.correct}/{a.total}</span>
										<div class="activity-bar-mini">
											<div class="activity-bar-fill" style="width:{a.total > 0 ? Math.round(a.correct/a.total*100) : 0}%"></div>
										</div>
									</div>
									<span class="activity-body">
										<a href="/teacher/classes/{data.class.id}/students/{a.studentId}" class="activity-link">
											<strong>{a.displayName}</strong>
										</a>
										<span class="activity-atom">zuletzt: {a.lastAtomLabel}</span>
									</span>
									<span class="activity-time">{timeAgo(a.lastAnsweredAt)}</span>
								</li>
							{/each}
						</ul>
					{/if}
				</section>
			{/if}
		</div>

	<!-- ── Leaderboard tab ── -->
	{:else if activeTab === 'leaderboard'}
		<div class="tab-content">
			{#if !data.class.showLeaderboard}
				<div class="lb-disabled-note">
					Das Leaderboard ist für Schüler dieser Klasse deaktiviert. Du kannst es in den Einstellungen aktivieren.
				</div>
			{/if}
			{#if data.students.length === 0}
				<p class="muted">Noch keine Schüler vorhanden.</p>
			{:else}
				<div class="table-wrap">
					<table class="t">
						<thead>
							<tr>
								<th class="lb-rank-col">#</th>
								<th class="sort-th"><button class="sort-btn" class:sorted={lbSortKey==='displayName'} onclick={() => toggleLbSort('displayName')}>Name <span class="sort-icon" class:active={lbSortKey==='displayName'}>{lbSortIcon('displayName')}</span></button></th>
								<th class="sort-th"><button class="sort-btn" class:sorted={lbSortKey==='level'} onclick={() => toggleLbSort('level')}>Level <span class="sort-icon" class:active={lbSortKey==='level'}>{lbSortIcon('level')}</span></button></th>
								<th class="sort-th"><button class="sort-btn" class:sorted={lbSortKey==='xp'} onclick={() => toggleLbSort('xp')}>XP <span class="sort-icon" class:active={lbSortKey==='xp'}>{lbSortIcon('xp')}</span></button></th>
								<th class="sort-th"><button class="sort-btn" class:sorted={lbSortKey==='masteredCount'} onclick={() => toggleLbSort('masteredCount')}>Gemeistert <span class="sort-icon" class:active={lbSortKey==='masteredCount'}>{lbSortIcon('masteredCount')}</span></button></th>
								<th class="sort-th"><button class="sort-btn" class:sorted={lbSortKey==='streakDays'} onclick={() => toggleLbSort('streakDays')}>Streak <span class="sort-icon" class:active={lbSortKey==='streakDays'}>{lbSortIcon('streakDays')}</span></button></th>
							</tr>
						</thead>
						<tbody>
							{#each leaderboard as s, i}
								<tr class:lb-top3={i < 3}>
									<td class="lb-rank-col">{rankIcon(i)}</td>
									<td class="name-cell">
										<a href="/teacher/classes/{data.class.id}/students/{s.id}" class="student-link">
											{s.displayName}
										</a>
									</td>
									<td class="center">Lv.{s.level}</td>
									<td class="center lb-xp">{s.xp.toLocaleString('de-DE')}</td>
									<td class="center">{s.masteredCount}/{data.totalAtoms}</td>
									<td class="center">🔥 {s.streakDays}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</div>

	<!-- ── Settings tab ── -->
	{:else if activeTab === 'settings'}
		<div class="tab-content">
			<div class="card settings-card">
				<h3>Sitzungseinstellungen</h3>
				<p class="form-hint">Leer lassen = Server-Standardwert wird verwendet.</p>
				<form method="POST" action="?/updateSettings" use:enhance={() => ({ update }) => update()}>
					<div class="settings-grid">
						<div class="field">
							<label for="maxReview">Max. Wiederholungsaufgaben pro Sitzung</label>
							<input
								id="maxReview"
								name="sessionMaxReview"
								type="number"
								min="1"
								max="50"
								placeholder="Standard: 10"
							/>
						</div>
						<div class="field">
							<label for="maxTotal">Max. Aufgaben gesamt pro Sitzung</label>
							<input
								id="maxTotal"
								name="sessionMaxTotal"
								type="number"
								min="1"
								max="100"
								placeholder="Standard: 20"
							/>
						</div>
					</div>
					<div class="field-toggle">
						<label class="toggle-label">
							<input
								type="checkbox"
								checked={showLeaderboard}
								onchange={(e) => (showLeaderboard = (e.target as HTMLInputElement).checked)}
							/>
							<span>Leaderboard für Schüler sichtbar</span>
						</label>
						<p class="form-hint">
							Wenn aktiviert, sehen Schüler eine Rangliste ihrer Klasse (nach XP). Deaktivieren, um sozialen Vergleich zu vermeiden.
						</p>
					</div>
					<input type="hidden" name="showLeaderboard" value={showLeaderboard ? 'true' : 'false'} />
					<button type="submit" class="btn btn-primary">Speichern</button>
				</form>
			</div>

			<div class="card settings-card">
				<h3>Themenbereiche</h3>
				<p class="form-hint">
					Wähle welche Themenbereiche für diese Klasse sichtbar sind. Abgewählte Bereiche werden
					Schülern nicht angezeigt und nicht in der Lernpfad-Berechnung berücksichtigt.
				</p>
				<form
					method="POST"
					action="?/updateDomains"
					use:enhance={() => ({ update }) => update()}
				>
					<div class="domain-toggle-all">
						<label class="domain-check">
							<input
								type="checkbox"
								checked={allDomainsEnabled}
								onchange={toggleAllDomains}
							/>
							<span class="domain-check-label">Alle Bereiche</span>
						</label>
					</div>
					<div class="domain-list">
						{#each data.allDomains as domain}
							<label class="domain-check" class:disabled={!enabledDomains.has(domain)}>
								<input
									type="checkbox"
									name="domain"
									value={domain}
									checked={enabledDomains.has(domain)}
									onchange={() => toggleDomain(domain)}
								/>
								<span class="domain-check-label">{domain}</span>
							</label>
						{/each}
					</div>
					{#if enabledDomains.size === 0}
						<p class="warn-hint">Achtung: Kein Bereich ausgewählt – Schüler sehen keine Aufgaben.</p>
					{/if}
					<button type="submit" class="btn btn-primary" style="margin-top: 1rem">Speichern</button>
				</form>
			</div>
		</div>
	{/if}
</div>

<style>
	.page { display: flex; flex-direction: column; gap: 1rem; }
	.page-header { display: flex; justify-content: space-between; align-items: flex-start; }
	.page-title { font-size: 1.5rem; font-weight: 700; margin: 0.25rem 0; }
	.breadcrumb { font-size: 0.8rem; color: #6b7280; text-decoration: none; }
	.breadcrumb:hover { color: #16a34a; }
	.meta { font-size: 0.8rem; color: #9ca3af; margin: 0; }

	.alert { padding: 0.75rem 1rem; border-radius: 0.5rem; font-size: 0.875rem; font-weight: 500; }
	.alert-error { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }
	.alert-success { background: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0; }

	/* Single code reveal */
	.code-reveal {
		background: #f0fdf4;
		border: 2px solid #16a34a;
		border-radius: 0.75rem;
		padding: 1.25rem;
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
		text-align: center;
	}
	.code-reveal-title { font-size: 0.875rem; color: #374151; }
	.code-display {
		font-size: 2.5rem;
		font-weight: 800;
		letter-spacing: 0.25em;
		color: #15803d;
		font-family: 'Courier New', monospace;
		background: #fff;
		padding: 0.5rem 1.5rem;
		border-radius: 0.5rem;
		border: 2px solid #bbf7d0;
		user-select: all;
	}
	.code-warn { font-size: 0.8rem; color: #d97706; margin: 0; }
	.code-warn-inline { font-size: 0.8rem; color: #d97706; margin-left: 0.75rem; }
	.code-close {
		position: absolute;
		top: 0.5rem;
		right: 0.75rem;
		background: none;
		border: none;
		color: #6b7280;
		font-size: 0.85rem;
		cursor: pointer;
	}

	/* Bulk code cards panel */
	.cards-panel {
		background: #f0fdf4;
		border: 2px solid #16a34a;
		border-radius: 0.75rem;
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.875rem;
	}
	.cards-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.cards-actions { display: flex; gap: 0.5rem; }
	.code-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
		gap: 0.625rem;
	}
	.code-card {
		background: #fff;
		border: 2px dashed #86efac;
		border-radius: 0.5rem;
		padding: 0.625rem 0.75rem;
		text-align: center;
	}
	.cc-name {
		font-size: 0.8rem;
		font-weight: 700;
		color: #374151;
		margin-bottom: 0.35rem;
		word-break: break-word;
	}
	.cc-code {
		font-size: 1.25rem;
		font-weight: 900;
		letter-spacing: 0.12em;
		color: #15803d;
		font-family: 'Courier New', monospace;
		user-select: all;
	}

	/* Tabs */
	.tabs { display: flex; border-bottom: 2px solid #e5e7eb; gap: 0; }
	.tab {
		padding: 0.6rem 1.1rem;
		font-size: 0.875rem;
		font-weight: 600;
		background: none;
		border: none;
		color: #6b7280;
		cursor: pointer;
		border-bottom: 2px solid transparent;
		margin-bottom: -2px;
		transition: color .15s, border-color .15s;
	}
	.tab.active { color: #16a34a; border-bottom-color: #16a34a; }
	.tab-content { padding-top: 0.75rem; display: flex; flex-direction: column; gap: 0.875rem; }
	.tab-toolbar { display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center; }

	/* Buttons */
	.btn {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		border-radius: 0.5rem;
		font-weight: 600;
		cursor: pointer;
		border: none;
		transition: background .15s, opacity .15s;
		padding: 0.55rem 1rem;
		font-size: 0.875rem;
	}
	.btn-primary { background: #16a34a; color: #fff; }
	.btn-primary:hover { background: #15803d; }
	.btn-secondary { background: #f3f4f6; color: #374151; border: 1.5px solid #d1d5db; }
	.btn-secondary:hover { background: #e5e7eb; }
	.btn-ghost { background: none; color: #6b7280; border: 1.5px solid #d1d5db; }
	.btn-ghost:hover { background: #f3f4f6; }
	.btn-danger { background: #dc2626; color: #fff; }
	.btn-danger:hover { background: #b91c1c; }
	.btn-sm { padding: 0.4rem 0.8rem; font-size: 0.8rem; }

	/* Add form */
	.add-form { padding: 1rem; }
	.add-form h3 { font-size: 0.95rem; font-weight: 700; margin: 0 0 0.75rem; }
	.field-row { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
	.field-label { font-size: 0.875rem; font-weight: 600; white-space: nowrap; }
	.field-row input[type="text"],
	.field-row input[type="number"] {
		flex: 1;
		min-width: 0;
		padding: 0.5rem 0.75rem;
		border: 1.5px solid #d1d5db;
		border-radius: 0.5rem;
		font-size: 0.9rem;
		outline: none;
	}
	.field-row input:focus { border-color: #16a34a; }
	.form-hint { font-size: 0.75rem; color: #9ca3af; margin: 0.35rem 0 0; }

	/* Card */
	.card { background: #fff; border-radius: 0.75rem; box-shadow: 0 1px 4px rgba(0,0,0,.07); }

	/* Student table */
	.empty-state { text-align: center; padding: 2.5rem; display: flex; flex-direction: column; align-items: center; gap: 0.5rem; color: #9ca3af; }
	.empty-icon { font-size: 2rem; }
	.table-wrap { overflow-x: auto; background: #fff; border-radius: 0.75rem; box-shadow: 0 1px 4px rgba(0,0,0,.07); }
	.t { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
	.t th { padding: 0.65rem 0.875rem; text-align: left; font-size: 0.75rem; color: #6b7280; font-weight: 600; border-bottom: 1px solid #e5e7eb; background: #f9fafb; }
	.t td { padding: 0.65rem 0.875rem; border-bottom: 1px solid #f3f4f6; }
	.t tr:last-child td { border-bottom: none; }
	.t tr:hover td { background: #f9fafb; }
	.name-cell { font-weight: 600; display: flex; align-items: center; gap: 0.25rem; }
	.student-link { color: inherit; text-decoration: none; }
	.student-link:hover { color: #16a34a; text-decoration: underline; }
	.center { text-align: center; }
	.muted { color: #9ca3af; }
	.actions-cell { display: flex; gap: 0.25rem; align-items: center; }
	.inline-form { display: inline; }
	.btn-action {
		background: none; border: 1px solid #e5e7eb;
		border-radius: 0.375rem; padding: 0.25rem 0.45rem;
		font-size: 0.85rem; cursor: pointer;
		transition: background .15s;
	}
	.btn-action:hover { background: #f3f4f6; }
	.btn-action.danger:hover { background: #fef2f2; border-color: #fecaca; }
	.btn-icon { border: none; padding: 0.1rem 0.25rem; opacity: 0.4; }
	.btn-icon:hover { opacity: 1; background: none; }

	/* Inline rename */
	.rename-form { display: flex; align-items: center; gap: 0.25rem; flex: 1; }
	.rename-input {
		flex: 1;
		padding: 0.3rem 0.5rem;
		border: 1.5px solid #16a34a;
		border-radius: 0.375rem;
		font-size: 0.875rem;
		outline: none;
		min-width: 0;
	}

	/* Heatmap */
	.heatmap-wrap { overflow-x: auto; background: #fff; border-radius: 0.75rem; box-shadow: 0 1px 4px rgba(0,0,0,.07); }
	.heatmap-table { width: 100%; border-collapse: collapse; font-size: 0.8rem; white-space: nowrap; }
	.heatmap-table th, .heatmap-table td { padding: 0.5rem 0.6rem; border: 1px solid #f3f4f6; }
	.heatmap-table thead th { background: #f9fafb; font-size: 0.7rem; color: #6b7280; font-weight: 600; }
	.heatmap-name { min-width: 120px; }
	.heatmap-domain { text-align: center; min-width: 70px; }
	.heatmap-total { min-width: 90px; }
	.heatmap-name-cell { font-weight: 600; }
	.heatmap-cell { text-align: center; font-size: 0.7rem; font-weight: 600; transition: background .2s; }
	.heatmap-total-cell { font-size: 0.75rem; font-weight: 600; }
	.heatmap-bar { height: 4px; background: #e5e7eb; border-radius: 99px; margin-top: 3px; overflow: hidden; }
	.heatmap-bar-fill { height: 100%; background: #16a34a; border-radius: 99px; }
	.legend { font-size: 0.75rem; color: #6b7280; display: flex; align-items: center; gap: 0.25rem; flex-wrap: wrap; }
	.legend-dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 2px; }

	/* Leaderboard tab */
	.lb-rank-col { text-align: center; width: 2.5rem; font-weight: 700; }
	.lb-top3 td { background: #fafff7; }
	.lb-xp { font-weight: 700; color: #16a34a; }
	.lb-disabled-note {
		background: #fffbeb;
		border: 1px solid #fde68a;
		border-radius: 0.5rem;
		padding: 0.75rem 1rem;
		font-size: 0.875rem;
		color: #92400e;
	}

	/* Settings */
	.field-toggle { margin-bottom: 1rem; }
	.toggle-label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		cursor: pointer;
		font-size: 0.875rem;
		font-weight: 600;
		color: #374151;
	}
	.toggle-label input[type="checkbox"] { accent-color: #16a34a; width: 1rem; height: 1rem; }
	.settings-card { padding: 1.25rem; }
	.settings-card h3 { font-size: 1rem; font-weight: 700; margin: 0 0 0.25rem; }
	.settings-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem; }
	@media (max-width: 600px) { .settings-grid { grid-template-columns: 1fr; } }
	.field { display: flex; flex-direction: column; gap: 0.375rem; }
	.field label { font-size: 0.825rem; font-weight: 600; color: #374151; }
	.field input {
		padding: 0.5rem 0.75rem;
		border: 1.5px solid #d1d5db;
		border-radius: 0.5rem;
		font-size: 0.9rem;
		outline: none;
	}
	.field input:focus { border-color: #16a34a; }

	/* Domain filter */
	.domain-toggle-all {
		padding-bottom: 0.5rem;
		margin-bottom: 0.5rem;
		border-bottom: 1px solid #e5e7eb;
	}
	.domain-list {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
		gap: 0.375rem;
		margin-bottom: 0.5rem;
	}
	.domain-check {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		cursor: pointer;
		padding: 0.375rem 0.5rem;
		border-radius: 0.375rem;
		border: 1.5px solid #e5e7eb;
		background: #f9fafb;
		font-size: 0.825rem;
		font-weight: 500;
		transition: background .1s, border-color .1s;
	}
	.domain-check:hover { background: #f0fdf4; border-color: #86efac; }
	.domain-check input[type="checkbox"] { accent-color: #16a34a; width: 1rem; height: 1rem; flex-shrink: 0; }
	.domain-check.disabled { opacity: 0.5; }
	.domain-check-label { flex: 1; line-height: 1.2; word-break: break-word; }
	.warn-hint { font-size: 0.8rem; color: #dc2626; margin: 0.25rem 0 0; }

	/* Statistik tab */
	.two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
	@media (max-width: 700px) { .two-col { grid-template-columns: 1fr; } }

	.stat-card-inner { padding: 1rem; }
	.card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; }
	.card-title { font-size: 0.9rem; font-weight: 700; margin: 0; }

	.badge { font-size: 0.7rem; font-weight: 700; padding: 0.2rem 0.5rem; border-radius: 9999px; }
	.badge-green { background: #dcfce7; color: #16a34a; }
	.badge-red { background: #fee2e2; color: #dc2626; }

	.atom-list { list-style: none; display: flex; flex-direction: column; gap: 0.4rem; }
	.atom-row { display: flex; flex-direction: column; }
	.atom-btn {
		display: flex; flex-direction: column; gap: 0.2rem;
		background: none; border: none; cursor: pointer; text-align: left;
		padding: 0.4rem 0.5rem; border-radius: 0.4rem; transition: background 0.12s; width: 100%;
	}
	.atom-btn:hover { background: #f9fafb; }
	.atom-meta { display: flex; justify-content: space-between; align-items: baseline; }
	.atom-label { font-size: 0.85rem; font-weight: 600; color: #111827; }
	.atom-domain { font-size: 0.7rem; color: #9ca3af; }
	.atom-bar-wrap { display: flex; align-items: center; gap: 0.4rem; }
	.atom-bar { flex: 1; height: 6px; background: #f3f4f6; border-radius: 9999px; overflow: hidden; }
	.atom-bar-fill { height: 100%; border-radius: 9999px; transition: width 0.3s ease; }
	.fill-green { background: #16a34a; }
	.fill-red { background: #dc2626; }
	.atom-pct { font-size: 0.75rem; font-weight: 700; color: #374151; white-space: nowrap; min-width: 2.5rem; text-align: right; }
	.atom-frac { font-size: 0.7rem; color: #9ca3af; white-space: nowrap; }
	.atom-chevron { font-size: 1rem; color: #9ca3af; display: inline-block; transition: transform 0.2s; line-height: 1; }
	.atom-chevron.open { transform: rotate(90deg); }

	.student-detail-list {
		list-style: none; display: flex; flex-direction: column; gap: 0.25rem;
		background: #f9fafb; border-radius: 0.4rem; padding: 0.5rem 0.6rem; margin: 0 0.1rem 0.2rem;
	}
	.student-detail-row { display: flex; align-items: center; gap: 0.5rem; font-size: 0.78rem; }
	.student-detail-name {
		min-width: 7rem; font-weight: 600; color: #111827; text-decoration: none;
		white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
	}
	.student-detail-name:hover { color: #16a34a; text-decoration: underline; }
	.student-detail-bar-wrap { flex: 1; display: flex; align-items: center; gap: 0.3rem; min-width: 0; }
	.student-detail-bar { flex: 1; height: 4px; background: #e5e7eb; border-radius: 9999px; overflow: hidden; }
	.student-detail-fill { height: 100%; border-radius: 9999px; }
	.student-detail-pct { font-size: 0.7rem; color: #6b7280; white-space: nowrap; min-width: 2rem; text-align: right; }
	.mastered-badge { font-size: 0.7rem; color: #16a34a; font-weight: 700; }

	.activity-list { list-style: none; display: flex; flex-direction: column; gap: 0.6rem; }
	.activity-item { display: flex; align-items: center; gap: 0.6rem; font-size: 0.85rem; }
	.activity-score-wrap { display: flex; flex-direction: column; align-items: center; gap: 0.15rem; flex-shrink: 0; width: 3rem; }
	.activity-score { font-size: 0.7rem; font-weight: 700; color: #374151; white-space: nowrap; }
	.activity-bar-mini { width: 100%; height: 4px; background: #f3f4f6; border-radius: 9999px; overflow: hidden; }
	.activity-bar-fill { height: 100%; background: #16a34a; border-radius: 9999px; }
	.activity-body { flex: 1; color: #374151; display: flex; flex-direction: column; gap: 0.1rem; min-width: 0; }
	.activity-link { color: inherit; text-decoration: none; }
	.activity-link:hover { color: #16a34a; text-decoration: underline; }
	.activity-atom { font-size: 0.72rem; color: #9ca3af; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.activity-time { font-size: 0.75rem; color: #9ca3af; white-space: nowrap; }

	/* Sortable column headers */
	.sort-th { padding: 0 !important; }
	.sort-btn {
		background: none; border: none; cursor: pointer;
		font-size: 0.75rem; color: #6b7280; font-weight: 600;
		padding: 0.5rem 0.875rem;
		display: flex; align-items: center; gap: 0.35rem;
		white-space: nowrap; width: 100%;
		transition: background 0.1s, color 0.1s;
	}
	.sort-btn:hover { background: #f0fdf4; color: #15803d; }
	.sort-btn.sorted { color: #15803d; background: #f0fdf4; }
	.sort-icon { font-size: 0.7rem; opacity: 0.35; flex-shrink: 0; }
	.sort-icon.active { opacity: 1; color: #16a34a; }
</style>
