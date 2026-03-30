export enum ScrollDirection {
	UP,
	DOWN,
	LEFT,
	RIGHT,
	HOME,
	END,
}

export function applyScroll(
	direction: ScrollDirection,
	scrollY: number,
	scrollX: number,
	maxY: number,
): { scrollY: number; scrollX: number } {
	switch (direction) {
		case ScrollDirection.UP:
			return { scrollY: Math.max(0, scrollY - 1), scrollX };
		case ScrollDirection.DOWN:
			return { scrollY: Math.min(maxY, scrollY + 1), scrollX };
		case ScrollDirection.LEFT:
			return { scrollY, scrollX: Math.max(0, scrollX - 4) };
		case ScrollDirection.RIGHT:
			return { scrollY, scrollX: scrollX + 4 };
		case ScrollDirection.HOME:
			return { scrollY: 0, scrollX };
		case ScrollDirection.END:
			return { scrollY: maxY, scrollX };
	}
}
