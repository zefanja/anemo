<script lang="ts">
	import { onMount } from 'svelte';

	interface StarAtom {
		id: string;
		label: string;
		domain: string;
		subdomain: string | null;
		level: 'atom' | 'cluster';
		mastery: number;
		isMastered: boolean;
		isActive: boolean;
	}

	let { atoms }: { atoms: StarAtom[] } = $props();

	// ── Canvas dimensions ──────────────────────────────────────
	const VW = 1600, VH = 1600, CX = 800, CY = 800;
	const MIN_DIST = 34; // minimum pixel distance between star centers

	// ── Helpers ────────────────────────────────────────────────
	function djb2(s: string): number {
		let h = 5381;
		for (let i = 0; i < s.length; i++)
			h = (((h * 33) | 0) ^ s.charCodeAt(i)) >>> 0;
		return h;
	}

	// Fast seedable PRNG (mulberry32)
	function rng(seed: number): () => number {
		return () => {
			seed = (seed + 0x6d2b79f5) | 0;
			let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
			t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
			return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
		};
	}

	// Estimated bounding radius after repulsion for n atoms
	function clusterR(n: number): number {
		if (n <= 1) return 0;
		return MIN_DIST * Math.sqrt(n / Math.PI) + MIN_DIST;
	}

	// Ring radius to hold n circles of radius r with margin between them
	function ringR(count: number, itemR: number, margin: number): number {
		if (count <= 1) return 0;
		return ((itemR * 2 + margin) * count) / (2 * Math.PI);
	}

	// ── Layout ─────────────────────────────────────────────────
	const starAtoms = $derived(atoms.filter((a) => a.level === 'atom'));
	const domainList = $derived([...new Set(starAtoms.map((a) => a.domain))].sort());

	const layout = $derived.by(() => {
		const pos = new Map<string, { x: number; y: number }>();
		const domainCenters = new Map<string, { x: number; y: number }>();
		const domainExtents = new Map<string, number>();
		const nd = domainList.length;

		// Pass 1: compute cluster sizes and domain extents
		const domainMeta = domainList.map((domain) => {
			const dAtoms = starAtoms.filter((a) => a.domain === domain);
			const subs = [...new Set(dAtoms.map((a) => a.subdomain ?? '_'))].sort();
			const subRadii = subs.map((sub) =>
				clusterR(dAtoms.filter((a) => (a.subdomain ?? '_') === sub).length)
			);
			const maxSubR = subRadii.length ? Math.max(...subRadii) : 0;
			const subRing = ringR(subs.length, maxSubR, 32);
			const extent = subRing + maxSubR;
			return { domain, dAtoms, subs, subRing, extent };
		});

		// Pass 2: place domain centers dynamically
		const maxExtent = domainMeta.length ? Math.max(...domainMeta.map((d) => d.extent)) : 0;
		const domRing = nd <= 1 ? 0 : ringR(nd, maxExtent, 60);

		domainList.forEach((domain, di) => {
			const angle = (2 * Math.PI * di) / nd - Math.PI / 2;
			domainCenters.set(domain, {
				x: CX + domRing * Math.cos(angle),
				y: CY + domRing * Math.sin(angle)
			});
			domainExtents.set(domain, domainMeta.find((d) => d.domain === domain)?.extent ?? 0);
		});

		// Pass 3: Gaussian placement + repulsion within each subdomain
		for (const { domain, dAtoms, subs, subRing } of domainMeta) {
			const dc = domainCenters.get(domain)!;
			const ns = subs.length;

			subs.forEach((sub, si) => {
				let scx: number, scy: number;
				if (ns <= 1) {
					scx = dc.x; scy = dc.y;
				} else {
					const angle = (2 * Math.PI * si) / ns - Math.PI / 2;
					scx = dc.x + subRing * Math.cos(angle);
					scy = dc.y + subRing * Math.sin(angle);
				}

				const subAtoms = dAtoms.filter((a) => (a.subdomain ?? '_') === sub);
				const na = subAtoms.length;

				if (na <= 1) {
					if (subAtoms[0]) pos.set(subAtoms[0].id, { x: scx, y: scy });
					return;
				}

				// Place with Gaussian distribution (Box-Muller, seeded per atom)
				const sigma = Math.max(MIN_DIST * 0.7, MIN_DIST * 0.45 * Math.sqrt(na));
				const pts = subAtoms.map((atom) => {
					const r = rng(djb2(atom.id));
					const u1 = Math.max(1e-10, r());
					const u2 = r();
					const mag = Math.sqrt(-2 * Math.log(u1));
					return {
						id: atom.id,
						x: scx + mag * Math.cos(2 * Math.PI * u2) * sigma,
						y: scy + mag * Math.sin(2 * Math.PI * u2) * sigma
					};
				});

				// Repulsion pass: push overlapping stars apart until resolved
				for (let iter = 0; iter < 25; iter++) {
					let moved = false;
					for (let i = 0; i < pts.length; i++) {
						for (let j = i + 1; j < pts.length; j++) {
							const dx = pts[j].x - pts[i].x;
							const dy = pts[j].y - pts[i].y;
							const d = Math.sqrt(dx * dx + dy * dy) || 0.001;
							if (d < MIN_DIST) {
								const push = (MIN_DIST - d) / 2 + 0.5;
								const nx = dx / d, ny = dy / d;
								pts[i].x -= nx * push;
								pts[i].y -= ny * push;
								pts[j].x += nx * push;
								pts[j].y += ny * push;
								moved = true;
							}
						}
					}
					if (!moved) break;
				}

				for (const p of pts) pos.set(p.id, { x: p.x, y: p.y });
			});
		}

		return { pos, domainCenters, domainExtents };
	});

	// ── Stars with positions & status ─────────────────────────
	const stars = $derived(
		starAtoms.map((a) => ({
			...a,
			x: layout.pos.get(a.id)?.x ?? CX,
			y: layout.pos.get(a.id)?.y ?? CY,
			status: a.isMastered ? ('mastered' as const) : a.isActive ? ('active' as const) : ('locked' as const)
		}))
	);

	// ── Constellation lines ────────────────────────────────────
	const constellationLines = $derived.by(() => {
		const result: { x1: number; y1: number; x2: number; y2: number; op: number }[] = [];
		const byGroup = new Map<string, typeof stars>();
		for (const s of stars) {
			if (s.status === 'locked') continue;
			const key = `${s.domain}/${s.subdomain ?? '_'}`;
			if (!byGroup.has(key)) byGroup.set(key, []);
			byGroup.get(key)!.push(s);
		}
		for (const [, group] of byGroup) {
			if (group.length < 2) continue;
			const gx = group.reduce((s, a) => s + a.x, 0) / group.length;
			const gy = group.reduce((s, a) => s + a.y, 0) / group.length;
			const sorted = [...group].sort(
				(a, b) => Math.atan2(a.y - gy, a.x - gx) - Math.atan2(b.y - gy, b.x - gx)
			);
			for (let i = 0; i < sorted.length; i++) {
				const a = sorted[i];
				const b = sorted[(i + 1) % sorted.length];
				const bothMastered = a.status === 'mastered' && b.status === 'mastered';
				result.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, op: bothMastered ? 0.38 : 0.16 });
			}
		}
		return result;
	});

	// ── Fog patches over locked subdomain areas ────────────────
	const fogPatches = $derived.by(() => {
		const patches: { x: number; y: number; r: number; opacity: number }[] = [];
		for (const domain of domainList) {
			const dAtoms = starAtoms.filter((a) => a.domain === domain);
			const subs = [...new Set(dAtoms.map((a) => a.subdomain ?? '_'))];
			for (const sub of subs) {
				const subAtoms = dAtoms.filter((a) => (a.subdomain ?? '_') === sub);
				const lockedFrac =
					subAtoms.filter((a) => !a.isActive && !a.isMastered).length / subAtoms.length;
				if (lockedFrac < 0.4) continue;
				const pts = subAtoms.map((a) => layout.pos.get(a.id) ?? { x: CX, y: CY });
				const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
				const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
				const maxDist = Math.max(...pts.map((p) => Math.hypot(p.x - cx, p.y - cy)));
				patches.push({
					x: cx,
					y: cy,
					r: Math.max(55, maxDist + 50),
					opacity: 0.55 + lockedFrac * 0.35
				});
			}
		}
		return patches;
	});

	// ── Domain labels ──────────────────────────────────────────
	const domainLabels = $derived(
		domainList.map((d) => {
			const c = layout.domainCenters.get(d) ?? { x: CX, y: CY };
			const angle = Math.atan2(c.y - CY, c.x - CX);
			const extent = layout.domainExtents.get(d) ?? 0;
			const pushOut = extent + 28;
			return {
				name: d.toUpperCase(),
				x: c.x + pushOut * Math.cos(angle),
				y: c.y + pushOut * Math.sin(angle)
			};
		})
	);


	// ── Pan / zoom via viewBox ─────────────────────────────────
	let vx = $state(0);
	let vy = $state(0);
	let vw = $state(VW);
	let vh = $state(VH);
	let svgEl = $state<SVGSVGElement | null>(null);
	let containerW = $state(360);
	let containerH = $state(360);

	onMount(() => {
		if (stars.length === 0) return;
		let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
		for (const s of stars) {
			minX = Math.min(minX, s.x);
			minY = Math.min(minY, s.y);
			maxX = Math.max(maxX, s.x);
			maxY = Math.max(maxY, s.y);
		}
		// Include label positions
		for (const lbl of domainLabels) {
			minX = Math.min(minX, lbl.x - 80);
			minY = Math.min(minY, lbl.y - 16);
			maxX = Math.max(maxX, lbl.x + 80);
			maxY = Math.max(maxY, lbl.y + 16);
		}
		const pad = 80;
		const rawW = maxX - minX + 2 * pad;
		const rawH = maxY - minY + 2 * pad;
		const size = Math.max(rawW, rawH);
		vw = vh = size;
		vx = minX - pad - (size - rawW) / 2;
		vy = minY - pad - (size - rawH) / 2;
	});

	// Pointer tracking for pan + pinch
	let pointerCache = new Map<number, PointerEvent>();
	let lastPinchDist = 0;
	let pointerMoved = false;
	let dragStart = { x: 0, y: 0 };

	function onPtrDown(e: PointerEvent) {
		pointerCache.set(e.pointerId, e);
		(e.currentTarget as SVGElement).setPointerCapture(e.pointerId);
		dragStart = { x: e.clientX, y: e.clientY };
		pointerMoved = false;
		if (pointerCache.size === 2) {
			const pts = [...pointerCache.values()];
			lastPinchDist = Math.hypot(
				pts[0].clientX - pts[1].clientX,
				pts[0].clientY - pts[1].clientY
			);
		}
	}

	function onPtrMove(e: PointerEvent) {
		const prev = pointerCache.get(e.pointerId);
		if (!prev) return; // not pressed down — ignore hover
		pointerCache.set(e.pointerId, e);

		if (pointerCache.size === 1 && prev) {
			const dx = e.clientX - prev.clientX;
			const dy = e.clientY - prev.clientY;
			if (Math.abs(e.clientX - dragStart.x) > 4 || Math.abs(e.clientY - dragStart.y) > 4) {
				pointerMoved = true;
			}
			vx -= (dx / containerW) * vw;
			vy -= (dy / containerH) * vh;
		} else if (pointerCache.size === 2) {
			const pts = [...pointerCache.values()];
			const dist = Math.hypot(
				pts[0].clientX - pts[1].clientX,
				pts[0].clientY - pts[1].clientY
			);
			if (lastPinchDist > 0 && dist > 0) {
				const factor = lastPinchDist / dist;
				const mcx = (pts[0].clientX + pts[1].clientX) / 2;
				const mcy = (pts[0].clientY + pts[1].clientY) / 2;
				const mx = vx + (mcx / containerW) * vw;
				const my = vy + (mcy / containerH) * vh;
				vw = Math.min(VW * 3, Math.max(VW * 0.2, vw * factor));
				vh = vw;
				vx = mx - (mcx / containerW) * vw;
				vy = my - (mcy / containerH) * vh;
				pointerMoved = true;
			}
			lastPinchDist = dist;
		}
	}

	function onPtrUp(e: PointerEvent) {
		pointerCache.delete(e.pointerId);
		lastPinchDist = 0;
	}

	function onWheel(e: WheelEvent) {
		e.preventDefault();
		const factor = e.deltaY > 0 ? 1.12 : 0.88;
		const mx = vx + (e.offsetX / containerW) * vw;
		const my = vy + (e.offsetY / containerH) * vh;
		vw = Math.min(VW * 3, Math.max(VW * 0.2, vw * factor));
		vh = vw;
		vx = mx - (e.offsetX / containerW) * vw;
		vy = my - (e.offsetY / containerH) * vh;
	}

	function onKeyDown(e: KeyboardEvent) {
		const step = vw * 0.1;
		const zoom = (factor: number) => {
			const cx = vx + vw / 2;
			const cy = vy + vh / 2;
			vw = Math.min(VW * 3, Math.max(VW * 0.2, vw * factor));
			vh = vw;
			vx = cx - vw / 2;
			vy = cy - vh / 2;
		};
		switch (e.key) {
			case 'ArrowLeft': vx -= step; break;
			case 'ArrowRight': vx += step; break;
			case 'ArrowUp': vy -= step; break;
			case 'ArrowDown': vy += step; break;
			case '+': case '=': zoom(0.88); break;
			case '-': case '_': zoom(1.12); break;
			case 'Escape': tooltip = null; break;
			default: return;
		}
		e.preventDefault();
	}

	// ── Tooltip ────────────────────────────────────────────────
	let tooltip = $state<(typeof stars)[0] | null>(null);

	function svgPoint(e: MouseEvent | PointerEvent): { x: number; y: number } {
		const rect = svgEl!.getBoundingClientRect();
		return {
			x: vx + ((e.clientX - rect.left) / rect.width) * vw,
			y: vy + ((e.clientY - rect.top) / rect.height) * vh
		};
	}

	function onSvgClick(e: MouseEvent) {
		if (pointerMoved) return;
		const { x, y } = svgPoint(e);
		const tapR = (vw / containerW) * 18; // ~18px hit target in screen space
		const hit = stars.find((s) => {
			if (s.status === 'locked') return false;
			return Math.hypot(s.x - x, s.y - y) < tapR;
		});
		tooltip = hit && tooltip?.id !== hit.id ? hit : null;
	}

	function cap(s: string) {
		return s ? s[0].toUpperCase() + s.slice(1) : s;
	}
