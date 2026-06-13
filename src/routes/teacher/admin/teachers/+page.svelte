<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let showForm = $state(false);
	let showPw = $state(false);

	function formatDate(d: Date | string) {
		return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
	}
</script>

<svelte:head><title>Anemo – Lehrerverwaltung</title></svelte:head>

<div class="page">
	<div class="page-header">
		<h1>Lehrerverwaltung</h1>
		<button class="btn-primary" onclick={() => (showForm = !showForm)}>
			{showForm ? 'Abbrechen' : '+ Lehrkraft anlegen'}
		</button>
	</div>

	{#if form?.createSuccess}
		<div class="alert alert-success">Lehrkraft wurde erfolgreich angelegt.</div>
	{/if}
	{#if form?.deleteSuccess}
		<div class="alert alert-success">Lehrkraft wurde gelöscht.</div>
	{/if}
	{#if form?.deleteError}
		<div class="alert alert-error">{form.deleteError}</div>
	{/if}

	{#if showForm}
		<div class="form-card">
			<h2>Neue Lehrkraft anlegen</h2>
			<form method="POST" action="?/create" use:enhance={() => {
				return ({ result, update }) => {
					if (result.type === 'success') showForm = false;
					update();
				};
			}}>
				<div class="field-row">
					<div class="field">
						<label for="name">Name</label>
						<input
							id="name"
							name="name"
							type="text"
							required
							placeholder="Max Mustermann"
							value={form?.createName ?? ''}
							class:input-error={form?.createErrors?.name}
						/>
						{#if form?.createErrors?.name}
							<span class="field-error">{form.createErrors.name}</span>
						{/if}
					</div>
					<div class="field">
						<label for="create-email">E-Mail</label>
						<input
							id="create-email"
							name="email"
							type="email"
							required
							placeholder="lehrer@schule.de"
							value={form?.createEmail ?? ''}
							class:input-error={form?.createErrors?.email}
						/>
						{#if form?.createErrors?.email}
							<span class="field-error">{form.createErrors.email}</span>
						{/if}
					</div>
				</div>

				<div class="field">
					<label for="create-password">Temporäres Passwort</label>
					<div class="pw-wrap">
						<input
							id="create-password"
							name="password"
							type={showPw ? 'text' : 'password'}
							required
							placeholder="Mindestens 8 Zeichen"
							class:input-error={form?.createErrors?.password}
						/>
						<button type="button" class="pw-toggle" onclick={() => (showPw = !showPw)}>
							{showPw ? 'Verbergen' : 'Zeigen'}
						</button>
					</div>
					{#if form?.createErrors?.password}
						<span class="field-error">{form.createErrors.password}</span>
					{/if}
				</div>

				<label class="checkbox-label">
					<input type="checkbox" name="isAdmin" />
					Administrator-Rechte vergeben
				</label>

				<div class="form-actions">
					<button type="button" class="btn-secondary" onclick={() => (showForm = false)}>
						Abbrechen
					</button>
					<button type="submit" class="btn-primary">Anlegen</button>
				</div>
			</form>
		</div>
	{/if}

	<div class="table-card">
		<table>
			<thead>
				<tr>
					<th>Name</th>
					<th>E-Mail</th>
					<th>Rolle</th>
					<th>Seit</th>
					<th>Aktionen</th>
				</tr>
			</thead>
			<tbody>
				{#each data.teachers as t}
					<tr class:self={t.id === data.currentTeacherId}>
						<td class="td-name">{t.name ?? '–'}</td>
						<td class="td-email">{t.email}</td>
						<td>
							<span class="badge" class:badge-admin={t.isAdmin} class:badge-teacher={!t.isAdmin}>
								{t.isAdmin ? 'Admin' : 'Lehrkraft'}
							</span>
						</td>
						<td class="td-date">{formatDate(t.createdAt)}</td>
						<td class="td-actions">
							{#if t.id !== data.currentTeacherId}
								<form method="POST" action="?/toggleAdmin" use:enhance style="display:inline">
									<input type="hidden" name="teacherId" value={t.id} />
									<button type="submit" class="btn-action" title={t.isAdmin ? 'Admin-Rechte entziehen' : 'Admin-Rechte vergeben'}>
										{t.isAdmin ? '↓ Lehrkraft' : '↑ Admin'}
									</button>
								</form>
								<form method="POST" action="?/delete" use:enhance style="display:inline"
									onsubmit={(e) => { if (!confirm(`${t.name ?? t.email} wirklich löschen?`)) e.preventDefault(); }}>
									<input type="hidden" name="teacherId" value={t.id} />
									<button type="submit" class="btn-action btn-danger">Löschen</button>
								</form>
							{:else}
								<span class="self-label">Du</span>
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>

<style>
	.page { display: flex; flex-direction: column; gap: 1.5rem; }

	.page-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	h1 { font-size: 1.5rem; font-weight: 700; margin: 0; }

	.alert {
		padding: 0.75rem 1rem;
		border-radius: 0.625rem;
		font-size: 0.875rem;
	}
	.alert-success { background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; }
	.alert-error { background: #fef2f2; border: 1px solid #fecaca; color: #dc2626; }

	.form-card {
		background: white;
		border-radius: 0.75rem;
		padding: 1.25rem;
		box-shadow: 0 1px 4px rgba(0,0,0,.07);
	}
	h2 { font-size: 1rem; font-weight: 700; margin: 0 0 1rem; }

	.field-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
	}
	@media (max-width: 600px) { .field-row { grid-template-columns: 1fr; } }

	.field { display: flex; flex-direction: column; gap: 0.375rem; margin-bottom: 0.875rem; }
	label { font-size: 0.875rem; font-weight: 600; color: #374151; }

	input[type='text'],
	input[type='email'],
	input[type='password'] {
		padding: 0.625rem 0.875rem;
		border: 1.5px solid #d1d5db;
		border-radius: 0.5rem;
		font-size: 0.9rem;
		color: #111827;
		width: 100%;
		box-sizing: border-box;
	}
	input:focus { outline: none; border-color: #16a34a; }
	input.input-error { border-color: #dc2626; }
	.field-error { font-size: 0.8rem; color: #dc2626; }

	.pw-wrap { position: relative; }
	.pw-wrap input { padding-right: 5rem; }
	.pw-toggle {
		position: absolute; right: 0.75rem; top: 50%; transform: translateY(-50%);
		background: none; border: none; color: #6b7280; font-size: 0.8rem; cursor: pointer;
	}

	.checkbox-label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.875rem;
		font-weight: 500;
		color: #374151;
		margin-bottom: 1rem;
		cursor: pointer;
	}
	.checkbox-label input[type='checkbox'] { width: auto; }

	.form-actions { display: flex; gap: 0.75rem; justify-content: flex-end; }

	.btn-primary {
		padding: 0.625rem 1.25rem;
		background: #16a34a;
		color: white;
		border: none;
		border-radius: 0.5rem;
		font-size: 0.9rem;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.15s;
	}
	.btn-primary:hover { background: #15803d; }
	.btn-secondary {
		padding: 0.625rem 1.25rem;
		background: #f3f4f6;
		color: #374151;
		border: none;
		border-radius: 0.5rem;
		font-size: 0.9rem;
		font-weight: 600;
		cursor: pointer;
	}
	.btn-secondary:hover { background: #e5e7eb; }

	.table-card {
		background: white;
		border-radius: 0.75rem;
		box-shadow: 0 1px 4px rgba(0,0,0,.07);
		overflow: hidden;
	}
	table { width: 100%; border-collapse: collapse; }
	thead { background: #f9fafb; }
	th {
		text-align: left;
		padding: 0.75rem 1rem;
		font-size: 0.75rem;
		font-weight: 700;
		color: #6b7280;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		border-bottom: 1px solid #e5e7eb;
	}
	td {
		padding: 0.875rem 1rem;
		font-size: 0.875rem;
		color: #374151;
		border-bottom: 1px solid #f3f4f6;
		vertical-align: middle;
	}
	tr:last-child td { border-bottom: none; }
	tr.self { background: #f0fdf4; }

	.td-name { font-weight: 600; }
	.td-email { color: #6b7280; }
	.td-date { color: #9ca3af; white-space: nowrap; }

	.badge {
		display: inline-block;
		padding: 0.2rem 0.5rem;
		border-radius: 0.375rem;
		font-size: 0.75rem;
		font-weight: 600;
	}
	.badge-admin { background: #fef3c7; color: #92400e; }
	.badge-teacher { background: #eff6ff; color: #1e40af; }

	.td-actions { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
	.btn-action {
		padding: 0.3rem 0.625rem;
		background: #f3f4f6;
		color: #374151;
		border: 1px solid #e5e7eb;
		border-radius: 0.375rem;
		font-size: 0.75rem;
		font-weight: 600;
		cursor: pointer;
		white-space: nowrap;
	}
	.btn-action:hover { background: #e5e7eb; }
	.btn-danger { color: #dc2626; border-color: #fecaca; background: #fef2f2; }
	.btn-danger:hover { background: #fee2e2; }
	.self-label { font-size: 0.75rem; color: #9ca3af; }
</style>
