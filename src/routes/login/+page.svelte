<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// 6 individual character slots
	let chars = $state(['', '', '', '', '', '']);
	let inputs: HTMLInputElement[] = [];

	function handleInput(i: number, e: Event) {
		const val = (e.target as HTMLInputElement).value.toUpperCase().replace(/[^A-Z0-9]/g, '');
		if (!val) return;
		chars[i] = val.slice(-1);
		if (i < 5) inputs[i + 1]?.focus();
	}

	function handleKeydown(i: number, e: KeyboardEvent) {
		if (e.key === 'Backspace' && !chars[i] && i > 0) {
			chars[i - 1] = '';
			inputs[i - 1]?.focus();
		}
	}

	function handlePaste(e: ClipboardEvent) {
		const text = e.clipboardData?.getData('text') ?? '';
		const clean = text.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
		for (let i = 0; i < 6; i++) chars[i] = clean[i] ?? '';
		inputs[Math.min(clean.length, 5)]?.focus();
		e.preventDefault();
	}

	const code = $derived(chars.join(''));
</script>

<svelte:head>
	<title>Anemo – Anmelden</title>
</svelte:head>

<div class="login-wrap">
	<div class="login-card">
		<div class="logo">
			<img src="/logo.png" alt="Anemo" class="logo-img" />
		</div>

		<h1>Dein Code</h1>
		<p class="hint">Gib deinen 6-stelligen Code ein, den du von deiner Lehrerin / deinem Lehrer bekommen hast.</p>

		{#if form?.error}
			<div class="error-box" role="alert">{form.error}</div>
		{/if}

		<form method="POST" use:enhance>
			<input type="hidden" name="next" value={data.next} />
			<input type="hidden" name="code" value={code} />

			<div class="code-slots" onpaste={handlePaste}>
				{#each chars as ch, i}
					<input
						bind:this={inputs[i]}
						type="text"
						inputmode="text"
						autocomplete="off"
						autocorrect="off"
						autocapitalize="characters"
						maxlength="1"
						value={ch}
						oninput={(e) => handleInput(i, e)}
						onkeydown={(e) => handleKeydown(i, e)}
						class="slot"
						aria-label="Zeichen {i + 1} von 6"
					/>
				{/each}
			</div>

			<button type="submit" class="btn-primary" disabled={code.length < 6}>
				Anmelden
			</button>
		</form>

		<div class="teacher-link">
			<a href="/teacher/login">Ich bin Lehrer/in →</a>
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
		background: linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%);
	}

	.login-card {
		background: white;
		border-radius: 1.25rem;
		padding: 2rem 1.5rem;
		width: 100%;
		max-width: 380px;
		box-shadow: 0 4px 24px rgba(79, 70, 229, 0.1);
		text-align: center;
	}

	.logo {
		display: flex;
		flex-direction: column;
		align-items: center;
		margin-bottom: 1.5rem;
	}

	.logo-img {
		width: 180px;
		height: auto;
	}

	h1 {
		font-size: 1.25rem;
		font-weight: 700;
		margin: 0 0 0.5rem;
		color: #111827;
	}

	.hint {
		font-size: 0.875rem;
		color: #6b7280;
		margin: 0 0 1.5rem;
		line-height: 1.5;
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

	.code-slots {
		display: flex;
		gap: 0.5rem;
		justify-content: center;
		margin-bottom: 1.5rem;
	}

	.slot {
		width: 2.75rem;
		height: 3.25rem;
		border: 2px solid #d1d5db;
		border-radius: 0.5rem;
		font-size: 1.25rem;
		font-weight: 700;
		text-align: center;
		text-transform: uppercase;
		color: #111827;
		background: #f9fafb;
		transition: border-color 0.15s;
		appearance: none;
		-webkit-appearance: none;
	}

	.slot:focus {
		outline: none;
		border-color: #4f46e5;
		background: #eef2ff;
	}

	.btn-primary {
		width: 100%;
		padding: 0.875rem;
		background: #4f46e5;
		color: white;
		border: none;
		border-radius: 0.75rem;
		font-size: 1rem;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.15s, opacity 0.15s;
	}

	.btn-primary:hover:not(:disabled) { background: #4338ca; }
	.btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }

	.teacher-link {
		margin-top: 1.5rem;
		font-size: 0.875rem;
	}

	.teacher-link a {
		color: #6b7280;
		text-decoration: none;
	}

	.teacher-link a:hover { color: #4f46e5; }
</style>
