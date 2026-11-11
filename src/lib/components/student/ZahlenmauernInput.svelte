<script lang="ts">
	let {
		top,
		ab,
		bc,
		a,
		b,
		c,
		missing,
		value = $bindable(''),
		disabled = false,
		onsubmit
	}: {
		top: number;
		ab: number;
		bc: number;
		a: number;
		b: number;
		c: number;
		missing: 'a' | 'b' | 'c';
		value: string;
		disabled?: boolean;
		onsubmit?: () => void;
	} = $props();

	let inputEl = $state<HTMLInputElement | null>(null);

	export function focus() {
		inputEl?.focus();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && value.trim()) onsubmit?.();
	}
</script>

<div class="wall">
	<!-- Top row -->
	<div class="row row-top">
		<div class="cell">{top}</div>
	</div>
	<!-- Middle row -->
	<div class="row row-mid">
		<div class="cell">{ab}</div>
		<div class="cell">{bc}</div>
	</div>
	<!-- Bottom row -->
	<div class="row row-bot">
		{#if missing === 'a'}
			<input
				bind:this={inputEl}
				class="cell cell-input"
				type="number"
				inputmode="numeric"
				step="1"
				bind:value
				{disabled}
				placeholder="?"
				autocomplete="off"
				onkeydown={handleKeydown}
			/>
		{:else}
			<div class="cell">{a}</div>
		{/if}
		{#if missing === 'b'}
			<input
				bind:this={inputEl}
				class="cell cell-input"
				type="number"
				inputmode="numeric"
				step="1"
				bind:value
				{disabled}
				placeholder="?"
				autocomplete="off"
				onkeydown={handleKeydown}
			/>
		{:else}
			<div class="cell">{b}</div>
		{/if}
		{#if missing === 'c'}
			<input
				bind:this={inputEl}
				class="cell cell-input"
				type="number"
				inputmode="numeric"
				step="1"
				bind:value
				{disabled}
				placeholder="?"
				autocomplete="off"
				onkeydown={handleKeydown}
			/>
		{:else}
			<div class="cell">{c}</div>
		{/if}
	</div>
	<button
		class="submit-btn"
		onclick={() => onsubmit?.()}
		disabled={disabled || !value.trim()}
	>Antworten</button>
</div>

<style>
	/* Cell size + spacing constants */
	:root {
		--cw: 64px;
		--ch: 40px;
		--gap: 8px;
		--step: calc(var(--cw) + var(--gap)); /* 72px */
	}

	.wall {
		width: calc(3 * var(--cw) + 2 * var(--gap)); /* 208px */
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		gap: var(--gap);
	}

	.row {
		display: flex;
		gap: var(--gap);
	}

	/* Shift each upper row by half a colStep to align over the midpoints below */
	.row-mid { padding-left: calc(var(--step) / 2); } /* 36px */
	.row-top { padding-left: var(--step); }            /* 72px */

	.cell {
		width: var(--cw);
		height: var(--ch);
		border-radius: 6px;
		background: #f9fafb;
		border: 1.5px solid #d1d5db;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 1.1rem;
		font-weight: 600;
		color: #374151;
		flex-shrink: 0;
	}

	.cell-input {
		background: #ede9fe;
		border: 2px solid #0b6bcb;
		color: #0b6bcb;
		font-size: 1.1rem;
		font-weight: 700;
		text-align: center;
		outline: none;
		padding: 0;
		/* Remove number spinner */
		appearance: none;
		-webkit-appearance: textfield;
		-moz-appearance: textfield;
	}

	.cell-input::-webkit-outer-spin-button,
	.cell-input::-webkit-inner-spin-button {
		-webkit-appearance: none;
		margin: 0;
	}

	.cell-input:focus {
		box-shadow: 0 0 0 3px #bae6fd;
	}

	.cell-input:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.submit-btn {
		margin-top: 1rem;
		width: 100%;
		padding: 0.75rem 1rem;
		font-size: 1rem;
		font-weight: 700;
		border: none;
		border-radius: 8px;
		background: #0b6bcb;
		color: #fff;
		cursor: pointer;
		transition: background 0.15s, opacity 0.15s;
	}

	.submit-btn:hover:not(:disabled) {
		background: #0a4f99;
	}

	.submit-btn:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
</style>
