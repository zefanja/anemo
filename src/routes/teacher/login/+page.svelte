<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let showPw = $state(false);
</script>

<svelte:head>
	<title>Anemo – Lehrer-Login</title>
</svelte:head>

<div class="login-wrap">
	<div class="login-card">
		<div class="logo">
			<span class="logo-text">Anemo</span>
			<span class="logo-sub">Lehrer-Bereich</span>
		</div>

		<h1>Anmelden</h1>

		{#if form?.error}
			<div class="error-box" role="alert">{form.error}</div>
		{/if}

		<form method="POST" use:enhance>
			<input type="hidden" name="next" value={data.next} />

			<div class="field">
				<label for="email">E-Mail</label>
				<input
					id="email"
					name="email"
					type="email"
					autocomplete="email"
					required
					placeholder="name@schule.de"
				/>
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
					<button type="button" class="pw-toggle" onclick={() => (showPw = !showPw)}>
						{showPw ? 'Verbergen' : 'Zeigen'}
					</button>
				</div>
			</div>

			<button type="submit" class="btn-primary">Anmelden</button>
		</form>

		<div class="links">
			<a href="/teacher/password-reset">Passwort vergessen?</a>
			<span>·</span>
			<a href="/login">Schüler-Login</a>
		</div>
	</div>
</div>

<style>
	.login-wrap {
		min-height: 100dvh;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
		background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%);
	}

	.login-card {
		background: white;
		border-radius: 1.25rem;
		padding: 2rem 1.5rem;
		width: 100%;
		max-width: 400px;
		box-shadow: 0 4px 24px rgba(22, 163, 74, 0.1);
	}

	.logo {
		display: flex;
		flex-direction: column;
		align-items: center;
		margin-bottom: 1.5rem;
	}

	.logo-text {
		font-size: 2rem;
		font-weight: 800;
		color: #16a34a;
		letter-spacing: -0.03em;
	}

	.logo-sub {
		font-size: 0.8rem;
		color: #6b7280;
		text-transform: uppercase;
		letter-spacing: 0.1em;
	}

	h1 {
		font-size: 1.25rem;
		font-weight: 700;
		margin: 0 0 1.25rem;
		color: #111827;
		text-align: center;
	}

	.error-box {
		background: #fef2f2;
		border: 1px solid #fecaca;
		color: #dc2626;
		border-radius: 0.5rem;
		padding: 0.75rem 1rem;
		font-size: 0.875rem;
		margin-bottom: 1rem;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		margin-bottom: 1rem;
	}

	label {
		font-size: 0.875rem;
		font-weight: 600;
		color: #374151;
	}

	input[type='email'],
	input[type='password'],
	input[type='text'] {
		padding: 0.75rem 1rem;
		border: 1.5px solid #d1d5db;
		border-radius: 0.625rem;
		font-size: 1rem;
		color: #111827;
		width: 100%;
		box-sizing: border-box;
		transition: border-color 0.15s;
	}

	input:focus {
		outline: none;
		border-color: #16a34a;
	}

	.pw-wrap {
		position: relative;
	}

	.pw-wrap input {
		padding-right: 5rem;
	}

	.pw-toggle {
		position: absolute;
		right: 0.75rem;
		top: 50%;
		transform: translateY(-50%);
		background: none;
		border: none;
		color: #6b7280;
		font-size: 0.8rem;
		cursor: pointer;
		padding: 0.25rem;
	}

	.btn-primary {
		width: 100%;
		padding: 0.875rem;
		background: #16a34a;
		color: white;
		border: none;
		border-radius: 0.75rem;
		font-size: 1rem;
		font-weight: 600;
		cursor: pointer;
		margin-top: 0.5rem;
		transition: background 0.15s;
	}

	.btn-primary:hover { background: #15803d; }

	.links {
		display: flex;
		justify-content: center;
		gap: 0.5rem;
		margin-top: 1.25rem;
		font-size: 0.875rem;
		color: #9ca3af;
	}

	.links a {
		color: #6b7280;
		text-decoration: none;
	}

	.links a:hover { color: #16a34a; }
</style>
