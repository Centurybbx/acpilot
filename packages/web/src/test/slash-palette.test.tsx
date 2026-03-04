import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SlashPalette } from '../components/controls/SlashPalette.js';

describe('SlashPalette', () => {
  it('deduplicates commands with the same name', () => {
    render(
      <SlashPalette
        commands={[
          { name: 'skill-creator', description: 'first' },
          { name: 'skill-creator', description: 'second' },
          { name: 'review', description: 'review code' }
        ]}
        onSelect={() => {}}
      />
    );

    const buttons = screen.getAllByRole('button');
    expect(buttons.map((button) => button.textContent)).toEqual([
      '/ skill-creator',
      '/ review'
    ]);
  });
});
