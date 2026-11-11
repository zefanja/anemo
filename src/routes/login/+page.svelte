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
	<div class="hero">
		<svg class="hero-deco" viewBox="0 0 390 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
			<g fill="#fff" fill-opacity="0.5">
				<circle cx="48" cy="60" r="3" /><circle cx="96" cy="32" r="2" /><circle cx="330" cy="48" r="3" />
				<circle cx="356" cy="120" r="2" /><circle cx="30" cy="170" r="2" />
			</g>
			<g fill="none" stroke="#fff" stroke-opacity="0.35" stroke-width="1.5">
				<path d="M48 60 L96 32 L150 56" /><path d="M330 48 L356 120 L300 140" />
			</g>
			<g fill="#fff" fill-opacity="0.55" font-weight="800" font-family="sans-serif">
				<text x="60" y="130" font-size="26">π</text>
				<text x="306" y="220" font-size="22">√x</text>
				<text x="36" y="250" font-size="22">⅔</text>
				<text x="296" y="100" font-size="20">+</text>
			</g>
		</svg>
		<div class="bubble">Schön, dass du da bist!</div>
		<img src="/mascot.png" alt="Anemo, der Lern-Roboter" class="mascot" />
	</div>

	<div class="login-body">
		<div class="intro">
			<h1>Willkommen bei Anemo</h1>
			<p>Gib deinen 6-stelligen Code ein, den du von deiner Lehrkraft bekommen hast.</p>
		</div>

		{#if form?.error}
			<div class="error-box" role="alert">{form.error}</div>
		{/if}

		<form method="POST" use:enhance>
			<input type="hidden" name="next" value={data.next} />
			<input type="hidden" name="code" value={code} />

			<fieldset>
				<legend>Dein Code</legend>
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
							class:filled={!!ch}
							aria-label="Zeichen {i + 1} von 6"
						/>
					{/each}
				</div>
			</fieldset>

			<button type="submit" class="btn-3d" disabled={code.length < 6}>
				Los geht’s
				<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg>
			</button>
		</form>

		<p class="teacher-link">Du bist Lehrkraft? <a href="/teacher/login">Hier anmelden</a></p>
	</div>
</div>

<style>
	.login-wrap {
		min-height: 100dvh;
		background: var(--c-ground);
		color: var(--c-navy);
		display: flex;
		flex-direction: column;
		align-items: center;
	}
	.hero {
		position: relative;
		width: 100%;
		height: min(46dvh, 380px);
		min-height: 260px;
		background: var(--c-sky);
		border-radius: 0 0 40px 40px;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: flex-end;
		overflow: hidden;
	}
	.hero-deco { position: absolute; inset: 0; width: 100%; height: 100%; }
	.bubble {
		position: absolute;
		top: 12%;
		left: 50%;
		transform: translateX(-50%);
		background: #fff;
		font-weight: 800;
		font-size: 1rem;
		padding: 0.6rem 1rem;
		border-radius: 18px;
		white-space: nowrap;
		box-shadow: 0 6px 18px rgba(11, 42, 91, 0.15);
		animation: pop 0.5s 0.2s both cubic-bezier(.2, 1.4, .4, 1);
	}
	.mascot {
		position: relative;
		height: 72%;
		width: auto;
		animation: float 4s ease-in-out infinite;
	}
	@keyframes float { 50% { transform: translateY(-8px); } }
	@keyframes pop { from { opacity: 0; transform: translateX(-50%) scale(0.6); } }

	.login-body {
		width: 100%;
		max-width: 420px;
		padding: 1.75rem 1.5rem 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
		flex: 1;
	}
	.intro { text-align: center; display: flex; flex-direction: column; gap: 0.35rem; }
	h1 { font-size: 1.85rem; font-weight: 900; letter-spacing: -0.02em; line-height: 1.15; }
	.intro p { color: var(--c-ink-2); font-weight: 600; }

	.error-box {
		background: var(--c-error-light);
		border: 1px solid #fecaca;
		color: #b91c1c;
		border-radius: 0.75rem;
		padding: 0.75rem 1rem;
		font-size: 0.9rem;
		font-weight: 700;
	}
	form { display: flex; flex-direction: column; gap: 1.1rem; }
	fieldset { border: 0; padding: 0; margin: 0; }
	legend { font-size: 0.875rem; font-weight: 800; color: var(--c-ink-2); margin-bottom: 0.6rem; }
	.code-slots { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 0.5rem; }
	.slot {
		width: 100%;
		height: 3.6rem;
		border: 2px solid var(--c-line);
		border-radius: 14px;
		background: #fff;
		font: 900 1.5rem var(--font);
		text-align: center;
		text-transform: uppercase;
		color: var(--c-navy);
		appearance: none;
		-webkit-appearance: none;
		transition: border-color .15s, background .15s;
	}
	.slot.filled { border-color: var(--c-primary); }
	.slot:focus { outline: none; border: 3px solid var(--c-sky); background: var(--c-primary-light); }

	.teacher-link {
		margin-top: auto;
		text-align: center;
		font-size: 0.95rem;
		font-weight: 700;
		color: var(--c-ink-2);
	}
	.teacher-link a { color: var(--c-primary); font-weight: 800; }
</style>
