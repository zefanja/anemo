<script lang="ts">
	let { text, class: cls = '' }: { text: string; class?: string } = $props();

	let el = $state<HTMLElement | null>(null);

	$effect(() => {
		if (!el) return;
		// Set raw text — this clears any previous MathJax output
		el.textContent = text;
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

<span bind:this={el} class={cls}></span>
