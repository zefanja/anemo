<script lang="ts">
	import IllustrationView from './IllustrationView.svelte';

	let {
		text,
		illustrationConfig = null
	}: {
		text: string;
		illustrationConfig?: Record<string, unknown> | null;
	} = $props();

	let el = $state<HTMLDivElement | null>(null);

	$effect(() => {
		if (!el || !text) return;
		el.innerHTML = '';
		for (const para of text.split(/\n\n+/).filter(Boolean)) {
			const p = document.createElement('p');
			p.textContent = para.trim();
			el.appendChild(p);
		}
		const mjax = (window as any).MathJax;
		if (!mjax) return;
		const run = () => {
			if (!el) return;
			mjax.typesetClear?.([el]);
			mjax.typesetPromise?.([el]).catch(() => {});
		};
		if (mjax.startup?.promise) {
			mjax.startup.promise.then(run);
		} else {
			run();
		}
	});
</script>

<div class="atom-explanation-wrapper">
	{#if illustrationConfig}
		<IllustrationView config={illustrationConfig} />
	{/if}
	<div class="atom-explanation" bind:this={el}></div>
</div>

<style>
	.atom-explanation-wrapper {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		border-left: 3px solid var(--c-primary, #16a34a);
		border-radius: 0 0.5rem 0.5rem 0;
		overflow: hidden;
	}

	.atom-explanation {
		background: var(--c-primary-light, #f0fdf4);
		padding: 0.75rem 1rem;
		font-size: 0.9rem;
		line-height: 1.65;
		color: var(--c-gray-800, #1f2937);
		text-align: left;
	}

	:global(.atom-explanation p) {
		margin: 0;
	}
	:global(.atom-explanation p + p) {
		margin-top: 0.5rem;
	}
</style>
