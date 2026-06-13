<script lang="ts">
	import { page } from '$app/stores';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();
	let path = $derived($page.url.pathname);
</script>

{#if data.teacherEmail}
	<div class="t-shell">
		<header class="t-header">
			<div class="t-brand">
				<span class="t-logo">Anemo</span>
				<span class="t-area">Lehrerbereich</span>
			</div>
			<nav class="t-nav">
				<a href="/teacher/dashboard" class="t-nav-link" class:active={path === '/teacher/dashboard'}>
					Dashboard
				</a>
				<a
					href="/teacher/classes"
					class="t-nav-link"
					class:active={path.startsWith('/teacher/classes')}
				>
					Klassen
				</a>
				<a
					href="/teacher/tasks/import"
					class="t-nav-link"
					class:active={path.startsWith('/teacher/tasks')}
				>
					Aufgaben
				</a>
				<a
					href="/teacher/atoms/import"
					class="t-nav-link"
					class:active={path.startsWith('/teacher/atoms')}
				>
					Erklärungen
				</a>
				<a
					href="/teacher/settings"
					class="t-nav-link"
					class:active={path.startsWith('/teacher/settings')}
				>
					Einstellungen
				</a>
				{#if data.isAdmin}
					<a
						href="/teacher/admin/teachers"
						class="t-nav-link"
						class:active={path.startsWith('/teacher/admin')}
					>
						Verwaltung
					</a>
				{/if}
			</nav>
			<div class="t-user">
				<span class="t-email">{data.teacherEmail}</span>
				<a href="/logout" class="t-logout">Abmelden</a>
			</div>
		</header>
		<main class="t-main">
			{@render children()}
		</main>
	</div>
{:else}
	{@render children()}
{/if}

<style>
	.t-shell {
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
		background: var(--c-gray-50);
	}

	.t-header {
		background: #16a34a;
		color: #fff;
		display: flex;
		align-items: center;
		gap: 1.5rem;
		padding: 0 1.5rem;
		height: 56px;
		flex-shrink: 0;
	}

	.t-brand {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		flex-shrink: 0;
	}
	.t-logo {
		font-size: 1.25rem;
		font-weight: 800;
		letter-spacing: -0.03em;
	}
	.t-area {
		font-size: 0.7rem;
		opacity: 0.7;
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}

	.t-nav {
		display: flex;
		gap: 0.25rem;
		flex: 1;
	}
	.t-nav-link {
		padding: 0.4rem 0.75rem;
		border-radius: 0.5rem;
		font-size: 0.9rem;
		font-weight: 500;
		color: rgba(255, 255, 255, 0.8);
		text-decoration: none;
		transition: background 0.15s, color 0.15s;
	}
	.t-nav-link:hover {
		background: rgba(255, 255, 255, 0.15);
		color: #fff;
	}
	.t-nav-link.active {
		background: rgba(255, 255, 255, 0.2);
		color: #fff;
		font-weight: 600;
	}

	.t-user {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex-shrink: 0;
	}
	.t-email {
		font-size: 0.8rem;
		opacity: 0.75;
	}
	.t-logout {
		font-size: 0.8rem;
		color: rgba(255, 255, 255, 0.8);
		text-decoration: none;
		padding: 0.3rem 0.6rem;
		border: 1px solid rgba(255, 255, 255, 0.4);
		border-radius: 0.375rem;
		transition: background 0.15s;
	}
	.t-logout:hover {
		background: rgba(255, 255, 255, 0.15);
		color: #fff;
	}

	.t-main {
		flex: 1;
		padding: 1.5rem;
		max-width: 1200px;
		margin: 0 auto;
		width: 100%;
	}
</style>