</script>

<div
	class="starmap-wrap"
	bind:clientWidth={containerW}
	bind:clientHeight={containerH}
>
	<!-- Pan/zoom canvas: role="application" is correct and keyboard support exists (onKeyDown),
	     but Svelte's linter treats that role as non-interactive. -->
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions, a11y_no_noninteractive_tabindex -->
	<svg
		bind:this={svgEl}
		class="starmap"
		viewBox="{vx} {vy} {vw} {vh}"
		onpointerdown={onPtrDown}
		onpointermove={onPtrMove}
		onpointerup={onPtrUp}
		onpointercancel={onPtrUp}
		onwheel={onWheel}
		onclick={onSvgClick}
		onkeydown={onKeyDown}
		role="application"
		tabindex="0"
		aria-label="Sternenkarte des Lernfortschritts – Pfeiltasten zum Verschieben, Plus/Minus zum Zoomen"
		style="cursor: grab; touch-action: none;"
	>
		<defs>
			<radialGradient id="sm-bg" cx="50%" cy="50%" r="50%">
				<stop offset="0%" stop-color="#0d1b35" />
				<stop offset="100%" stop-color="#020812" />
			</radialGradient>
			<filter id="sm-fog" x="-60%" y="-60%" width="220%" height="220%">
				<feGaussianBlur stdDeviation="28" />
			</filter>
			<filter id="sm-glow-gold" x="-120%" y="-120%" width="340%" height="340%">
				<feGaussianBlur stdDeviation="5" result="b" />
				<feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
			</filter>
			<filter id="sm-glow-blue" x="-80%" y="-80%" width="260%" height="260%">
				<feGaussianBlur stdDeviation="3" result="b" />
				<feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
			</filter>
		</defs>

		<!-- Background fills the whole viewport -->
		<rect x={vx} y={vy} width={vw} height={vh} fill="url(#sm-bg)" />

		<!-- Constellation lines -->
		{#each constellationLines as ln}
			<line
				x1={ln.x1}
				y1={ln.y1}
				x2={ln.x2}
				y2={ln.y2}
				stroke="#7dd3fc"
				stroke-width="1"
				opacity={ln.op}
			/>
		{/each}

		<!-- Fog patches over locked areas -->
		{#each fogPatches as patch}
			<ellipse
				cx={patch.x}
				cy={patch.y}
				rx={patch.r}
				ry={patch.r * 0.75}
				fill="#1a3a6e"
				opacity={patch.opacity}
				filter="url(#sm-fog)"
			/>
		{/each}

		<!-- Stars -->
		{#each stars as star}
			{#if star.status === 'mastered'}
				<circle cx={star.x} cy={star.y} r={22} fill="#f59e0b" opacity="0.10" />
				<circle cx={star.x} cy={star.y} r={13} fill="#fbbf24" opacity="0.20" />
				<circle
					cx={star.x}
					cy={star.y}
					r={star.mastery * 2.5 + 3.5}
					fill="#fef9c3"
					filter="url(#sm-glow-gold)"
				/>
			{:else if star.status === 'active'}
				<circle cx={star.x} cy={star.y} r={11} fill="#38bdf8" opacity="0.12" />
				<circle cx={star.x} cy={star.y} r={3.5} fill="#bae6fd" filter="url(#sm-glow-blue)" />
			{:else}
				<circle cx={star.x} cy={star.y} r={1.5} fill="#334155" opacity="0.28" />
			{/if}
		{/each}

		<!-- Tooltip indicator ring -->
		{#if tooltip}
			<circle
				cx={tooltip.x}
				cy={tooltip.y}
				r={tooltip.status === 'mastered' ? 20 : 14}
				fill="none"
				stroke="#fff"
				stroke-width="1.5"
				opacity="0.6"
			/>
		{/if}

		<!-- Domain labels -->
		{#each domainLabels as lbl}
			<text
				x={lbl.x}
				y={lbl.y}
				text-anchor="middle"
				dominant-baseline="middle"
				fill="#64748b"
				font-size="22"
				font-weight="700"
				font-family="system-ui, sans-serif"
				letter-spacing="3"
			>
				{lbl.name}
			</text>
		{/each}
	</svg>

	<!-- Tooltip card -->
	{#if tooltip}
		<div class="star-tooltip" class:mastered={tooltip.status === 'mastered'}>
			<div class="tt-name">{cap(tooltip.label)}</div>
			<div class="tt-domain">
				{cap(tooltip.domain)}{tooltip.subdomain ? ` · ${cap(tooltip.subdomain)}` : ''}
			</div>
			{#if tooltip.status === 'mastered'}
				<div class="tt-status gold">✓ Gemeistert</div>
			{:else}
				<div class="tt-status blue">
					{Math.round(tooltip.mastery * 100)}% – In Arbeit
				</div>
			{/if}
		</div>
	{/if}

	<div class="sm-hint">Ziehen · Zoomen · Tippen</div>
</div>

<style>
	.starmap-wrap {
		position: relative;
		width: 100%;
		border-radius: 14px;
		overflow: hidden;
		background: #020812;
		aspect-ratio: 1 / 1;
		max-height: 72vh;
		box-shadow: 0 4px 24px rgba(0, 0, 0, 0.5);
	}

	.starmap {
		width: 100%;
		height: 100%;
		display: block;
		user-select: none;
		-webkit-user-select: none;
	}

	.star-tooltip {
		position: absolute;
		bottom: 1rem;
		left: 50%;
		transform: translateX(-50%);
		min-width: 170px;
		background: rgba(6, 13, 30, 0.92);
		border: 1px solid rgba(125, 211, 252, 0.25);
		border-radius: 10px;
		padding: 0.6rem 1rem 0.65rem;
		text-align: center;
		pointer-events: none;
		backdrop-filter: blur(10px);
	}

	.star-tooltip.mastered {
		border-color: rgba(251, 191, 36, 0.35);
	}

	.tt-name {
		font-size: 0.9rem;
		font-weight: 700;
		color: #f1f5f9;
		line-height: 1.3;
	}

	.tt-domain {
		font-size: 0.68rem;
		color: #64748b;
		margin: 2px 0 6px;
	}

	.tt-status {
		display: inline-block;
		font-size: 0.72rem;
		font-weight: 600;
		border-radius: 999px;
		padding: 0.15rem 0.7rem;
	}

	.tt-status.gold {
		background: rgba(251, 191, 36, 0.18);
		color: #fbbf24;
	}

	.tt-status.blue {
		background: rgba(56, 189, 248, 0.18);
		color: #7dd3fc;
	}

	.sm-hint {
		position: absolute;
		bottom: 0.35rem;
		right: 0.65rem;
		font-size: 0.58rem;
		color: rgba(100, 116, 139, 0.55);
		pointer-events: none;
		letter-spacing: 0.03em;
	}
</style>
