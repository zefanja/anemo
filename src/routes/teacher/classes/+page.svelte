<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let showForm = $state(false);
	let newName = $state('');
	let confirmDelete = $state<string | null>(null);
</script>

<svelte:head><title>Anemo – Klassen</title></svelte:head>

<div class="page">
	<div class="page-header">
		<h1 class="page-title">Klassen</h1>
		<button class="btn btn-primary" onclick={() => (showForm = !showForm)}>
			{showForm ? 'Abbrechen' : '+ Neue Klasse'}
		</button>
	</div>

	{#if form?.error}
		<div class="alert alert-error">{form.error}</div>
	{/if}
	{#if form?.success && form.created}
		<div class="alert alert-success">Klasse „{form.created}" wurde angelegt.</div>
	{/if}
	{#if form?.success && form.deleted}
		<div class="alert alert-success">Klasse „{form.deleted}" wurde gelöscht.</div>
	{/if}

	{#if showForm}
		<div class="card form-card">
			<h2>Neue Klasse</h2>
			<form method="POST" action="?/createClass" use:enhance={() => {
				return ({ update }) => {
					update();
					showForm = false;
					newName = '';
				};
			}}>
				<div class="field">
					<label for="name">Klassenname</label>
					<input id="name" name="name" type="text" bind:value={newName} placeholder="z.B. 5a" required />
				</div>
				<div class="form-actions">
					<button type="submit" class="btn btn-primary">Anlegen</button>
					<button type="button" class="btn btn-outline" onclick={() => (showForm = false)}>Abbrechen</button>
				</div>
			</form>
		</div>
	{/if}

	{#if data.classes.length === 0}
		<div class="empty-state">
			<div class="empty-icon">📚</div>
			<p>Noch keine Klassen vorhanden.</p>
			<button class="btn btn-primary" onclick={() => (showForm = true)}>Erste Klasse anlegen</button>
		</div>
	{:else}
		<div class="class-grid">
			{#each data.classes as cls}
				<div class="class-card">
					<div class="class-card-main">
						<a href="/teacher/classes/{cls.id}" class="class-link">
							<div class="class-card-name">{cls.name}</div>
							<div class="class-card-meta">{cls.studentCount} Schüler</div>
						</a>
					</div>
					<div class="class-card-actions">
						<a href="/teacher/classes/{cls.id}" class="btn btn-outline btn-sm">Verwalten</a>
						{#if confirmDelete === cls.id}
							<form method="POST" action="?/deleteClass" use:enhance>
								<input type="hidden" name="classId" value={cls.id} />
								<button type="submit" class="btn btn-danger btn-sm">Löschen bestätigen</button>
							</form>
							<button class="btn btn-outline btn-sm" onclick={() => (confirmDelete = null)}>
								Abbrechen
							</button>
						{:else}
							<button
								class="btn btn-ghost btn-sm"
								onclick={() => (confirmDelete = cls.id)}
								disabled={cls.studentCount > 0}
								title={cls.studentCount > 0 ? 'Erst alle Schüler entfernen' : 'Klasse löschen'}
							>
								Löschen
							</button>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.page { display: flex; flex-direction: column; gap: 1.25rem; }
	.page-header { display: flex; justify-content: space-between; align-items: center; }
	.page-title { font-size: 1.5rem; font-weight: 700; margin: 0; }

	.alert {
		padding: 0.75rem 1rem;
		border-radius: 0.5rem;
		font-size: 0.875rem;
		font-weight: 500;
	}
	.alert-error { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }
	.alert-success { background: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0; }

	.card { background: #fff; border-radius: 0.75rem; padding: 1.25rem; box-shadow: 0 1px 4px rgba(0,0,0,.07); }
	.form-card h2 { font-size: 1rem; font-weight: 700; margin: 0 0 1rem; }

	.field { display: flex; flex-direction: column; gap: 0.375rem; margin-bottom: 1rem; }
	label { font-size: 0.875rem; font-weight: 600; color: #374151; }
	input[type='text'] {
		padding: 0.625rem 0.875rem;
		border: 1.5px solid #d1d5db;
		border-radius: 0.5rem;
		font-size: 0.95rem;
		width: 100%;
		outline: none;
		transition: border-color .15s;
	}
	input[type='text']:focus { border-color: #16a34a; }

	.form-actions { display: flex; gap: 0.5rem; }

	.empty-state {
		text-align: center;
		padding: 3rem 1rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.75rem;
		color: #6b7280;
	}
	.empty-icon { font-size: 2.5rem; }

	.class-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
		gap: 0.875rem;
	}
	.class-card {
		background: #fff;
		border-radius: 0.75rem;
		padding: 1rem 1.25rem;
		box-shadow: 0 1px 4px rgba(0,0,0,.07);
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}
	.class-link { text-decoration: none; color: inherit; }
	.class-card-name { font-size: 1.1rem; font-weight: 700; }
	.class-card-meta { font-size: 0.8rem; color: #6b7280; margin-top: 0.2rem; }
	.class-card-actions { display: flex; gap: 0.4rem; flex-wrap: wrap; }

	.btn-sm { padding: 0.35rem 0.7rem; font-size: 0.8rem; }
	.btn-danger { background: #dc2626; color: #fff; border: none; border-radius: 0.375rem; }
	.btn-danger:hover { background: #b91c1c; }
	.btn-ghost {
		background: none; border: none; color: #9ca3af;
		font-size: 0.8rem; padding: 0.35rem 0.5rem; border-radius: 0.375rem;
	}
	.btn-ghost:hover:not(:disabled) { color: #dc2626; background: #fef2f2; }
	.btn-ghost:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
