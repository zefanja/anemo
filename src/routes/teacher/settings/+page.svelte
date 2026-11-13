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

	<div class="grid-2 settings-grid">
		<!-- Account info -->
		<div class="card">
			<h2>Konto</h2>
			<div class="account">
				<span class="big-avatar" aria-hidden="true">{(data.teacherEmail ?? '').replace(/[^a-zA-Z]/g, '').slice(0, 2).toUpperCase()}</span>
				<div class="info-row">
				<span class="info-label">E-Mail</span>
					<span class="info-value">{data.teacherEmail}</span>
				</div>
			</div>
			<a href="/logout" class="btn btn-outline logout">Abmelden</a>
		</div>

		<!-- Change password -->
		<div class="card">
			<h2>Passwort ändern</h2>

			{#if form?.pwSuccess}
				<div class="alert alert-success" role="status">Passwort erfolgreich geändert.</div>
			{/if}
			{#if form?.pwError}
				<div class="alert alert-error" role="alert">{form.pwError}</div>
			{/if}

			<form method="POST" action="?/changePassword" use:enhance class="pw-form">
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
						<button type="button" class="pw-toggle" onclick={() => (showCurrent = !showCurrent)} aria-pressed={showCurrent}>
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
						<button type="button" class="pw-toggle" onclick={() => (showNew = !showNew)} aria-pressed={showNew}>
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
						<button type="button" class="pw-toggle" onclick={() => (showConfirm = !showConfirm)} aria-pressed={showConfirm}>
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
	.settings-grid { align-items: start; }
	.card h2 { margin-bottom: 1rem; }
	.account { display: flex; align-items: center; gap: 0.875rem; }
	.big-avatar {
		width: 3.25rem; height: 3.25rem; flex: none; border-radius: 50%;
		background: var(--c-sky); color: var(--c-navy);
		display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 1.1rem;
	}
	.info-row { display: flex; flex-direction: column; min-width: 0; }
	.info-label { font-size: 0.8rem; font-weight: 800; color: var(--c-ink-2); }
	.info-value { font-weight: 800; overflow-wrap: anywhere; }
	.logout { margin-top: 1.25rem; }
	.alert { margin-bottom: 1rem; }
	.pw-form { display: flex; flex-direction: column; gap: 1rem; align-items: stretch; }
	.pw-form .btn { align-self: flex-start; }
	.pw-wrap { position: relative; }
	.pw-wrap input { padding-right: 6rem; }
	.pw-toggle {
		position: absolute; right: 0.35rem; top: 50%; transform: translateY(-50%);
		min-height: 2.25rem; padding: 0 0.75rem; border: 0; border-radius: 10px;
		background: var(--c-track); color: var(--c-navy-2); font: 800 0.85rem var(--font); cursor: pointer;
	}
	.pw-toggle:hover { background: var(--c-primary-light); color: var(--c-primary-dark); }
	@media (max-width: 899px) { .pw-form .btn { align-self: stretch; } }
</style>
