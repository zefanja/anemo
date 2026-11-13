<script lang="ts">
	import { enhance } from '$app/forms';
	import AuthShell from '$lib/components/teacher/AuthShell.svelte';
	import type { ActionData } from './$types';
	let { form }: { form: ActionData } = $props();
	let showPw = $state(false);
</script>

<svelte:head><title>Anemo – Neues Passwort</title></svelte:head>

<AuthShell title="Neues Passwort" subtitle="Mindestens 8 Zeichen.">
	{#if form?.error}
		<div class="alert alert-error" role="alert">{form.error}</div>
	{/if}
	<form method="POST" use:enhance class="auth-form">
		<div class="field">
			<label for="password">Neues Passwort</label>
			<input id="password" name="password" type={showPw ? 'text' : 'password'} autocomplete="new-password" required minlength="8" />
		</div>
		<div class="field">
			<label for="confirm">Passwort wiederholen</label>
			<input id="confirm" name="confirm" type={showPw ? 'text' : 'password'} autocomplete="new-password" required />
		</div>
		<label class="show-pw">
			<input type="checkbox" bind:checked={showPw} /> Passwort anzeigen
		</label>
		<button type="submit" class="btn btn-primary btn-full big">Passwort speichern</button>
	</form>
</AuthShell>

<style>
	.auth-form { display: flex; flex-direction: column; gap: 1rem; }
	.show-pw { display: flex; align-items: center; gap: 0.6rem; font-weight: 800; font-size: 0.9rem; color: var(--c-navy); cursor: pointer; min-height: 2.25rem; }
	.big { min-height: 3.25rem; font-size: 1.05rem; }
</style>
