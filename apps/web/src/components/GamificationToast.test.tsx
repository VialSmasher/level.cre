import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { GamificationToast } from './GamificationToast';

test('GamificationToast renders xp text', () => {
  const html = renderToStaticMarkup(<GamificationToast xp={25} />);
  assert.match(html, /\+25 XP/);
});

test('GamificationToast renders label when provided', () => {
  const html = renderToStaticMarkup(<GamificationToast xp={15} label="Call logged" />);
  assert.match(html, /Call logged \+15 XP/);
});
