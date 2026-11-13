<script lang="ts">
	import '$lib/styles/teacher.css';
	import { page } from '$app/stores';
	import TIcon, { type TIconName } from '$lib/components/teacher/TIcon.svelte';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();
	let path = $derived($page.url.pathname);

	type NavItem = { href: string; label: string; icon: TIconName; match: (p: string) => boolean };

	const groups = $derived<{ title: string; items: NavItem[] }[]>([
		{
			title: 'Übersicht',
			items: [
				{ href: '/teacher/dashboard', label: 'Dashboard', icon: 'dashboard', match: (p) => p === '/teacher/dashboard' },
				{ href: '/teacher/classes', label: 'Klassen', icon: 'users', match: (p) => p.startsWith('/teacher/classes') }
			]
		},
		{
			title: 'Inhalte',
			items: [
				{ href: '/teacher/tasks/import', label: 'Aufgaben', icon: 'upload', match: (p) => p.startsWith('/teacher/tasks') },
				{ href: '/teacher/atoms/import', label: 'Erklärungen', icon: 'book', match: (p) => p.startsWith('/teacher/atoms/import') },
				{ href: '/teacher/atoms/insights', label: 'Atom-Insights', icon: 'chart', match: (p) => p.startsWith('/teacher/atoms/insights') }
			]
		},
		{
			title: 'Konto',
			items: [
				{ href: '/teacher/settings', label: 'Einstellungen', icon: 'settings', match: (p) => p.startsWith('/teacher/settings') },
				...(data.isAdmin
					? [{ href: '/teacher/admin/teachers', label: 'Verwaltung', icon: 'shield' as TIconName, match: (p: string) => p.startsWith('/teacher/admin') }]
					: [])
			]
		}
	]);

	const bottomNav: NavItem[] = [
		{ href: '/teacher/dashboard', label: 'Übersicht', icon: 'dashboard', match: (p) => p === '/teacher/dashboard' },
		{ href: '/teacher/classes', label: 'Klassen', icon: 'users', match: (p) => p.startsWith('/teacher/classes') },
		{ href: '/teacher/atoms/insights', label: 'Insights', icon: 'chart', match: (p) => p.startsWith('/teacher/atoms/insights') },
		{
			href: '/teacher/more',
			label: 'Mehr',
			icon: 'menu',
			match: (p) =>
				p.startsWith('/teacher/more') || p.startsWith('/teacher/tasks') || p.startsWith('/teacher/atoms/import') ||
				p.startsWith('/teacher/settings') || p.startsWith('/teacher/admin')
		}
	];

	let initials = $derived((data.teacherEmail ?? '').replace(/[^a-zA-Z]/g, '').slice(0, 2).toUpperCase() || 'L');
	let activeClassId = $derived(path.match(/^\/teacher\/classes\/([^/]+)/)?.[1] ?? null);
</script>

