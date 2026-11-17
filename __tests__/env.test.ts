import { palette } from '@/theme/palette';

describe('design tokens', () => {
  it('defines matching dark and light palettes', () => {
    expect(Object.keys(palette.dark).sort()).toEqual(Object.keys(palette.light).sort());
    expect(palette.accent).toMatch(/^#[0-9A-F]{6}$/i);
  });
});
