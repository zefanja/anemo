<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
	let showPw = $state(false);
</script>

<svelte:head>
	<title>Anemo – Ersteinrichtung</title>
</svelte:head>

<div class="setup-wrap">
	<div class="setup-card">
		<div class="logo">
			<span class="logo-text">Anemo</span>
			<span class="logo-sub">Ersteinrichtung</span>
		</div>

		<h1>Willkommen bei Anemo</h1>
		<p class="intro">
			Lege jetzt die Schule und das erste Administrator-Konto an.
			Danach kannst du weitere Lehrkräfte einladen.
		</p>

		<form method="POST" use:enhance>
			<fieldset>
				<legend>Schule</legend>
				<div class="field">
					<label for="schoolName">Name der Schule</label>
					<input
						id="schoolName"
						name="schoolName"
						type="text"
						required
						placeholder="z.B. Gymnasium Musterstadt"
						value={form?.schoolName ?? ''}
						class:input-error={form?.errors?.schoolName}
					/>
					{#if form?.errors?.schoolName}
						<span class="field-error">{form.errors.schoolName}</span>
					{/if}
				</div>
			</fieldset>

			<fieldset>
				<legend>Administrator-Konto</legend>
				<div class="field">
					<label for="adminName">Ihr Name</label>
					<input
						id="adminName"
						name="adminName"
						type="text"
						required
						placeholder="z.B. Maria Muster"
						value={form?.adminName ?? ''}
						class:input-error={form?.errors?.adminName}
					/>
					{#if form?.errors?.adminName}
						<span class="field-error">{form.errors.adminName}</span>
					{/if}
				</div>

				<div class="field">
					<label for="email">E-Mail-Adresse</label>
					<input
						id="email"
						name="email"
						type="email"
						required
						placeholder="admin@schule.de"
						value={form?.email ?? ''}
						class:input-error={form?.errors?.email}
					/>
					{#if form?.errors?.email}
						<span class="field-error">{form.errors.email}</span>
					{/if}
				</div>

				<div class="field">
					<label for="password">Passwort</label>
					<div class="pw-wrap">
						<input
							id="password"
							name="password"
							type={showPw ? 'text' : 'password'}
							required
							placeholder="Mindestens 8 Zeichen"
							class:input-error={form?.errors?.password}
						/>
						<button type="button" class="pw-toggle" onclick={() => (showPw = !showPw)}>
							{showPw ? 'Verbergen' : 'Zeigen'}
						</button>
					</div>
					{#if form?.errors?.password}
						<span class="field-error">{form.errors.password}</span>
					{/if}
				</div>

				<div class="field">
					<label for="confirm">Passwort bestätigen</label>
					<input
						id="confirm"
						name="confirm"
						type={showPw ? 'text' : 'password'}
						required
						placeholder="Passwort wiederholen"
						class:input-error={form?.errors?.confirm}
					/>
					{#if form?.errors?.confirm}
						<span class="field-error">{form.errors.confirm}</span>
					{/if}
				</div>
			</fieldset>

			<button type="submit" class="btn-primary">Einrichtung abschließen</button>
		</form>
	</div>
</div>

<style>
	.setup-wrap {
		min-height: 100dvh;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1.5rem 1rem;
		background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%);
	}

	.setup-card {
		background: white;
		border-radius: 1.25rem;
		padding: 2rem 1.5rem;
		width: 100%;
		max-width: 460px;
		box-shadow: 0 4px 24px rgba(22, 163, 74, 0.1);
	}

	.logo {
		display: flex;
		flex-direction: column;
		align-items: center;
		margin-bottom: 1.25rem;
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
		margin: 0 0 0.5rem;
		color: #111827;
		text-align: center;
	}
	.intro {
		font-size: 0.875rem;
		color: #6b7280;
		text-align: center;
		margin-bottom: 1.5rem;
		line-height: 1.5;
	}

	fieldset {
		border: 1.5px solid #e5e7eb;
		border-radius: 0.75rem;
		padding: 1rem 1rem 0.5rem;
		margin-bottom: 1rem;
	}
	legend {
		font-size: 0.8rem;
		font-weight: 700;
		color: #374151;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		padding: 0 0.25rem;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		margin-bottom: 0.875rem;
	}
	label {
		font-size: 0.875rem;
		font-weight: 600;
		color: #374151;
	}
	input[type='text'],
	input[type='email'],
	input[type='password'] {
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
	input.input-error { border-color: #dc2626; }
	.field-error {
		font-size: 0.8rem;
		color: #dc2626;
	}

	.pw-wrap { position: relative; }
	.pw-wrap input { padding-right: 5rem; }
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
		transition: background 0.15s;
	}
	.btn-primary:hover { background: #15803d; }
</style>
