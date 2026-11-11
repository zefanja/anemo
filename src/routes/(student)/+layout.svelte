<script lang="ts">
	import { page } from '$app/stores';
	import Icon from '$lib/components/student/Icon.svelte';
	import { ui } from '$lib/stores/ui.svelte.js';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();

	let currentPath = $derived($page.url.pathname);
	let hideNav = $derived(ui.focusMode || currentPath.startsWith('/placement'));

	const NAV = [
		{ href: '/practice', label: 'Üben', icon: 'pencil' },
		{ href: '/progress', label: 'Sterne', icon: 'stars' },
		{ href: '/badges', label: 'Abzeichen', icon: 'medal' },
		{ href: '/me', label: 'Ich', icon: 'user' }
	] as const;
</script>

<div class="layout" class:dark={currentPath.startsWith('/progress')}>
	<main class="main">
		{@render children()}
	</main>

	{#if !hideNav}
		<nav class="bottom-nav" aria-label="Navigation">
			{#each NAV as item}
				{@const active = currentPath.startsWith(item.href)}
				<a href={item.href} class="nav-item" class:active aria-current={active ? 'page' : undefined}>
					<span class="nav-pill"><Icon name={item.icon} size={24} /></span>
					<span>{item.label}</span>
				</a>
			{/each}
		</nav>
	{/if}
</div>

<style>
	.layout {
		display: flex;
		flex-direction: column;
		height: 100svh;
		overflow: hidden;
		background: var(--c-ground);
		color: var(--c-navy);
	}
	.layout.dark {
		background: #081f45;
		color: #fff;
	}

	.main {
		flex: 1;
		overflow-y: auto;
		-webkit-overflow-scrolling: touch;
	}

	.bottom-nav {
		flex-shrink: 0;
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		background: #fff;
		border-top: 1px solid var(--c-line);
		padding: 0.4rem 0.5rem calc(0.5rem + env(safe-area-inset-bottom, 0px));
	}
	.dark .bottom-nav {
		background: var(--c-navy);
		border-top-color: var(--c-navy-3);
	}
	.nav-item {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		min-height: 52px;
		justify-content: center;
		text-decoration: none;
		color: var(--c-ink-2);
		font-size: 0.75rem;
		font-weight: 800;
	}
	.dark .nav-item { color: #bfdbfe; }
	.nav-pill {
		display: flex;
		padding: 0.25rem 1.1rem;
		border-radius: 999px;
		transition: background .15s;
	}
	.nav-item.active {
		color: var(--c-primary);
		font-weight: 900;
	}
	.nav-item.active .nav-pill { background: var(--c-primary-light); }
	.dark .nav-item.active { color: #fff; }
	.dark .nav-item.active .nav-pill { background: var(--c-navy-3); }
	@media (hover: hover) {
		.nav-item:hover .nav-pill { background: var(--c-primary-light); }
		.dark .nav-item:hover .nav-pill { background: var(--c-navy-3); }
	}
	@media (min-width: 700px) {
		.bottom-nav { justify-content: center; grid-template-columns: repeat(4, 120px); }
	}
</style>
