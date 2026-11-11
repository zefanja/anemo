<script lang="ts">
	let {
		totalSections = 10,
		value = $bindable(''),
		disabled = false,
		onsubmit
	}: {
		totalSections: number;
		value: string;
		disabled?: boolean;
		onsubmit?: () => void;
	} = $props();

	const W = 340, H = 92;
	const lineY = 62;
	const x0 = 22, x1 = 308;
	const linePx = x1 - x0;

	const d = $derived(totalSections / 2);
	const step = $derived(linePx / totalSections);
	const tickIndices = $derived(Array.from({ length: totalSections + 1 }, (_, i) => i));

	let section = $state<number | null>(null);
	let isDragging = $state(false);
	let svgEl = $state<SVGSVGElement | null>(null);

	// Sync external reset
	$effect(() => {
		if (value === '') section = null;
	});

	const markerX = $derived(section !== null ? +(x0 + section * step).toFixed(1) : null);

	function sectionFromClientX(clientX: number): number {
		if (!svgEl) return 0;
		const rect = svgEl.getBoundingClientRect();
		const relX = ((clientX - rect.left) / rect.width) * W;
		return Math.round(Math.max(0, Math.min(totalSections, (relX - x0) / step)));
	}

	function handlePointerDown(e: PointerEvent) {
		if (disabled) return;
		e.preventDefault();
		(e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
		isDragging = true;
		const s = sectionFromClientX(e.clientX);
		section = s;
		value = String(s);
	}

	function handlePointerMove(e: PointerEvent) {
		if (!isDragging || disabled) return;
		e.preventDefault();
		const s = sectionFromClientX(e.clientX);
		section = s;
		value = String(s);
	}

	function handlePointerUp() {
		isDragging = false;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (disabled) return;
		if (e.key === 'ArrowLeft') {
			e.preventDefault();
			const cur = section ?? Math.floor(totalSections / 2);
			section = Math.max(0, cur - 1);
			value = String(section);
		} else if (e.key === 'ArrowRight') {
			e.preventDefault();
			const cur = section ?? Math.floor(totalSections / 2);
			section = Math.min(totalSections, cur + 1);
			value = String(section);
		} else if (e.key === 'Enter' && section !== null) {
			onsubmit?.();
		}
	}

	export function focus() {
		svgEl?.focus();
	}
</script>

<div class="nl-wrap">
	<!-- svelte-ignore a11y_interactive_supports_focus -->
	<svg
		bind:this={svgEl}
		viewBox="0 0 {W} {H}"
		class="nl-svg"
		class:dragging={isDragging}
		class:interactive={!disabled}
		tabindex={disabled ? -1 : 0}
		role="slider"
		aria-label="Zahlenstrahl: Bruch markieren"
		aria-valuemin={0}
		aria-valuemax={totalSections}
		aria-valuenow={section ?? 0}
		onpointerdown={handlePointerDown}
		onpointermove={handlePointerMove}
		onpointerup={handlePointerUp}
		onkeydown={handleKeydown}
	>
		<!-- Main line + right arrow -->
		<line x1={x0} y1={lineY} x2={x1} y2={lineY} stroke="#374151" stroke-width="2" stroke-linecap="round" />
		<polygon points={`${x1},${lineY - 5} ${x1 + 12},${lineY} ${x1},${lineY + 5}`} fill="#374151" />

		<!-- Ticks and labels -->
		{#each tickIndices as i}
			{@const tx = +(x0 + i * step).toFixed(1)}
			{@const isMajor = i % d === 0}
			{@const h = isMajor ? 12 : 7}
			<line
				x1={tx} y1={lineY - h} x2={tx} y2={lineY + h}
				stroke="#374151" stroke-width={isMajor ? 2 : 1.5}
			/>
			{#if isMajor}
				<text
					x={tx} y={lineY + h + 15}
					text-anchor="middle" font-size="14" font-weight="bold" fill="#374151"
					font-family="system-ui,-apple-system,sans-serif"
				>{i / d}</text>
			{/if}
		{/each}

		<!-- Draggable marker — only after first interaction -->
		{#if markerX !== null}
			{@const mx = markerX}
			<polygon
				points={`${mx - 8},${lineY - 28} ${mx + 8},${lineY - 28} ${mx},${lineY - 12}`}
				fill="#0b6bcb"
				style="pointer-events:none"
			/>
		{/if}
	</svg>

	{#if section === null && !disabled}
		<p class="drag-hint">Tippe auf den Zahlenstrahl oder ziehe den Pfeil an die richtige Stelle.</p>
	{/if}
</div>

<style>
	.nl-wrap {
		width: 100%;
	}

	.nl-svg {
		max-width: 100%;
		display: block;
		margin: 0 auto;
		touch-action: none;
		cursor: default;
	}

	.nl-svg.interactive {
		cursor: pointer;
	}

	.nl-svg.dragging {
		cursor: grabbing;
	}

	.nl-svg:focus {
		outline: 2px solid #0b6bcb;
		outline-offset: 4px;
		border-radius: 4px;
	}

	.drag-hint {
		text-align: center;
		color: #6b7280;
		font-size: 0.85rem;
		margin-top: 0.3rem;
	}
</style>
