<script lang="ts">
	let { config }: { config: Record<string, unknown> | null | undefined } = $props();
</script>

{#if config?.type === 'svg' && typeof config.content === 'string'}
	<div class="illustration">
		{@html config.content}
	</div>
{/if}

<style>
	.illustration {
		width: 100%;
		background: var(--c-gray-50, #f9fafb);
		border-radius: 0.5rem;
		overflow: hidden;
		line-height: 0;
	}

	.illustration :global(svg) {
		display: block;
		width: 100%;
		height: auto;
	}
</style>
