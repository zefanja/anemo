<script lang="ts">
	import '@fontsource-variable/nunito';
	import '../app.css';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href="/logo.png" type="image/png" />
</svelte:head>

{@render children()}
