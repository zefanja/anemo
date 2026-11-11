<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData } from './$types';
	let { form }: { form: ActionData } = $props();
	let showPw = $state(false);
</script>

<svelte:head><title>Anemo – Neues Passwort</title></svelte:head>

<div class="wrap">
	<div class="card">
		<h1>Neues Passwort</h1>
		{#if form?.error}
			<div class="error">{form.error}</div>
		{/if}
		<form method="POST" use:enhance>
			<label for="password">Neues Passwort (min. 8 Zeichen)</label>
			<input id="password" name="password" type={showPw ? 'text' : 'password'} required minlength="8" />
			<label for="confirm">Passwort wiederholen</label>
			<input id="confirm" name="confirm" type={showPw ? 'text' : 'password'} required />
			<label class="show-pw">
				<input type="checkbox" bind:checked={showPw} /> Passwort anzeigen
			</label>
			<button type="submit" class="btn">Passwort speichern</button>
		</form>
	</div>
</div>

<style>
	.wrap { min-height: 100dvh; display: flex; align-items: center; justify-content: center; padding: 1rem; background: #f9fafb; }
	.card { background: white; border-radius: 1rem; padding: 2rem 1.5rem; width: 100%; max-width: 380px; box-shadow: 0 2px 16px rgba(0,0,0,0.07); }
	h1 { font-size: 1.25rem; font-weight: 700; margin: 0 0 1.25rem; }
	label { display: block; font-size: 0.875rem; font-weight: 600; margin-bottom: 0.375rem; color: #374151; }
	input[type='text'], input[type='password'] { width: 100%; padding: 0.75rem; border: 1.5px solid #d1d5db; border-radius: 0.5rem; font-size: 1rem; box-sizing: border-box; margin-bottom: 1rem; }
	input:focus { outline: none; border-color: #0b6bcb; }
	.show-pw { display: flex; align-items: center; gap: 0.5rem; font-weight: 400; cursor: pointer; margin-bottom: 1rem; }
	.show-pw input { width: auto; margin: 0; }
	.btn { width: 100%; padding: 0.875rem; background: #0b6bcb; color: white; border: none; border-radius: 0.75rem; font-size: 1rem; font-weight: 600; cursor: pointer; }
	.btn:hover { background: #0a4f99; }
	.error { background: #fef2f2; border: 1px solid #fecaca; color: #dc2626; border-radius: 0.5rem; padding: 0.75rem; font-size: 0.875rem; margin-bottom: 1rem; }
</style>
