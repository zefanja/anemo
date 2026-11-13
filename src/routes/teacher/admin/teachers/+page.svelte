<script lang="ts">
	import { enhance } from '$app/forms';
	import TIcon from '$lib/components/teacher/TIcon.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let showForm = $state(false);
	let showPw = $state(false);

	function formatDate(d: Date | string) {
		return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
	}
</script>

<svelte:head><title>Anemo – Lehrerverwaltung</title></svelte:head>

{#snippet actions(t: (typeof data.teachers)[number])}
	{#if t.id !== data.currentTeacherId}
		<form method="POST" action="?/toggleAdmin" use:enhance>
			<input type="hidden" name="teacherId" value={t.id} />
			<button type="submit" class="btn btn-outline btn-sm" title={t.isAdmin ? 'Admin-Rechte entziehen' : 'Admin-Rechte vergeben'}>
				{t.isAdmin ? 'Zur Lehrkraft' : 'Zum Admin'}
			</button>
		</form>
		<form method="POST" action="?/delete" use:enhance
			onsubmit={(e) => { if (!confirm(`${t.name ?? t.email} wirklich löschen?`)) e.preventDefault(); }}>
			<input type="hidden" name="teacherId" value={t.id} />
			<button type="submit" class="icon-btn danger" aria-label="{t.name ?? t.email} löschen" title="Löschen"><TIcon name="trash" size={18} /></button>
		</form>
	{:else}
		<span class="badge badge-blue">Du</span>
	{/if}
{/snippet}

<div class="page">
	<div class="page-header">
		<div>
			<h1 class="page-title">Lehrerverwaltung</h1>
			<span class="page-sub">{data.teachers.length} Lehrkräfte · {data.teachers.filter((t) => t.isAdmin).length} Admins</span>
		</div>
		<button class="btn btn-primary" onclick={() => (showForm = !showForm)} aria-expanded={showForm}>
			<TIcon name={showForm ? 'close' : 'plus'} size={18} />
			{showForm ? 'Abbrechen' : 'Lehrkraft anlegen'}
		</button>
	</div>

	{#if form?.createSuccess}
		<div class="alert alert-success" role="status">Lehrkraft wurde erfolgreich angelegt.</div>
	{/if}
	{#if form?.deleteSuccess}
		<div class="alert alert-success" role="status">Lehrkraft wurde gelöscht.</div>
	{/if}
	{#if form?.deleteError}
		<div class="alert alert-error" role="alert">{form.deleteError}</div>
	{/if}

	{#if showForm}
		<div class="card">
			<h2>Neue Lehrkraft anlegen</h2>
			<form method="POST" action="?/create" class="create-form" use:enhance={() => {
				return ({ result, update }) => {
					if (result.type === 'success') showForm = false;
					update();
				};
			}}>
				<div class="grid-2 fields">
					<div class="field">
						<label for="name">Name</label>
						<input id="name" name="name" type="text" required placeholder="Max Mustermann" value={form?.createName ?? ''} class:input-error={form?.createErrors?.name} />
						{#if form?.createErrors?.name}<span class="field-error">{form.createErrors.name}</span>{/if}
					</div>
					<div class="field">
						<label for="create-email">E-Mail</label>
						<input id="create-email" name="email" type="email" required placeholder="lehrer@schule.de" value={form?.createEmail ?? ''} class:input-error={form?.createErrors?.email} />
						{#if form?.createErrors?.email}<span class="field-error">{form.createErrors.email}</span>{/if}
					</div>
				</div>

				<div class="field pw-field">
					<label for="create-password">Temporäres Passwort</label>
					<div class="pw-wrap">
						<input id="create-password" name="password" type={showPw ? 'text' : 'password'} required placeholder="Mindestens 8 Zeichen" autocomplete="new-password" class:input-error={form?.createErrors?.password} />
						<button type="button" class="pw-toggle" onclick={() => (showPw = !showPw)} aria-pressed={showPw}>{showPw ? 'Verbergen' : 'Zeigen'}</button>
					</div>
					{#if form?.createErrors?.password}<span class="field-error">{form.createErrors.password}</span>{/if}
				</div>

				<label class="checkbox-label">
					<input type="checkbox" name="isAdmin" />
					Administrator-Rechte vergeben
				</label>

				<div class="form-actions">
					<button type="submit" class="btn btn-primary">Anlegen</button>
					<button type="button" class="btn btn-outline" onclick={() => (showForm = false)}>Abbrechen</button>
				</div>
			</form>
		</div>
	{/if}

	<section class="card">
		<div class="table-wrap desktop-only">
			<table class="t-table">
				<thead>
					<tr><th>Name</th><th>E-Mail</th><th>Rolle</th><th>Seit</th><th><span class="sr-only">Aktionen</span></th></tr>
				</thead>
				<tbody>
					{#each data.teachers as t}
						<tr>
							<td class="td-name">{t.name ?? '–'}</td>
							<td class="td-email">{t.email}</td>
							<td><span class="badge" class:badge-gold={t.isAdmin} class:badge-blue={!t.isAdmin}>{t.isAdmin ? 'Admin' : 'Lehrkraft'}</span></td>
							<td class="td-date">{formatDate(t.createdAt)}</td>
							<td><div class="actions">{@render actions(t)}</div></td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		<ul class="m-list">
			{#each data.teachers as t}
				<li class="m-row teacher-row">
					<span class="m-main">
						<span class="m-title">{t.name ?? t.email}</span>
						<span class="m-meta"><span>{t.email}</span><span>seit {formatDate(t.createdAt)}</span></span>
						<span class="m-badges"><span class="badge" class:badge-gold={t.isAdmin} class:badge-blue={!t.isAdmin}>{t.isAdmin ? 'Admin' : 'Lehrkraft'}</span></span>
					</span>
					<div class="actions">{@render actions(t)}</div>
				</li>
			{/each}
		</ul>
	</section>
</div>

<style>
	.card h2 { margin-bottom: 1rem; }
	.create-form { display: flex; flex-direction: column; gap: 1rem; }
	.pw-field { max-width: 24rem; }
	.pw-wrap { position: relative; }
	.pw-wrap input { padding-right: 6rem; }
	.pw-toggle {
		position: absolute; right: 0.35rem; top: 50%; transform: translateY(-50%);
		min-height: 2.25rem; padding: 0 0.75rem; border: 0; border-radius: 10px;
		background: var(--c-track); color: var(--c-navy-2); font: 800 0.85rem var(--font); cursor: pointer;
	}
	.input-error { border-color: #dc2626 !important; }
	.field-error { font-size: 0.8rem; font-weight: 800; color: #b91c1c; }
	.checkbox-label { display: flex; align-items: center; gap: 0.6rem; font-weight: 800; cursor: pointer; min-height: 2.25rem; }
	.td-name { font-weight: 900 !important; }
	.td-email { color: var(--c-ink-2) !important; }
	.td-date { white-space: nowrap; color: var(--c-ink-2) !important; }
	.actions { display: flex; align-items: center; justify-content: flex-end; gap: 0.35rem; }
	.actions form { display: flex; }
	.teacher-row { align-items: flex-start; }
	.m-badges { margin-top: 0.2rem; }
	@media (max-width: 899px) {
		.pw-field { max-width: none; }
		.teacher-row .actions { flex-direction: column; align-items: flex-end; }
	}
</style>
