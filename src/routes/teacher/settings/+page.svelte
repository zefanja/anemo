<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let showCurrent = $state(false);
	let showNew = $state(false);
	let showConfirm = $state(false);
</script>

<svelte:head><title>Anemo – Einstellungen</title></svelte:head>

<div class="page">
	<h1 class="page-title">Einstellungen</h1>

	<div class="two-col">
		<!-- Account info -->
		<div class="card">
			<h2>Konto</h2>
			<div class="info-row">
				<span class="info-label">E-Mail</span>
				<span class="info-value">{data.teacherEmail}</span>
			</div>
		</div>

		<!-- Change password -->
		<div class="card">
			<h2>Passwort ändern</h2>

			{#if form?.pwSuccess}
				<div class="alert alert-success">✅ Passwort erfolgreich geändert.</div>
			{/if}
			{#if form?.pwError}
				<div class="alert alert-error">{form.pwError}</div>
			{/if}

			<form method="POST" action="?/changePassword" use:enhance>
				<div class="field">
					<label for="current">Aktuelles Passwort</label>
					<div class="pw-wrap">
						<input
							id="current"
							name="current"
							type={showCurrent ? 'text' : 'password'}
							required
							autocomplete="current-password"
						/>
						<button type="button" class="pw-toggle" onclick={() => (showCurrent = !showCurrent)}>
							{showCurrent ? 'Verbergen' : 'Zeigen'}
						</button>
					</div>
				</div>
				<div class="field">
					<label for="new">Neues Passwort</label>
					<div class="pw-wrap">
						<input
							id="new"
							name="new"
							type={showNew ? 'text' : 'password'}
							required
							minlength="8"
							autocomplete="new-password"
						/>
						<button type="button" class="pw-toggle" onclick={() => (showNew = !showNew)}>
							{showNew ? 'Verbergen' : 'Zeigen'}
						</button>
					</div>
				</div>
				<div class="field">
					<label for="confirm">Neues Passwort bestätigen</label>
					<div class="pw-wrap">
						<input
							id="confirm"
							name="confirm"
							type={showConfirm ? 'text' : 'password'}
							required
							minlength="8"
							autocomplete="new-password"
						/>
						<button type="button" class="pw-toggle" onclick={() => (showConfirm = !showConfirm)}>
							{showConfirm ? 'Verbergen' : 'Zeigen'}
						</button>
					</div>
				</div>
				<button type="submit" class="btn btn-primary">Passwort ändern</button>
			</form>
		</div>
	</div>
</div>

<style>
	.page { display: flex; flex-direction: column; gap: 1.25rem; }
	.page-title { font-size: 1.5rem; font-weight: 700; margin: 0; }
	.two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 1.25rem; align-items: start; }
	@media (max-width: 700px) { .two-col { grid-template-columns: 1fr; } }

	.card { background: #fff; border-radius: 0.75rem; padding: 1.25rem; box-shadow: 0 1px 4px rgba(0,0,0,.07); }
	.card h2 { font-size: 1rem; font-weight: 700; margin: 0 0 1rem; }

	.info-row { display: flex; gap: 0.75rem; align-items: center; }
	.info-label { font-size: 0.8rem; color: #6b7280; font-weight: 600; min-width: 60px; }
	.info-value { font-size: 0.9rem; color: #111827; }

	.alert { padding: 0.65rem 0.875rem; border-radius: 0.5rem; font-size: 0.875rem; margin-bottom: 0.875rem; }
	.alert-error { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }
	.alert-success { background: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0; }

	.field { display: flex; flex-direction: column; gap: 0.35rem; margin-bottom: 0.875rem; }
	label { font-size: 0.825rem; font-weight: 600; color: #374151; }
	.pw-wrap { position: relative; }
	.pw-wrap input {
		width: 100%;
		padding: 0.6rem 4rem 0.6rem 0.75rem;
		border: 1.5px solid #d1d5db;
		border-radius: 0.5rem;
		font-size: 0.9rem;
		outline: none;
		transition: border-color .15s;
	}
	.pw-wrap input:focus { border-color: #16a34a; }
	.pw-toggle {
		position: absolute;
		right: 0.6rem;
		top: 50%;
		transform: translateY(-50%);
		background: none;
		border: none;
		color: #6b7280;
		font-size: 0.75rem;
		cursor: pointer;
	}
</style>