<div class="teacher">
	{#if data.teacherEmail}
		<div class="t-shell">
			<aside class="t-side" aria-label="Lehrerbereich">
				<a href="/teacher/dashboard" class="t-brand">
					<span class="t-mark" aria-hidden="true">a</span>
					<span class="t-brand-text">
						<span class="t-logo">anemo</span>
						<span class="t-area">Lehrerbereich</span>
					</span>
				</a>
				<nav class="t-nav">
					{#each groups as g}
						<div class="t-group">{g.title}</div>
						{#each g.items as item}
							<a href={item.href} class="t-link" class:active={item.match(path)} aria-current={item.match(path) ? 'page' : undefined}>
								<TIcon name={item.icon} />
								{item.label}
							</a>
							{#if item.icon === 'users' && data.navClasses && data.navClasses.length > 0 && path.startsWith('/teacher/classes')}
								<div class="t-sub">
									{#each data.navClasses as c}
										<a href="/teacher/classes/{c.id}" class="t-sublink" class:active={activeClassId === c.id}>{c.name}</a>
									{/each}
								</div>
							{/if}
						{/each}
					{/each}
				</nav>
				<div class="t-user">
					<span class="t-avatar" aria-hidden="true">{initials}</span>
					<span class="t-email" title={data.teacherEmail}>{data.teacherEmail}</span>
					<a href="/logout" class="t-logout" aria-label="Abmelden" title="Abmelden"><TIcon name="logout" size={18} /></a>
				</div>
			</aside>

			<header class="t-top">
				<a href="/teacher/dashboard" class="t-brand small">
					<span class="t-mark" aria-hidden="true">a</span>
					<span class="t-logo dark">anemo</span>
				</a>
				<a href="/teacher/more" class="t-top-avatar" aria-label="Konto und weitere Bereiche">
					<span class="t-avatar">{initials}</span>
				</a>
			</header>

			<main class="t-main">
				{@render children()}
			</main>

			<nav class="t-bottom" aria-label="Hauptnavigation">
				{#each bottomNav as item}
					<a href={item.href} class="t-bitem" class:active={item.match(path)} aria-current={item.match(path) ? 'page' : undefined}>
						<span class="t-pill"><TIcon name={item.icon} size={22} /></span>
						{item.label}
					</a>
				{/each}
			</nav>
		</div>
	{:else}
		{@render children()}
	{/if}
</div>

<style>
	.t-shell {
		min-height: 100dvh;
		display: grid;
		grid-template-columns: var(--t-sidebar-w) minmax(0, 1fr);
		/* navy column continues below the sticky sidebar */
		background: linear-gradient(to right, var(--c-navy) var(--t-sidebar-w), transparent var(--t-sidebar-w));
	}

	/* ── Sidebar (desktop) ── */
	.t-side {
		position: sticky;
		top: 0;
		height: 100dvh;
		overflow-y: auto;
		background: var(--c-navy);
		display: flex;
		flex-direction: column;
		padding: 1.4rem 0.875rem 1rem;
	}
	.t-brand {
		display: flex;
		align-items: center;
		gap: 0.65rem;
		padding: 0.25rem 0.6rem 1.1rem;
		text-decoration: none;
	}
	.t-brand.small { padding: 0; gap: 0.5rem; }
	.t-mark {
		width: 2.25rem;
		height: 2.25rem;
		border-radius: 12px;
		background: var(--c-sky);
		color: var(--c-navy);
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 900;
		font-size: 1.25rem;
		flex: none;
	}
	.t-brand-text { display: flex; flex-direction: column; line-height: 1.1; }
	.t-logo { color: #fff; font-weight: 900; font-size: 1.25rem; letter-spacing: -0.02em; }
	.t-logo.dark { color: var(--c-navy); }
	.t-area { color: #8fb0da; font-size: 0.68rem; font-weight: 900; letter-spacing: 0.1em; text-transform: uppercase; }

	.t-nav { display: flex; flex-direction: column; gap: 2px; flex: 1; }
	.t-group {
		font-size: 0.68rem;
		font-weight: 900;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: #8fb0da;
		padding: 1.1rem 0.875rem 0.4rem;
	}
	.t-group:first-child { padding-top: 0.25rem; }
	.t-link {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		min-height: 2.75rem;
		padding: 0 0.875rem;
		border-radius: 12px;
		color: #c7dcf5;
		text-decoration: none;
		font-weight: 800;
		font-size: 0.95rem;
		transition: background 0.15s, color 0.15s;
	}
	.t-link:hover { background: var(--c-navy-2); color: #fff; }
	.t-link.active { background: var(--c-navy-3); color: #fff; }
	.t-sub { display: flex; flex-direction: column; gap: 2px; padding: 2px 0 4px 2.9rem; }
	.t-sublink {
		color: #c7dcf5;
		font-weight: 700;
		font-size: 0.875rem;
		text-decoration: none;
		padding: 0.4rem 0.65rem;
		border-radius: 8px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.t-sublink:hover { color: #fff; background: var(--c-navy-2); }
	.t-sublink.active { color: #fff; background: var(--c-navy-2); font-weight: 800; }

	.t-user {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.65rem 0.65rem 0.65rem 0.75rem;
		margin-top: 1rem;
		border-radius: 14px;
		background: var(--c-navy-2);
	}
	.t-avatar {
		width: 2.25rem;
		height: 2.25rem;
		flex: none;
		border-radius: 50%;
		background: var(--c-sky-soft);
		color: var(--c-navy);
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 900;
		font-size: 0.85rem;
	}
	.t-email {
		flex: 1;
		min-width: 0;
		color: #dbeafe;
		font-size: 0.8rem;
		font-weight: 700;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.t-logout {
		width: 2.25rem;
		height: 2.25rem;
		flex: none;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 10px;
		color: #c7dcf5;
	}
	.t-logout:hover { background: var(--c-navy-3); color: #fff; }

	/* ── Main ── */
	.t-main {
		padding: 2rem 2.5rem 3rem;
		width: 100%;
		max-width: 1480px;
		min-width: 0;
	}

	/* ── Mobile chrome (hidden on desktop) ── */
	.t-top, .t-bottom { display: none; }

	@media (max-width: 899px) {
		.t-shell { display: flex; flex-direction: column; background: none; }
		.t-side { display: none; }
		.t-top {
			display: flex;
			align-items: center;
			justify-content: space-between;
			position: sticky;
			top: 0;
			z-index: 20;
			padding: 0.5rem 0.5rem 0.5rem 1rem;
			padding-top: calc(0.5rem + env(safe-area-inset-top, 0px));
			background: #fff;
			border-bottom: 1px solid var(--c-line);
		}
		.t-top .t-mark { width: 2rem; height: 2rem; border-radius: 10px; font-size: 1.1rem; }
		.t-top-avatar {
			width: 2.75rem;
			height: 2.75rem;
			display: flex;
			align-items: center;
			justify-content: center;
			text-decoration: none;
		}
		.t-main {
			flex: 1;
			padding: 1rem 1rem calc(5.5rem + env(safe-area-inset-bottom, 0px));
		}
		.t-bottom {
			display: grid;
			grid-template-columns: repeat(4, minmax(0, 1fr));
			position: fixed;
			left: 0;
			right: 0;
			bottom: 0;
			z-index: 30;
			background: #fff;
			border-top: 1px solid var(--c-line);
			padding: 0.4rem 0.5rem calc(0.5rem + env(safe-area-inset-bottom, 0px));
		}
		.t-bitem {
			display: flex;
			flex-direction: column;
			align-items: center;
			justify-content: center;
			gap: 2px;
			min-height: 3.25rem;
			text-decoration: none;
			color: var(--c-ink-2);
			font-size: 0.75rem;
			font-weight: 800;
		}
		.t-pill { display: flex; padding: 0.25rem 1.1rem; border-radius: 999px; transition: background 0.15s; }
		.t-bitem.active { color: var(--c-primary); font-weight: 900; }
		.t-bitem.active .t-pill { background: var(--c-primary-light); }
	}
</style>
