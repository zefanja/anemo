<script lang="ts">
	import { enhance } from '$app/forms';
	import AuthShell from '$lib/components/teacher/AuthShell.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let showPw = $state(false);
</script>

<svelte:head>
	<title>Anemo – Lehrer-Login</title>
</svelte:head>

<AuthShell title="Anmelden" subtitle="Willkommen zurück im Lehrerbereich.">
	{#if form?.error}
		<div class="alert alert-error" role="alert">{form.error}</div>
	{/if}

	<form method="POST" use:enhance class="auth-form">
		<input type="hidden" name="next" value={data.next} />

		<div class="field">
			<label for="email">E-Mail</label>
			<input id="email" name="email" type="email" autocomplete="email" required placeholder="name@schule.de" />
		</div>

		<div class="field">
			<label for="password">Passwort</label>
			<div class="pw-wrap">
				<input
					id="password"
					name="password"
					type={showPw ? 'text' : 'password'}
					autocomplete="current-password"
					required
					placeholder="••••••••"
				/>
				<button type="button" class="pw-toggle" onclick={() => (showPw = !showPw)} aria-pressed={showPw}>
					{showPw ? 'Verbergen' : 'Zeigen'}
				</button>
			</div>
		</div>

		<button type="submit" class="btn btn-primary btn-full btn-lg">Anmelden</button>
	</form>

	<div class="links">
		<a href="/teacher/password-reset">Passwort vergessen?</a>
		<a href="/login">Zum Schüler-Login</a>
	</div>
</AuthShell>

<style>
	.auth-form { display: flex; flex-direction: column; gap: 1rem; }
	.pw-wrap { position: relative; }
	.pw-wrap input { padding-right: 6rem; }
	.pw-toggle {
		position: absolute; right: 0.35rem; top: 50%; transform: translateY(-50%);
		min-height: 2.25rem; padding: 0 0.75rem; border: 0; border-radius: 10px;
		background: var(--c-track); color: var(--c-navy-2); font: 800 0.85rem var(--font); cursor: pointer;
	}
	.pw-toggle:hover { background: var(--c-primary-light); color: var(--c-primary-dark); }
	.btn-lg { min-height: 3.25rem; font-size: 1.05rem; margin-top: 0.25rem; }
	.links { display: flex; justify-content: space-between; gap: 0.5rem 1rem; flex-wrap: wrap; font-size: 0.9rem; font-weight: 800; }
	.links a { color: var(--c-primary); text-decoration: none; min-height: 2rem; display: inline-flex; align-items: center; }
	.links a:hover { color: var(--c-primary-dark); text-decoration: underline; }
</style>
