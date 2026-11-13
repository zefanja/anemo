<script lang="ts">
	import { enhance } from '$app/forms';
	import TIcon from '$lib/components/teacher/TIcon.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let showForm = $state(false);
	let newName = $state('');
	let confirmDelete = $state<string | null>(null);
</script>

<svelte:head><title>Anemo – Klassen</title></svelte:head>

<div class="page">
	<div class="page-header">
		<div>
			<h1 class="page-title">Klassen</h1>
			<span class="page-sub">{data.classes.length} {data.classes.length === 1 ? 'Klasse' : 'Klassen'} · {data.classes.reduce((n, c) => n + c.studentCount, 0)} Schüler:innen</span>
		</div>
		<button class="btn btn-primary" onclick={() => (showForm = !showForm)} aria-expanded={showForm}>
			<TIcon name={showForm ? 'close' : 'plus'} size={18} />
			{showForm ? 'Abbrechen' : 'Neue Klasse'}
		</button>
	</div>

	{#if form?.error}
		<div class="alert alert-error" role="alert">{form.error}</div>
	{/if}
	{#if form?.success && form.created}
		<div class="alert alert-success" role="status">Klasse „{form.created}" wurde angelegt.</div>
	{/if}
	{#if form?.success && form.deleted}
		<div class="alert alert-success" role="status">Klasse „{form.deleted}" wurde gelöscht.</div>
	{/if}

	{#if showForm}
		<div class="card">
			<h2>Neue Klasse</h2>
			<form
				method="POST"
				action="?/createClass"
				class="form-row new-form"
				use:enhance={() => {
					return ({ update }) => {
						update();
						showForm = false;
						newName = '';
					};
				}}
			>
				<div class="field">
					<label for="name">Klassenname</label>
					<input id="name" name="name" type="text" bind:value={newName} placeholder="z. B. 5a" required />
				</div>
				<button type="submit" class="btn btn-primary">Anlegen</button>
			</form>
		</div>
	{/if}

	{#if data.classes.length === 0}
		<div class="card empty-state">
			<span class="empty-icon"><TIcon name="users" size={32} /></span>
			<p>Noch keine Klassen vorhanden.</p>
			<button class="btn btn-primary" onclick={() => (showForm = true)}>Erste Klasse anlegen</button>
		</div>
	{:else}
		<div class="class-grid">
			{#each data.classes as cls}
				<div class="class-card">
					<a href="/teacher/classes/{cls.id}" class="class-link">
						<span class="class-mark">{cls.name}</span>
						<span class="class-text">
							<span class="class-card-name">Klasse {cls.name}</span>
							<span class="class-card-meta">{cls.studentCount} Schüler:innen</span>
						</span>
						<span class="m-chev" aria-hidden="true">›</span>
					</a>
					<div class="class-card-actions">
						{#if confirmDelete === cls.id}
							<form method="POST" action="?/deleteClass" use:enhance>
								<input type="hidden" name="classId" value={cls.id} />
								<button type="submit" class="btn btn-danger btn-sm">Löschen bestätigen</button>
							</form>
							<button class="btn btn-outline btn-sm" onclick={() => (confirmDelete = null)}>Abbrechen</button>
						{:else}
							<a href="/teacher/classes/{cls.id}" class="btn btn-outline btn-sm">Verwalten</a>
							<button
								class="btn btn-ghost btn-sm del"
								onclick={() => (confirmDelete = cls.id)}
								disabled={cls.studentCount > 0}
								title={cls.studentCount > 0 ? 'Erst alle Schüler entfernen' : 'Klasse löschen'}
							>
								<TIcon name="trash" size={16} />Löschen
							</button>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.card h2 { margin-bottom: 0.75rem; }
	.new-form .field { max-width: 22rem; }

	.empty-state { display: flex; flex-direction: column; align-items: center; gap: 0.75rem; text-align: center; padding: 2.5rem 1rem; }
	.empty-state p { font-weight: 800; color: var(--c-ink-2); }
	.empty-icon {
		width: 4rem; height: 4rem; border-radius: 50%; background: var(--c-primary-light); color: var(--c-primary-dark);
		display: flex; align-items: center; justify-content: center;
	}

	.class-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(17rem, 1fr)); gap: 1rem; }
	.class-card {
		background: #fff; border-radius: var(--t-card-radius); box-shadow: var(--shadow-sm);
		display: flex; flex-direction: column; overflow: hidden;
	}
	.class-link { display: flex; align-items: center; gap: 0.875rem; padding: 1rem 1.1rem; text-decoration: none; color: var(--c-navy); }
	.class-link:hover { background: #f8fbfe; }
	.class-mark {
		min-width: 3rem; height: 3rem; padding: 0 0.5rem; flex: none; border-radius: 14px;
		background: var(--c-primary-light); color: var(--c-primary-dark);
		display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 1.05rem;
	}
	.class-text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
	.class-card-name { font-weight: 900; font-size: 1.05rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.class-card-meta { font-size: 0.85rem; font-weight: 800; color: var(--c-ink-2); }
	.class-card-actions {
		display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;
		padding: 0.6rem 1.1rem; border-top: 1px solid var(--c-track);
	}
	.del { margin-left: auto; color: #b91c1c; }
	.del:hover:not(:disabled) { background: var(--c-error-light); }
	.del:disabled { color: var(--c-ink-2); }
	@media (max-width: 899px) { .class-grid { grid-template-columns: minmax(0, 1fr); gap: 0.75rem; } }
</style>
