import { describe, it, expect } from 'vitest';
import { Box, HBox, VBox } from '../../js/ui/layout.js';

class FakeWidget {
  constructor(w, h) { this.x = 0; this.y = 0; this.w = w; this.h = h; this.visible = true; }
  remeasure() {}
}

describe('cross-axis stretch', () => {
  it('VBox stretches leaf w to container width', () => {
    const row1 = HBox([new FakeWidget(60, 7), new FakeWidget(20, 9)]); // w=84
    const sep = new FakeWidget(0, 1); // HSep w=0
    const row2 = HBox([new FakeWidget(60, 7), new FakeWidget(80, 9), new FakeWidget(30, 7)]); // w=178

    const root = VBox([row1, sep, row2]);
    root.layout(2, 2);
    expect(sep.w).toBe(178);
  });

  it('VBox shrinks leaf w when wider row is hidden (self-referential fix)', () => {
    const row1 = HBox([new FakeWidget(60, 7), new FakeWidget(20, 9)]); // w=84
    const sep = new FakeWidget(0, 1);
    const row2 = HBox([new FakeWidget(60, 7), new FakeWidget(80, 9), new FakeWidget(30, 7)]); // w=178

    const root = VBox([row1, sep, row2]);
    root.layout(2, 2);
    expect(sep.w).toBe(178);

    // Hide the wide row, re-layout
    row2.visible = false;
    root.layout(2, 2);

    // sep.w should shrink to row1's width (84), not stay at 178
    expect(sep.w).toBe(84);
    expect(root.w).toBe(84);
  });

  it('VBox respects external width changes between layouts', () => {
    const row = HBox([new FakeWidget(50, 7)]);  // w=50
    const leaf = new FakeWidget(10, 5);

    const root = VBox([row, leaf]);
    root.layout(0, 0);
    expect(leaf.w).toBe(50); // stretched

    // Simulate external width change (e.g. setLabel)
    leaf.w = 30;

    root.layout(0, 0);
    // Natural width is now 30 (changed externally), but row is 50, so stretch to 50
    expect(leaf.w).toBe(50);
  });

  it('HBox stretches leaf h to container height', () => {
    const tall = new FakeWidget(20, 15);
    const short = new FakeWidget(30, 7);

    const row = HBox([tall, short]);
    row.layout(0, 0);
    expect(short.h).toBe(15); // stretched to tall's height
  });

  it('HBox shrinks leaf h when taller child is hidden', () => {
    const tall = new FakeWidget(20, 15);
    const medium = new FakeWidget(30, 9);
    const short = new FakeWidget(10, 5);

    const row = HBox([tall, medium, short]);
    row.layout(0, 0);
    expect(short.h).toBe(15);

    tall.visible = false;
    row.layout(0, 0);
    expect(short.h).toBe(9); // shrink to medium's height
  });
});
