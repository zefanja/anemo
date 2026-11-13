<script lang="ts">
	import { enhance } from '$app/forms';
	import AuthShell from '$lib/components/teacher/AuthShell.svelte';
	import type { ActionData } from './$types';
	let { form }: { form: ActionData } = $props();
</script>

<svelte:head><title>Anemo – Passwort zurücksetzen</title></svelte:head>

<AuthShell title="Passwort zurücksetzen" subtitle={form?.sent ? undefined : 'Gib deine E-Mail-Adresse ein. Wir erzeugen einen Link zum Zurücksetzen.'}>
	{#if form?.sent}
		<div class="alert alert-success" role="status">
			Falls die E-Mail-Adresse bekannt ist, wurde ein Reset-Link in der Server-Konsole ausgegeben.
		</div>
		<a href="/teacher/login" class="btn btn-outline btn-full">Zurück zum Login</a>
	{:else}
		{#if form?.error}
			<div class="alert alert-error" role="alert">{form.error}</div>
		{/if}
		<form method="POST" use:enhance class="auth-form">
			<div class="field">
				<label for="email">E-Mail-Adresse</label>
				<input id="email" name="email" type="email" autocomplete="email" required placeholder="name@schule.de" />
			</div>
			<button type="submit" class="btn btn-primary btn-full big">Link anfordern</button>
		</form>
		<a href="/teacher/login" class="back-link">← Zurück zum Login</a>
	{/if}
</AuthShell>

<style>
	.auth-form { display: flex; flex-direction: column; gap: 1rem; }
	.big { min-height: 3.25rem; font-size: 1.05rem; }
	.back-link { align-self: center; font-size: 0.9rem; font-weight: 800; color: var(--c-primary); text-decoration: none; min-height: 2rem; display: inline-flex; align-items: center; }
	.back-link:hover { text-decoration: underline; }
</style>
