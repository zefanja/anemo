<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let showAddForm = $state(false);
	let confirmDelete = $state<string | null>(null);
	let activeTab = $state<'students' | 'heatmap' | 'settings'>('students');

	function pctColor(pct: number): string {
		if (pct >= 80) return '#16a34a';
		if (pct >= 50) return '#d97706';
		if (pct > 0) return '#f97316';
		return '#e5e7eb';
	}

	function relativeDate(d: Date | string | null): string {
		if (!d) return '–';
		const diff = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
		if (diff === 0) return 'heute';
		if (diff === 1) return 'gestern';
		if (diff < 30) return `vor ${diff} Tagen`;
		return new Date(d).toLocaleDateString('de-DE');
	}

	// Dismiss code reveal after 60 s
	let codeShown = $state(false);
	$effect(() => {
		if (form?.action === 'student_created' || form?.action === 'code_reset') {
			codeShown = true;
		}
	});
</script>

<svelte:head><title>Anemo – {data.class.name}</title></svelte:head>

<div class="page">
	<div class="page-header">
		<div>
			<a href="/teacher/classes" class="breadcrumb">← Klassen</a>
			<h1 class="page-title">{data.class.name}</h1>
			<p class="meta">{data.students.length} Schüler · {data.totalAtoms} Atome gesamt</p>
		</div>
	</div>

	<!-- Code reveal box (shown once after create/reset) -->
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

	{#if form?.action === 'student_deleted'}
		<div class="alert alert-success">Schüler „{form.studentName}" wurde entfernt.</div>
	{/if}
	{#if form?.action === 'settings_saved'}
		<div class="alert alert-success">Einstellungen gespeichert.</div>
	{/if}
	{#if form?.createError}
		<div class="alert alert-error">{form.createError}</div>
	{/if}

	<!-- Tabs -->
	<div class="tabs">
		<button class="tab" class:active={activeTab === 'students'} onclick={() => (activeTab = 'students')}>
			Schüler ({data.students.length})
		</button>
		<button class="tab" class:active={activeTab === 'heatmap'} onclick={() => (activeTab = 'heatmap')}>
			Fortschritt
		</button>
		<button class="tab" class:active={activeTab === 'settings'} onclick={() => (activeTab = 'settings')}>
			Einstellungen
		</button>
	</div>

	<!-- ── Students tab ── -->
	{#if activeTab === 'students'}
		<div class="tab-content">
			<div class="tab-toolbar">
				<button class="btn btn-primary btn-sm" onclick={() => (showAddForm = !showAddForm)}>
					{showAddForm ? 'Abbrechen' : '+ Neuer Schüler'}
				</button>
			</div>

			{#if showAddForm}
				<div class="add-form card">
					<h3>Neuer Schüler</h3>
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
								<th>Name</th>
								<th>Level</th>
								<th>XP</th>
								<th>Streak</th>
								<th>Gemeistert</th>
								<th>Zuletzt aktiv</th>
								<th>Aktionen</th>
							</tr>
						</thead>
						<tbody>
							{#each data.students as s}
								<tr>
									<td class="name-cell">{s.displayName}</td>
									<td class="center">{s.level}</td>
									<td class="center">{s.xp}</td>
									<td class="center">🔥 {s.streakDays}</td>
									<td class="center">{s.masteredCount}/{data.totalAtoms}</td>
									<td class="center muted">{relativeDate(s.lastActiveAt)}</td>
									<td class="actions-cell">
										<!-- Reset code -->
										<form method="POST" action="?/resetCode" use:enhance class="inline-form">
											<input type="hidden" name="studentId" value={s.id} />
											<button type="submit" class="btn-action" title="Code zurücksetzen">🔑</button>
										</form>
										<!-- Delete -->
										{#if confirmDelete === s.id}
											<form method="POST" action="?/deleteStudent" use:enhance class="inline-form">
												<input type="hidden" name="studentId" value={s.id} />
												<button type="submit" class="btn-action danger" title="Löschen bestätigen">✓</button>
											</form>
											<button
												class="btn-action"
												title="Abbrechen"
												onclick={() => (confirmDelete = null)}
											>✕</button>
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
									<td class="heatmap-name-cell">{s.displayName}</td>
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

	<!-- ── Settings tab ── -->
	{:else if activeTab === 'settings'}
		<div class="tab-content">
			<div class="card settings-card">
				<h3>Sitzungseinstellungen</h3>
				<p class="form-hint">Leer lassen = Server-Standardwert wird verwendet.</p>
				<form method="POST" action="?/updateSettings" use:enhance>
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
					<button type="submit" class="btn btn-primary">Speichern</button>
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

	/* Code reveal */
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
	.tab-toolbar { display: flex; gap: 0.5rem; }

	/* Add form */
	.add-form { padding: 1rem; }
	.add-form h3 { font-size: 0.95rem; font-weight: 700; margin: 0 0 0.75rem; }
	.field-row { display: flex; gap: 0.5rem; align-items: center; }
	.field-row input {
		flex: 1;
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
	.name-cell { font-weight: 600; }
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

	/* Settings */
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
	.btn-sm { padding: 0.4rem 0.8rem; font-size: 0.8rem; }
</style>
