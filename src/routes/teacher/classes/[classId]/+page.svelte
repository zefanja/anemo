<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import TIcon from '$lib/components/teacher/TIcon.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let showAddForm = $state(false);
	let showBulkForm = $state(false);
	let confirmDelete = $state<string | null>(null);
	let confirmResetAll = $state(false);
	let activeTab = $state<'students' | 'heatmap' | 'stats' | 'leaderboard' | 'settings'>('students');
	let editingId = $state<string | null>(null);
	let editingName = $state('');
	let editingClassName = $state(false);
	let classNameDraft = $state('');

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

	type LbPeriod = 'day' | 'week' | 'month' | 'all';
	const LB_PERIODS: { key: LbPeriod; label: string; xpLabel: string; empty: string }[] = [
		{ key: 'day', label: 'Heute', xpLabel: 'XP heute', empty: 'Heute hat noch niemand XP gesammelt.' },
		{ key: 'week', label: 'Woche', xpLabel: 'XP Woche', empty: 'Diese Woche hat noch niemand XP gesammelt.' },
		{ key: 'month', label: 'Monat', xpLabel: 'XP Monat', empty: 'Diesen Monat hat noch niemand XP gesammelt.' },
		{ key: 'all', label: 'Gesamt', xpLabel: 'XP', empty: '' }
	];
	let lbPeriod = $state<LbPeriod>('week');
	const lbPeriodInfo = $derived(LB_PERIODS.find((p) => p.key === lbPeriod)!);

	// In a period view `xp` is the XP earned in that period; only students who
	// earned XP in it are listed
	let leaderboard = $derived(
		data.students
			.map((s) => ({ ...s, xp: lbPeriod === 'all' ? s.xp : s.periodXp[lbPeriod] }))
			.filter((s) => lbPeriod === 'all' || s.xp > 0)
			.sort((a, b) => {
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

	function rankClass(i: number): string {
		return i < 3 ? `rank r${i + 1}` : 'rank';
	}
	function initials(name: string): string {
		const parts = name.trim().split(/\s+/);
		return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
	}
	const AVATAR_BG = ['#7dd3fc', '#bae6fd', '#fde68a', '#bbf7d0', '#fed7aa'];
	function avatarBg(i: number): string {
		return AVATAR_BG[i % AVATAR_BG.length];
	}

	// ── Class summary ──────────────────────────────────────────────────────────
	const WEEK_MS = 7 * 86400000;
	let activeToday = $derived(data.students.filter((s) => s.todayTasks > 0).length);
	let weekMinutesTotal = $derived(data.students.reduce((sum, s) => sum + s.weekMinutes, 0));
	let avgMastered = $derived(
		data.students.length > 0
			? Math.round(data.students.reduce((sum, s) => sum + s.masteredCount, 0) / data.students.length)
			: 0
	);
	let inactiveCount = $derived(
		data.students.filter((s) => !s.lastActiveAt || Date.now() - new Date(s.lastActiveAt).getTime() > WEEK_MS).length
	);
	function lastActiveClass(d: Date | string | null): string {
		if (!d) return 'badge-orange';
		const diff = Date.now() - new Date(d).getTime();
		if (diff > WEEK_MS) return 'badge-orange';
		if (diff < 86400000 && new Date(d).toDateString() === new Date().toDateString()) return 'badge-green';
		return '';
	}

	// ── Student search ─────────────────────────────────────────────────────────
	let studentQuery = $state('');
	let visibleStudents = $derived(
		studentQuery.trim() === ''
			? sortedStudents
			: sortedStudents.filter((s) => s.displayName.toLowerCase().includes(studentQuery.trim().toLowerCase()))
	);

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

	// Heatmap scale: blue tones (colour-blind safe), distinct in lightness
	function pctColor(pct: number): string {
		if (pct >= 80) return '#0b6bcb';
		if (pct >= 50) return '#38bdf8';
		if (pct > 0) return '#bae6fd';
		return '#eef3f9';
	}
	function pctText(pct: number): string {
		return pct >= 80 ? '#fff' : '#0b2a5b';
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
    color: #0b2a5b;
    font-family: 'Courier New', monospace;
    background: #e0f2fe;
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

{#snippet atomCard(title: string, badge: string, badgeClass: string, list: typeof bestAtoms, kind: 'best' | 'worst')}
	<section class="card">
		<div class="card-header">
			<h2>{title}</h2>
			<span class="badge {badgeClass}">{badge}</span>
		</div>
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
									<a href="/teacher/classes/{data.class.id}/students/{s.studentId}" class="student-detail-name">{s.displayName}</a>
									<span class="track thin sd-track"><span class:orange={kind === 'worst'} style="width:{pct(s.mastery)}"></span></span>
									<span class="student-detail-pct">{pct(s.mastery)}</span>
									<span class="mastered-badge">{s.isMastered ? '✓' : ''}</span>
								</li>
							{/each}
						</ul>
					{/if}
				</li>
			{/each}
		</ul>
	</section>
{/snippet}

<div class="page">
	<div class="page-header">
		<div class="head-main">
			<nav class="breadcrumb" aria-label="Brotkrumen"><a href="/teacher/classes">Klassen</a><span aria-hidden="true">›</span><span>{data.class.name}</span></nav>
			{#if editingClassName}
				<form
					method="POST"
					action="?/renameClass"
					use:enhance={() => {
						return async ({ result, update }) => {
							await update({ reset: false });
							if (result.type === 'success') editingClassName = false;
						};
					}}
					class="rename-form"
				>
					<label for="class-rename" class="sr-only">Klassenname</label>
					<!-- svelte-ignore a11y_autofocus -->
					<input
						id="class-rename"
						name="name"
						type="text"
						bind:value={classNameDraft}
						class="class-rename-input"
						minlength="2"
						required
						autofocus
						onkeydown={(e) => { if (e.key === 'Escape') editingClassName = false; }}
					/>
					<button type="submit" class="icon-btn" aria-label="Speichern"><TIcon name="check" /></button>
					<button type="button" class="icon-btn" onclick={() => (editingClassName = false)} aria-label="Abbrechen"><TIcon name="close" /></button>
				</form>
			{:else}
				<div class="title-row">
					<h1 class="page-title">Klasse {data.class.name}</h1>
					<button
						class="icon-btn"
						aria-label="Klasse umbenennen"
						title="Klasse umbenennen"
						onclick={() => { classNameDraft = data.class.name; editingClassName = true; }}
					><TIcon name="edit" size={18} /></button>
					<span class="badge badge-blue">{data.students.length} Schüler:innen</span>
				</div>
			{/if}
			<span class="page-sub">{data.totalAtoms} Atome{data.class.enabledDomains ? ' aktiviert' : ' gesamt'}</span>
		</div>
		<div class="page-actions">
			<button class="btn btn-outline" onclick={() => { activeTab = 'students'; showBulkForm = !showBulkForm; showAddForm = false; }}>
				<TIcon name="users" size={18} />Mehrere anlegen
			</button>
			<button class="btn btn-primary" onclick={() => { activeTab = 'students'; showAddForm = !showAddForm; showBulkForm = false; }}>
				<TIcon name="plus" size={18} />Schüler hinzufügen
			</button>
		</div>
	</div>

	<!-- Single student code reveal -->
	{#if codeShown && (form?.action === 'student_created' || form?.action === 'code_reset') && form?.code}
		<div class="code-reveal" role="alert">
			<div class="code-reveal-title">
				{form.action === 'student_created' ? 'Schüler:in angelegt:' : 'Neuer Code für:'} <strong>{form.studentName}</strong>
			</div>
			<div class="code-display">{form.code}</div>
			<p class="code-warn">Bitte Code notieren! Er wird nur einmal angezeigt.</p>
			<button class="btn btn-outline btn-sm" onclick={() => (codeShown = false)}><TIcon name="close" size={16} />Schließen</button>
		</div>
	{/if}

	<!-- Bulk code cards -->
	{#if cardsShown && codeCards && codeCards.length > 0}
		<div class="card cards-panel">
			<div class="cards-header">
				<div class="cards-title">
					<strong>
						{form?.action === 'bulk_created'
							? `${codeCards.length} Schüler:innen angelegt`
							: `Alle Codes zurückgesetzt (${codeCards.length} Schüler:innen)`}
					</strong>
					<span class="code-warn">Die Codes werden nur jetzt angezeigt!</span>
				</div>
				<div class="page-actions">
					<button class="btn btn-primary btn-sm" onclick={() => printCodes(codeCards!, data.class.name)}><TIcon name="print" size={16} />Codekarten drucken</button>
					<button class="btn btn-outline btn-sm" onclick={() => (cardsShown = false)}>Schließen</button>
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
		<div class="alert alert-success" role="status">Schüler:in „{form.studentName}" wurde entfernt.</div>
	{/if}
	{#if form?.action === 'settings_saved'}
		<div class="alert alert-success" role="status">Einstellungen gespeichert.</div>
	{/if}
	{#if form?.action === 'domains_saved'}
		<div class="alert alert-success" role="status">Themenbereiche gespeichert.</div>
	{/if}
	{#if form?.action === 'class_renamed'}
		<div class="alert alert-success" role="status">Klasse wurde umbenannt.</div>
	{/if}
	{#if form?.action === 'class_rename_error' && form.classRenameError}
		<div class="alert alert-error" role="alert">{form.classRenameError}</div>
	{/if}
	{#if form?.action === 'student_renamed'}
		<div class="alert alert-success" role="status">Name wurde geändert.</div>
	{/if}
	{#if form?.action === 'create_error' && form.createError}
		<div class="alert alert-error" role="alert">{form.createError}</div>
	{/if}
	{#if form?.action === 'bulk_error' && form.bulkError}
		<div class="alert alert-error" role="alert">{form.bulkError}</div>
	{/if}

	<!-- Summary -->
	{#if data.students.length > 0}
		<div class="stat-grid">
			<div class="stat-card"><span class="stat-lbl">Heute aktiv</span><span class="stat-num">{activeToday} <small>/ {data.students.length}</small></span></div>
			<div class="stat-card"><span class="stat-lbl">Übungszeit Woche</span><span class="stat-num">{weekMinutesTotal > 0 ? fmtMinutes(weekMinutesTotal) : '–'}</span></div>
			<div class="stat-card"><span class="stat-lbl">Gemeistert (Ø)</span><span class="stat-num">{avgMastered} <small>Atome</small></span></div>
			<div class="stat-card" class:warn={inactiveCount > 0}><span class="stat-lbl">Seit 7 Tagen inaktiv</span><span class="stat-num">{inactiveCount} <small>Schüler:innen</small></span></div>
		</div>
	{/if}

	<div class="card tab-card">
		<div class="tabs tab-bar" role="tablist">
			<button class="tab" role="tab" aria-selected={activeTab === 'students'} class:active={activeTab === 'students'} onclick={() => (activeTab = 'students')}>Schüler ({data.students.length})</button>
			<button class="tab" role="tab" aria-selected={activeTab === 'heatmap'} class:active={activeTab === 'heatmap'} onclick={() => (activeTab = 'heatmap')}>Heatmap</button>
			<button class="tab" role="tab" aria-selected={activeTab === 'stats'} class:active={activeTab === 'stats'} onclick={() => (activeTab = 'stats')}>Statistik</button>
			<button class="tab" role="tab" aria-selected={activeTab === 'leaderboard'} class:active={activeTab === 'leaderboard'} onclick={() => (activeTab = 'leaderboard')}>Rangliste</button>
			<button class="tab" role="tab" aria-selected={activeTab === 'settings'} class:active={activeTab === 'settings'} onclick={() => (activeTab = 'settings')}>Einstellungen</button>
		</div>

		<div class="tab-content">
		<!-- ── Students tab ── -->
		{#if activeTab === 'students'}
			{#if showAddForm}
				<div class="add-form">
					<h3>Einzelne:r Schüler:in</h3>
					<form method="POST" action="?/createStudent" class="form-row" use:enhance={() => {
						return ({ update }) => { update(); showAddForm = false; };
					}}>
						<div class="field">
							<label for="new-student">Anzeigename</label>
							<input id="new-student" name="name" type="text" placeholder="z. B. Max M." required />
						</div>
						<button type="submit" class="btn btn-primary">Anlegen &amp; Code zeigen</button>
						<button type="button" class="btn btn-outline" onclick={() => (showAddForm = false)}>Abbrechen</button>
					</form>
					<p class="hint">Der 6-stellige Anmeldecode wird einmalig angezeigt.</p>
				</div>
			{/if}

			{#if showBulkForm}
				<div class="add-form">
					<h3>Mehrere Schüler:innen mit Tiernamen anlegen</h3>
					<form method="POST" action="?/bulkCreate" class="form-row" use:enhance={() => {
						return ({ update }) => { update(); showBulkForm = false; };
					}}>
						<div class="field count-field">
							<label for="bulk-count">Anzahl</label>
							<input id="bulk-count" name="count" type="number" min="1" max="40" value="5" required />
						</div>
						<button type="submit" class="btn btn-primary">Anlegen &amp; Codes anzeigen</button>
						<button type="button" class="btn btn-outline" onclick={() => (showBulkForm = false)}>Abbrechen</button>
					</form>
					<p class="hint">Namen wie „StarkerTiger" oder „MutigerFalke" werden automatisch vergeben. Du kannst sie später umbenennen.</p>
				</div>
			{/if}

			{#if data.students.length === 0}
				<div class="empty-state">
					<span class="empty-icon"><TIcon name="users" size={30} /></span>
					<p>Noch keine Schüler:innen in dieser Klasse.</p>
				</div>
			{:else}
				<div class="toolbar">
					<label class="search">
						<TIcon name="search" size={18} />
						<span class="sr-only">Schüler suchen</span>
						<input type="search" placeholder="Schüler suchen …" bind:value={studentQuery} />
					</label>
					<span class="spacer"></span>
					{#if confirmResetAll}
						<form method="POST" action="?/resetAllCodes" use:enhance={() => {
							confirmResetAll = false;
							return ({ update }) => { update(); };
						}}>
							<button type="submit" class="btn btn-danger btn-sm">Wirklich alle Codes zurücksetzen?</button>
						</form>
						<button class="btn btn-outline btn-sm" onclick={() => (confirmResetAll = false)}>Abbrechen</button>
					{:else}
						<button class="btn btn-outline btn-sm" onclick={() => (confirmResetAll = true)}>
							<TIcon name="key" size={16} />Alle Codes neu &amp; drucken
						</button>
					{/if}
				</div>

				<!-- Desktop table -->
				<div class="table-wrap desktop-only">
					<table class="t-table">
						<thead>
							<tr>
								<th><button class="sort-btn" class:sorted={studentSortKey==='displayName'} onclick={() => toggleStudentSort('displayName')}>Name <span class="sort-icon" class:active={studentSortKey==='displayName'}>{studentSortIcon('displayName')}</span></button></th>
								<th class="num"><button class="sort-btn" class:sorted={studentSortKey==='level'} onclick={() => toggleStudentSort('level')}>Level <span class="sort-icon" class:active={studentSortKey==='level'}>{studentSortIcon('level')}</span></button></th>
								<th class="num"><button class="sort-btn" class:sorted={studentSortKey==='xp'} onclick={() => toggleStudentSort('xp')}>XP <span class="sort-icon" class:active={studentSortKey==='xp'}>{studentSortIcon('xp')}</span></button></th>
								<th class="num"><button class="sort-btn" class:sorted={studentSortKey==='streakDays'} onclick={() => toggleStudentSort('streakDays')}>Streak <span class="sort-icon" class:active={studentSortKey==='streakDays'}>{studentSortIcon('streakDays')}</span></button></th>
								<th><button class="sort-btn" class:sorted={studentSortKey==='masteredCount'} onclick={() => toggleStudentSort('masteredCount')}>Gemeistert <span class="sort-icon" class:active={studentSortKey==='masteredCount'}>{studentSortIcon('masteredCount')}</span></button></th>
								<th class="num"><button class="sort-btn" class:sorted={studentSortKey==='todayMinutes'} onclick={() => toggleStudentSort('todayMinutes')}>Heute <span class="sort-icon" class:active={studentSortKey==='todayMinutes'}>{studentSortIcon('todayMinutes')}</span></button></th>
								<th class="num"><button class="sort-btn" class:sorted={studentSortKey==='weekMinutes'} onclick={() => toggleStudentSort('weekMinutes')}>Woche <span class="sort-icon" class:active={studentSortKey==='weekMinutes'}>{studentSortIcon('weekMinutes')}</span></button></th>
								<th><button class="sort-btn" class:sorted={studentSortKey==='lastActiveAt'} onclick={() => toggleStudentSort('lastActiveAt')}>Zuletzt aktiv <span class="sort-icon" class:active={studentSortKey==='lastActiveAt'}>{studentSortIcon('lastActiveAt')}</span></button></th>
								<th><span class="sr-only">Aktionen</span></th>
							</tr>
						</thead>
						<tbody>
							{#each visibleStudents as s, i}
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
												<label class="sr-only" for="rename-{s.id}">Neuer Name</label>
												<input
													id="rename-{s.id}"
													name="name"
													type="text"
													value={editingName}
													oninput={(e) => (editingName = (e.target as HTMLInputElement).value)}
													class="rename-input"
													required
												/>
												<button type="submit" class="icon-btn" aria-label="Speichern"><TIcon name="check" size={18} /></button>
												<button type="button" class="icon-btn" onclick={() => (editingId = null)} aria-label="Abbrechen"><TIcon name="close" size={18} /></button>
											</form>
										{:else}
											<a href="/teacher/classes/{data.class.id}/students/{s.id}" class="student-link">
												<span class="avatar" style="background:{avatarBg(i)}" aria-hidden="true">{initials(s.displayName)}</span>
												{s.displayName}
											</a>
										{/if}
									</td>
									<td class="num">Lv. {s.level}</td>
									<td class="num">{s.xp.toLocaleString('de-DE')}</td>
									<td class="num" class:streak={s.streakDays > 0}>{s.streakDays > 0 ? `${s.streakDays} ${s.streakDays === 1 ? 'Tag' : 'Tage'}` : '–'}</td>
									<td class="mastered-cell"><div class="mastered">
										<span class="track"><span style="width:{data.totalAtoms > 0 ? Math.round(s.masteredCount / data.totalAtoms * 100) : 0}%"></span></span>
										<span class="mc">{s.masteredCount}</span>
									</div></td>
									<td class="num" class:muted={s.todayTasks === 0}>
										{#if s.todayTasks > 0}{s.todayMinutes > 0 ? fmtMinutes(s.todayMinutes) : '< 1 Min.'} <span class="muted">({s.todayTasks})</span>{:else}–{/if}
									</td>
									<td class="num" class:muted={s.weekTasks === 0}>
										{#if s.weekTasks > 0}{s.weekMinutes > 0 ? fmtMinutes(s.weekMinutes) : '< 1 Min.'} <span class="muted">({s.weekTasks})</span>{:else}–{/if}
									</td>
									<td><span class="badge {lastActiveClass(s.lastActiveAt)}">{relativeDate(s.lastActiveAt)}</span></td>
									<td class="actions-cell"><div class="actions">
										{#if editingId !== s.id}
											<button class="icon-btn" aria-label="{s.displayName} umbenennen" title="Umbenennen" onclick={() => startEdit(s.id, s.displayName)}><TIcon name="edit" size={18} /></button>
										{/if}
										<form method="POST" action="?/resetCode" use:enhance>
											<input type="hidden" name="studentId" value={s.id} />
											<button type="submit" class="icon-btn" aria-label="Code für {s.displayName} zurücksetzen" title="Code zurücksetzen"><TIcon name="key" size={18} /></button>
										</form>
										{#if confirmDelete === s.id}
											<form method="POST" action="?/deleteStudent" use:enhance>
												<input type="hidden" name="studentId" value={s.id} />
												<button type="submit" class="btn btn-danger btn-sm">Entfernen</button>
											</form>
											<button class="icon-btn" aria-label="Abbrechen" onclick={() => (confirmDelete = null)}><TIcon name="close" size={18} /></button>
										{:else}
											<button class="icon-btn danger" aria-label="{s.displayName} entfernen" title="Schüler:in entfernen" onclick={() => (confirmDelete = s.id)}><TIcon name="trash" size={18} /></button>
										{/if}
									</div></td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>

				<!-- Mobile list -->
				<ul class="m-list">
					{#each visibleStudents as s, i}
						<li class="m-student">
							{#if editingId === s.id}
								<form
									method="POST"
									action="?/renameStudent"
									use:enhance={() => {
										return ({ update }) => { update(); editingId = null; };
									}}
									class="rename-form m-rename"
								>
									<input type="hidden" name="studentId" value={s.id} />
									<label class="sr-only" for="m-rename-{s.id}">Neuer Name</label>
									<input id="m-rename-{s.id}" name="name" type="text" value={editingName} oninput={(e) => (editingName = (e.target as HTMLInputElement).value)} required />
									<button type="submit" class="icon-btn" aria-label="Speichern"><TIcon name="check" /></button>
									<button type="button" class="icon-btn" onclick={() => (editingId = null)} aria-label="Abbrechen"><TIcon name="close" /></button>
								</form>
							{:else}
								<div class="m-student-row">
									<a href="/teacher/classes/{data.class.id}/students/{s.id}" class="m-row">
										<span class="avatar big" style="background:{avatarBg(i)}" aria-hidden="true">{initials(s.displayName)}</span>
										<span class="m-main">
											<span class="m-top"><span class="m-title">{s.displayName}</span><span class="badge {lastActiveClass(s.lastActiveAt)}">{relativeDate(s.lastActiveAt)}</span></span>
											<span class="m-meta"><span>Lv. {s.level}</span><span class:streak={s.streakDays > 0}>{s.streakDays > 0 ? `${s.streakDays} ${s.streakDays === 1 ? 'Tag' : 'Tage'} Streak` : 'kein Streak'}</span><span>{s.masteredCount} gemeistert</span></span>
											<span class="track thin"><span style="width:{data.totalAtoms > 0 ? Math.round(s.masteredCount / data.totalAtoms * 100) : 0}%"></span></span>
										</span>
									</a>
									<details class="m-actions">
										<summary class="icon-btn" aria-label="Aktionen für {s.displayName}"><TIcon name="more-v" /></summary>
										<div class="m-menu">
											<button type="button" onclick={() => startEdit(s.id, s.displayName)}><TIcon name="edit" size={18} />Umbenennen</button>
											<form method="POST" action="?/resetCode" use:enhance>
												<input type="hidden" name="studentId" value={s.id} />
												<button type="submit"><TIcon name="key" size={18} />Code zurücksetzen</button>
											</form>
											{#if confirmDelete === s.id}
												<form method="POST" action="?/deleteStudent" use:enhance>
													<input type="hidden" name="studentId" value={s.id} />
													<button type="submit" class="danger"><TIcon name="trash" size={18} />Wirklich entfernen</button>
												</form>
											{:else}
												<button type="button" class="danger" onclick={() => (confirmDelete = s.id)}><TIcon name="trash" size={18} />Entfernen …</button>
											{/if}
										</div>
									</details>
								</div>
							{/if}
						</li>
					{/each}
				</ul>
				{#if visibleStudents.length === 0}
					<p class="empty-note">Niemand gefunden für „{studentQuery}".</p>
				{/if}
			{/if}

		<!-- ── Heatmap tab ── -->
		{:else if activeTab === 'heatmap'}
			{#if data.students.length === 0}
				<p class="empty-note">Noch keine Schüler:innen vorhanden.</p>
			{:else}
				<p class="hint heat-hint">Anteil gemeisterter Atome je Themenbereich. <span class="mobile-only">Seitlich wischen für alle Bereiche.</span></p>
				<div class="heatmap-wrap">
					<table class="heatmap-table">
						<thead>
							<tr>
								<th class="heatmap-name">Schüler:in</th>
								{#each data.domains as domain}
									<th class="heatmap-domain" title={domain}>
										<span>{domain.length > 14 ? domain.slice(0, 13) + '…' : domain}</span>
									</th>
								{/each}
								<th class="heatmap-total">Gesamt</th>
							</tr>
						</thead>
						<tbody>
							{#each data.students as s}
								<tr>
									<td class="heatmap-name-cell">
										<a href="/teacher/classes/{data.class.id}/students/{s.id}">{s.displayName}</a>
									</td>
									{#each s.domainPct as p}
										<td class="heatmap-cell" style="background:{pctColor(p)};color:{pctText(p)}" title="{p}%">
											{p > 0 ? p + '%' : ''}
										</td>
									{/each}
									<td class="heatmap-total-cell">
										<span>{s.masteredCount}/{data.totalAtoms}</span>
										<span class="track thin"><span style="width:{data.totalAtoms > 0 ? Math.round(s.masteredCount / data.totalAtoms * 100) : 0}%"></span></span>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				<p class="legend">
					<span><i style="background:#0b6bcb"></i> ≥ 80 %</span>
					<span><i style="background:#38bdf8"></i> 50–79 %</span>
					<span><i style="background:#bae6fd"></i> 1–49 %</span>
					<span><i style="background:#eef3f9"></i> 0 %</span>
				</p>
			{/if}

		<!-- ── Statistik tab ── -->
		{:else if activeTab === 'stats'}
			{#if data.atomStats.length === 0}
				<p class="empty-note">Noch keine Übungsversuche vorhanden.</p>
			{:else}
				<div class="grid-2">
					{@render atomCard('Schwierige Atome', 'Brauchen Hilfe', 'badge-orange', worstAtoms, 'worst')}
					{@render atomCard('Gut gemeistert', `Top ${bestAtoms.length}`, 'badge-blue', bestAtoms, 'best')}
				</div>

				<section class="card">
					<div class="card-header"><h2>Letzte Aktivität</h2></div>
					{#if data.recentActivity.length === 0}
						<p class="empty-note">Noch keine Versuche vorhanden.</p>
					{:else}
						<ul class="activity-list">
							{#each data.recentActivity as a}
								{@const rate = a.total > 0 ? a.correct / a.total : 0}
								<li class="activity-item">
									<span class="avatar act" class:good={rate >= 0.7} class:weak={rate < 0.5} aria-hidden="true">{initials(a.displayName)}</span>
									<span class="activity-body">
										<a href="/teacher/classes/{data.class.id}/students/{a.studentId}" class="activity-link">{a.displayName}</a>
										<span class="activity-atom">zuletzt: {a.lastAtomLabel}</span>
									</span>
									<span class="activity-side">
										<span class="activity-score">{a.correct}/{a.total} richtig</span>
										<span class="activity-time">{timeAgo(a.lastAnsweredAt)}</span>
									</span>
								</li>
							{/each}
						</ul>
					{/if}
				</section>
			{/if}

		<!-- ── Leaderboard tab ── -->
		{:else if activeTab === 'leaderboard'}
			{#if !data.class.showLeaderboard}
				<div class="alert alert-info">
					Die Rangliste ist für Schüler:innen dieser Klasse ausgeblendet. Du kannst sie in den Einstellungen einschalten.
				</div>
			{/if}
			{#if data.students.length === 0}
				<p class="empty-note">Noch keine Schüler:innen vorhanden.</p>
			{:else}
				<div class="seg stretch lb-seg" role="tablist" aria-label="Zeitraum">
					{#each LB_PERIODS as p}
						<button type="button" role="tab" aria-selected={lbPeriod === p.key} class:active={lbPeriod === p.key} onclick={() => (lbPeriod = p.key)}>{p.label}</button>
					{/each}
				</div>
				{#if leaderboard.length === 0}
					<p class="empty-note">{lbPeriodInfo.empty}</p>
				{:else}
					<div class="table-wrap desktop-only">
						<table class="t-table">
							<thead>
								<tr>
									<th style="width:3rem">#</th>
									<th><button class="sort-btn" class:sorted={lbSortKey==='displayName'} onclick={() => toggleLbSort('displayName')}>Name <span class="sort-icon" class:active={lbSortKey==='displayName'}>{lbSortIcon('displayName')}</span></button></th>
									<th class="num"><button class="sort-btn" class:sorted={lbSortKey==='level'} onclick={() => toggleLbSort('level')}>Level <span class="sort-icon" class:active={lbSortKey==='level'}>{lbSortIcon('level')}</span></button></th>
									<th class="num"><button class="sort-btn" class:sorted={lbSortKey==='xp'} onclick={() => toggleLbSort('xp')}>{lbPeriodInfo.xpLabel} <span class="sort-icon" class:active={lbSortKey==='xp'}>{lbSortIcon('xp')}</span></button></th>
									<th class="num"><button class="sort-btn" class:sorted={lbSortKey==='masteredCount'} onclick={() => toggleLbSort('masteredCount')}>Gemeistert <span class="sort-icon" class:active={lbSortKey==='masteredCount'}>{lbSortIcon('masteredCount')}</span></button></th>
									<th class="num"><button class="sort-btn" class:sorted={lbSortKey==='streakDays'} onclick={() => toggleLbSort('streakDays')}>Streak <span class="sort-icon" class:active={lbSortKey==='streakDays'}>{lbSortIcon('streakDays')}</span></button></th>
								</tr>
							</thead>
							<tbody>
								{#each leaderboard as s, i}
									<tr>
										<td><span class={rankClass(i)}>{i + 1}</span></td>
										<td><a href="/teacher/classes/{data.class.id}/students/{s.id}">{s.displayName}</a></td>
										<td class="num">Lv. {s.level}</td>
										<td class="num xp">{lbPeriod === 'all' ? '' : '+'}{s.xp.toLocaleString('de-DE')}</td>
										<td class="num">{s.masteredCount}/{data.totalAtoms}</td>
										<td class="num" class:streak={s.streakDays > 0}>{s.streakDays > 0 ? `${s.streakDays} ${s.streakDays === 1 ? 'Tag' : 'Tage'}` : '–'}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
					<ul class="m-list">
						{#each leaderboard as s, i}
							<li>
								<a href="/teacher/classes/{data.class.id}/students/{s.id}" class="m-row">
									<span class={rankClass(i)}>{i + 1}</span>
									<span class="m-main">
										<span class="m-title">{s.displayName}</span>
										<span class="m-meta"><span>Lv. {s.level}</span><span>{s.masteredCount} gemeistert</span>{#if s.streakDays > 0}<span class="streak">{s.streakDays} {s.streakDays === 1 ? 'Tag' : 'Tage'} Streak</span>{/if}</span>
									</span>
									<span class="xp">{lbPeriod === 'all' ? '' : '+'}{s.xp.toLocaleString('de-DE')}</span>
								</a>
							</li>
						{/each}
					</ul>
				{/if}
			{/if}

		<!-- ── Settings tab ── -->
		{:else if activeTab === 'settings'}
			<div class="settings">
				<section class="settings-section">
					<h3>Sitzungseinstellungen</h3>
					<p class="hint">Leer lassen = Server-Standardwert wird verwendet.</p>
					<form method="POST" action="?/updateSettings" use:enhance={() => ({ update }) => update()} class="settings-form">
						<div class="settings-grid">
							<div class="field">
								<label for="maxReview">Max. Wiederholungsaufgaben pro Sitzung</label>
								<input id="maxReview" name="sessionMaxReview" type="number" min="1" max="50" placeholder="Standard: 10" value={data.class.sessionMaxReview ?? ''} />
							</div>
							<div class="field">
								<label for="maxTotal">Max. Aufgaben gesamt pro Sitzung</label>
								<input id="maxTotal" name="sessionMaxTotal" type="number" min="1" max="100" placeholder="Standard: 20" value={data.class.sessionMaxTotal ?? ''} />
							</div>
							<div class="field">
								<label for="unlockDaily">Themen frei nach … Wiederholungen pro Tag</label>
								<input id="unlockDaily" name="reviewUnlockDaily" type="number" min="0" max="500" placeholder="Standard: 50" value={data.class.reviewUnlockDaily ?? ''} />
							</div>
							<div class="field">
								<label for="unlockPercent">… oder nach % des Tages-Rückstands</label>
								<input id="unlockPercent" name="reviewUnlockPercent" type="number" min="0" max="100" placeholder="Standard: 80" value={data.class.reviewUnlockPercent ?? ''} />
							</div>
						</div>
						<p class="hint">
							Neue Themen sind gesperrt, solange Wiederholungen fällig sind. Bei großem Rückstand werden sie
							trotzdem frei, sobald eine der beiden Regeln erfüllt ist. Die übrigen Wiederholungen bleiben freiwillig. 0 = Regel aus
							(beide 0 = erst alle Wiederholungen).
						</p>
						<label class="toggle">
							<input
								type="checkbox"
								checked={showLeaderboard}
								onchange={(e) => (showLeaderboard = (e.target as HTMLInputElement).checked)}
							/>
							<span class="toggle-text">
								<b>Rangliste für Schüler:innen sichtbar</b>
								<span class="hint">Wenn aktiviert, sehen Schüler:innen eine Rangliste ihrer Klasse (nach XP). Deaktivieren, um sozialen Vergleich zu vermeiden.</span>
							</span>
						</label>
						<input type="hidden" name="showLeaderboard" value={showLeaderboard ? 'true' : 'false'} />
						<div><button type="submit" class="btn btn-primary">Speichern</button></div>
					</form>
				</section>

				<section class="settings-section">
					<h3>Themenbereiche</h3>
					<p class="hint">
						Wähle, welche Themenbereiche für diese Klasse sichtbar sind. Abgewählte Bereiche werden
						Schüler:innen nicht angezeigt und nicht in der Lernpfad-Berechnung berücksichtigt.
					</p>
					<form method="POST" action="?/updateDomains" use:enhance={() => ({ update }) => update()}>
						<label class="domain-check all">
							<input type="checkbox" checked={allDomainsEnabled} onchange={toggleAllDomains} />
							<span>Alle Bereiche</span>
						</label>
						<div class="domain-list">
							{#each data.allDomains as domain}
								<label class="domain-check" class:checked={enabledDomains.has(domain)}>
									<input type="checkbox" name="domain" value={domain} checked={enabledDomains.has(domain)} onchange={() => toggleDomain(domain)} />
									<span>{domain}</span>
								</label>
							{/each}
						</div>
						{#if enabledDomains.size === 0}
							<p class="alert alert-warning">Achtung: Kein Bereich ausgewählt – Schüler:innen sehen keine Aufgaben.</p>
						{/if}
						<button type="submit" class="btn btn-primary save-domains">Speichern</button>
					</form>
				</section>
			</div>
		{/if}
		</div>
	</div>
</div>

<style>
	.head-main { display: flex; flex-direction: column; gap: 0.15rem; }
	.title-row { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
	.rename-form { display: flex; align-items: center; gap: 0.35rem; }
	.class-rename-input { font-size: 1.25rem !important; font-weight: 900 !important; max-width: 16rem; }
	.stat-num small { font-size: 0.9rem; font-weight: 800; color: var(--c-ink-2); }
	.stat-card.warn .stat-num small { color: var(--c-orange-text); }

	/* Code reveal */
	.code-reveal {
		background: var(--c-primary-light); border: 2px solid #bae6fd; border-radius: var(--t-card-radius);
		padding: 1.25rem; display: flex; flex-direction: column; align-items: center; gap: 0.6rem; text-align: center;
	}
	.code-reveal-title { font-weight: 800; }
	.code-display {
		font: 900 2.4rem ui-monospace, 'Courier New', monospace; letter-spacing: 0.35em;
		color: var(--c-navy); background: #fff; padding: 0.4rem 1.2rem 0.4rem 1.55rem; border-radius: 14px;
	}
	.code-warn { font-size: 0.85rem; font-weight: 800; color: var(--c-orange-text); }

	.cards-panel { display: flex; flex-direction: column; gap: 1rem; }
	.cards-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 0.75rem; flex-wrap: wrap; }
	.cards-title { display: flex; flex-direction: column; gap: 0.15rem; }
	.code-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(10rem, 1fr)); gap: 0.6rem; }
	.code-card { border: 2px dashed var(--c-line); border-radius: 14px; padding: 0.75rem; text-align: center; }
	.cc-name { font-weight: 800; font-size: 0.875rem; word-break: break-word; }
	.cc-code { font: 900 1.3rem ui-monospace, 'Courier New', monospace; letter-spacing: 0.2em; color: var(--c-primary-dark); }

	/* Tab card */
	.tab-card { padding: 0; }
	.tab-bar { padding: 0 1.375rem; }
	.tab-content { padding: 1.1rem 1.375rem 1.25rem; display: flex; flex-direction: column; gap: 1rem; }
	.tab-content > .grid-2 .card, .tab-content > .card { box-shadow: none; border: 1px solid var(--c-line); }

	.add-form {
		background: var(--c-ground); border-radius: 16px; padding: 1rem 1.1rem;
		display: flex; flex-direction: column; gap: 0.6rem;
	}
	.add-form h3 { font-size: 0.95rem; font-weight: 900; margin: 0; }
	.count-field { flex: 0 0 7rem !important; }

	.toolbar { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }
	.toolbar .search { flex: 1 1 16rem; max-width: 22rem; }
	.spacer { flex: 1; }

	.empty-state { display: flex; flex-direction: column; align-items: center; gap: 0.6rem; padding: 2rem 1rem; text-align: center; }
	.empty-state p { font-weight: 800; color: var(--c-ink-2); }
	.empty-icon { width: 3.75rem; height: 3.75rem; border-radius: 50%; background: var(--c-primary-light); color: var(--c-primary-dark); display: flex; align-items: center; justify-content: center; }

	/* Students table */
	.name-cell { min-width: 12rem; }
	.student-link { display: inline-flex; align-items: center; gap: 0.6rem; }
	.avatar { width: 2rem; height: 2rem; font-size: 0.75rem; }
	.rename-input { min-height: 2.25rem !important; padding: 0.3rem 0.6rem !important; max-width: 12rem; }
	.mastered-cell { min-width: 10rem; }
	.mastered { display: flex; align-items: center; gap: 0.5rem; }
	.mc { width: 2rem; text-align: right; font-size: 0.875rem; }
	.muted { color: var(--c-ink-2); font-weight: 700; }
	.streak { color: var(--c-orange-text); font-weight: 900; }
	.xp { font-weight: 900; color: var(--c-primary-dark); white-space: nowrap; }
	.actions { display: flex; align-items: center; justify-content: flex-end; gap: 0.1rem; }
	.actions form { display: flex; }

	/* Mobile students */
	.m-student { border-bottom: 1px solid var(--c-track); }
	.m-student:last-child { border-bottom: 0; }
	.m-student-row { display: flex; align-items: center; gap: 0.25rem; }
	.m-student .m-row { flex: 1; min-width: 0; border-bottom: 0; }
	.avatar.big { width: 2.6rem; height: 2.6rem; font-size: 0.85rem; }
	.m-top { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
	.m-actions { position: relative; }
	.m-actions summary { list-style: none; }
	.m-actions summary::-webkit-details-marker { display: none; }
	.m-menu {
		position: absolute; right: 0; top: calc(100% + 4px); z-index: 10; min-width: 13rem;
		background: #fff; border-radius: 14px; box-shadow: var(--shadow); border: 1px solid var(--c-line);
		padding: 0.35rem; display: flex; flex-direction: column;
	}
	.m-menu button {
		width: 100%; display: flex; align-items: center; gap: 0.6rem; min-height: 2.75rem; padding: 0 0.75rem;
		border: 0; background: none; border-radius: 10px; font: 800 0.95rem var(--font); color: var(--c-navy); text-align: left;
	}
	.m-menu button:hover { background: var(--c-track); }
	.m-menu button.danger { color: #b91c1c; }
	.m-rename { padding: 0.6rem 0; }
	.m-rename input { flex: 1; }

	/* Heatmap */
	.heat-hint { margin-top: -0.25rem; }
	.heatmap-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; border: 1px solid var(--c-line); border-radius: 14px; }
	.heatmap-table { border-collapse: separate; border-spacing: 0; font-size: 0.85rem; min-width: 100%; }
	.heatmap-table th {
		font-size: 0.72rem; font-weight: 900; color: var(--c-ink-2); text-transform: uppercase; letter-spacing: 0.04em;
		padding: 0.6rem 0.4rem; border-bottom: 2px solid var(--c-line); background: #fff; white-space: nowrap; text-align: center;
	}
	.heatmap-name, .heatmap-name-cell {
		position: sticky; left: 0; z-index: 1; background: #fff; text-align: left !important;
		min-width: 9rem; max-width: 12rem; padding: 0.5rem 0.75rem !important; box-shadow: 1px 0 0 var(--c-line);
	}
	.heatmap-name-cell a { font-weight: 800; color: var(--c-navy); text-decoration: none; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.heatmap-name-cell a:hover { color: var(--c-primary); }
	.heatmap-table td { border-bottom: 1px solid #fff; }
	.heatmap-cell { min-width: 4.25rem; height: 2.5rem; text-align: center; font-weight: 900; font-size: 0.8rem; border-right: 2px solid #fff; }
	.heatmap-total { min-width: 7rem; }
	.heatmap-total-cell { padding: 0.4rem 0.75rem; font-weight: 800; white-space: nowrap; background: #fff; }
	.heatmap-total-cell .track { display: block; margin-top: 0.25rem; }
	.legend { display: flex; flex-wrap: wrap; gap: 0.5rem 1rem; font-size: 0.8rem; font-weight: 800; color: var(--c-ink-2); }
	.legend span { display: inline-flex; align-items: center; gap: 0.35rem; }
	.legend i { width: 0.9rem; height: 0.9rem; border-radius: 4px; display: inline-block; border: 1px solid var(--c-line); }

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
	.student-detail-list { list-style: none; display: flex; flex-direction: column; background: var(--c-ground); border-radius: 14px; padding: 0.35rem 0.75rem; margin: 0 0 0.6rem; }
	.student-detail-row { display: flex; align-items: center; gap: 0.6rem; font-size: 0.875rem; min-height: 2.25rem; }
	.student-detail-name { flex: 1 1 8rem; min-width: 0; font-weight: 800; color: var(--c-navy); text-decoration: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.student-detail-name:hover { color: var(--c-primary); }
	.sd-track { max-width: 7rem; }
	.student-detail-pct { font-size: 0.8rem; font-weight: 800; min-width: 2.4rem; text-align: right; }
	.mastered-badge { width: 1rem; color: var(--c-success); font-weight: 900; }

	/* Activity */
	.activity-list { list-style: none; display: flex; flex-direction: column; gap: 0.75rem; }
	.activity-item { display: flex; align-items: center; gap: 0.75rem; }
	.avatar.act { background: var(--c-primary-light); color: var(--c-primary-dark); width: 2.25rem; height: 2.25rem; }
	.avatar.act.good { background: var(--c-success-light); color: var(--c-success-dark); }
	.avatar.act.weak { background: var(--c-orange-light); color: var(--c-orange-text); }
	.activity-body { flex: 1; min-width: 0; display: flex; flex-direction: column; }
	.activity-link { font-weight: 800; color: var(--c-navy); text-decoration: none; }
	.activity-link:hover { color: var(--c-primary); }
	.activity-atom { font-size: 0.8rem; font-weight: 700; color: var(--c-ink-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.activity-side { display: flex; flex-direction: column; align-items: flex-end; flex: none; }
	.activity-score { font-size: 0.8rem; font-weight: 900; white-space: nowrap; }
	.activity-time { font-size: 0.75rem; font-weight: 800; color: var(--c-ink-2); white-space: nowrap; }

	/* Leaderboard */
	.lb-seg { align-self: flex-start; }

	/* Settings */
	.settings { display: flex; flex-direction: column; gap: 1.5rem; }
	.settings-section { display: flex; flex-direction: column; gap: 0.6rem; }
	.settings-section + .settings-section { border-top: 1px solid var(--c-line); padding-top: 1.5rem; }
	.settings-section h3 { font-size: 1.05rem; font-weight: 900; margin: 0; }
	.settings-form { display: flex; flex-direction: column; gap: 1rem; }
	.settings-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
	.toggle {
		display: flex; gap: 0.75rem; align-items: flex-start; padding: 0.875rem 1rem;
		border: 2px solid var(--c-line); border-radius: 14px; cursor: pointer;
	}
	.toggle input { margin-top: 0.2rem; }
	.toggle-text { display: flex; flex-direction: column; gap: 0.15rem; }
	.domain-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr)); gap: 0.5rem; margin-top: 0.5rem; }
	.domain-check {
		display: flex; align-items: center; gap: 0.6rem; min-height: 2.75rem; padding: 0 0.85rem;
		border: 2px solid var(--c-line); border-radius: 12px; cursor: pointer; font-weight: 800; font-size: 0.9rem;
		color: var(--c-ink-2); background: #fff;
	}
	.domain-check:hover { border-color: var(--c-sky); }
	.domain-check.checked { border-color: var(--c-primary); background: var(--c-primary-light); color: var(--c-primary-dark); }
	.domain-check.all { display: inline-flex; color: var(--c-navy); }
	.save-domains { margin-top: 1rem; }

	@media (max-width: 899px) {
		.page-header .page-actions { width: 100%; }
		.page-header .page-actions .btn { flex: 1; }
		.tab-bar { padding: 0 1rem; }
		.tab-content { padding: 0.875rem 1rem 1rem; }
		.toolbar .search { max-width: none; flex-basis: 100%; }
		.spacer { display: none; }
		.settings-grid { grid-template-columns: minmax(0, 1fr); }
		.atom-frac { display: none; }
		.atom-meta { flex-direction: column; gap: 0.1rem; }
		.code-display { font-size: 1.9rem; }
	}
</style>
