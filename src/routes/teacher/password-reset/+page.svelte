<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData } from './$types';
	let { form }: { form: ActionData } = $props();
</script>

<svelte:head><title>Anemo – Passwort zurücksetzen</title></svelte:head>

<div class="wrap">
	<div class="card">
		<h1>Passwort zurücksetzen</h1>

		{#if form?.sent}
			<div class="success">
				Falls die E-Mail-Adresse bekannt ist, wurde ein Reset-Link in der Server-Konsole ausgegeben.
			</div>
			<a href="/teacher/login" class="btn-back">Zurück zum Login</a>
		{:else}
			{#if form?.error}
				<div class="error">{form.error}</div>
			{/if}
			<form method="POST" use:enhance>
				<label for="email">E-Mail-Adresse</label>
				<input id="email" name="email" type="email" required placeholder="name@schule.de" />
				<button type="submit" class="btn">Link anfordern</button>
			</form>
			<a href="/teacher/login" class="back-link">← Zurück</a>
		{/if}
	</div>
</div>

<style>
	.wrap { min-height: 100dvh; display: flex; align-items: center; justify-content: center; padding: 1rem; background: #f9fafb; }
	.card { background: white; border-radius: 1rem; padding: 2rem 1.5rem; width: 100%; max-width: 380px; box-shadow: 0 2px 16px rgba(0,0,0,0.07); }
	h1 { font-size: 1.25rem; font-weight: 700; margin: 0 0 1.25rem; }
	label { display: block; font-size: 0.875rem; font-weight: 600; margin-bottom: 0.375rem; }
	input { width: 100%; padding: 0.75rem; border: 1.5px solid #d1d5db; border-radius: 0.5rem; font-size: 1rem; box-sizing: border-box; margin-bottom: 1rem; }
	input:focus { outline: none; border-color: #0b6bcb; }
	.btn { width: 100%; padding: 0.875rem; background: #0b6bcb; color: white; border: none; border-radius: 0.75rem; font-size: 1rem; font-weight: 600; cursor: pointer; }
	.btn:hover { background: #0a4f99; }
	.error { background: #fef2f2; border: 1px solid #fecaca; color: #dc2626; border-radius: 0.5rem; padding: 0.75rem; font-size: 0.875rem; margin-bottom: 1rem; }
	.success { background: #f0fdf4; border: 1px solid #bbf7d0; color: #16a34a; border-radius: 0.5rem; padding: 0.75rem 1rem; font-size: 0.875rem; margin-bottom: 1rem; }
	.btn-back { display: block; text-align: center; padding: 0.875rem; background: #f3f4f6; border-radius: 0.75rem; text-decoration: none; color: #374151; font-weight: 600; }
	.back-link { display: block; text-align: center; margin-top: 1rem; font-size: 0.875rem; color: #6b7280; text-decoration: none; }
</style>
