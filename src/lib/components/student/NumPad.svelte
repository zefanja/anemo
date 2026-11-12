<script lang="ts">
	import type { PadKey } from '$lib/numpad.js';
	import Icon from './Icon.svelte';

	let {
		onpress,
		canSubmit = false,
		submitting = false,
		showComma = false,
		showMinus = false,
		submitLabel = 'Prüfen',
		onkeyboard
	}: {
		onpress: (key: PadKey) => void;
		canSubmit?: boolean;
		submitting?: boolean;
		showComma?: boolean;
		showMinus?: boolean;
		submitLabel?: string;
		/** Switch to the device's own keyboard instead of the pad. */
		onkeyboard?: () => void;
	} = $props();

	const DIGITS: PadKey[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

	// Keep focus (and caret) in the answer field while tapping the pad
	function keepFocus(e: Event) {
		e.preventDefault();
	}
</script>

<div class="numpad" role="group" aria-label="Zahlen-Tastenfeld">
	<div class="digits">
		{#each DIGITS as d}
			<button type="button" onpointerdown={keepFocus} onmousedown={keepFocus} class="key" onclick={() => onpress(d)}>{d}</button>
		{/each}
	</div>
	<div class="actions">
		<button type="button" onpointerdown={keepFocus} onmousedown={keepFocus} class="key key-icon" onclick={() => onpress('Backspace')} aria-label="Löschen">
			<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 5H8l-6 7 6 7h13a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1Z" /><path d="m16 9-6 6M10 9l6 6" /></svg>
		</button>
		{#if showMinus}
			<button type="button" onpointerdown={keepFocus} onmousedown={keepFocus} class="key key-small" onclick={() => onpress('-')} aria-label="Vorzeichen wechseln">±</button>
		{/if}
		{#if showComma}
			<button type="button" onpointerdown={keepFocus} onmousedown={keepFocus} class="key key-small" onclick={() => onpress(',')} aria-label="Komma">,</button>
		{/if}
		<button type="button" onpointerdown={keepFocus} onmousedown={keepFocus} class="btn-3d submit" onclick={() => onpress('Enter')} disabled={!canSubmit || submitting}>
			{submitting ? 'Einen Moment…' : submitLabel}
		</button>
	</div>
	{#if onkeyboard}
		<button type="button" onpointerdown={keepFocus} onmousedown={keepFocus} class="kbd-switch" onclick={onkeyboard}>
			<Icon name="pencil" size={14} /> Geräte-Tastatur verwenden
		</button>
	{/if}
</div>

<style>
	.numpad {
		background: #fff;
		border-top: 1px solid var(--c-line);
		padding: 0.85rem 1rem calc(0.75rem + env(safe-area-inset-bottom, 0px));
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
		user-select: none;
		-webkit-user-select: none;
		touch-action: manipulation;
	}
	.digits {
		display: grid;
		grid-template-columns: repeat(5, minmax(0, 1fr));
		gap: 0.5rem;
	}
	.actions { display: flex; gap: 0.5rem; }
	.key {
		height: 3rem;
		border: 0;
		border-radius: 12px;
		background: var(--c-track);
		box-shadow: 0 3px 0 var(--c-line);
		font: 900 1.4rem var(--font);
		color: var(--c-navy);
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: transform .06s, box-shadow .06s, background .1s;
	}
	.key:active { transform: translateY(2px); box-shadow: 0 1px 0 var(--c-line); background: var(--c-primary-light); }
	.key:focus-visible { outline: 3px solid var(--c-sky); outline-offset: 2px; }
	.key-icon { width: 4rem; height: 3.5rem; flex: none; color: var(--c-ink-2); }
	.key-small { width: 3.25rem; height: 3.5rem; flex: none; }
	.submit { flex: 1; }
	.kbd-switch {
		align-self: center;
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		background: none;
		border: 0;
		min-height: 2rem;
		padding: 0 0.5rem;
		font: 700 0.8rem var(--font);
		color: var(--c-ink-2);
		cursor: pointer;
	}
	.kbd-switch:hover { color: var(--c-primary); text-decoration: underline; }
	@media (min-width: 700px) {
		.numpad { max-width: 520px; margin: 0 auto; width: 100%; border: 1px solid var(--c-line); border-radius: 20px 20px 0 0; }
	}
</style>
