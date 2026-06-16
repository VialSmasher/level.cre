import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { GamificationToast } from './GamificationToast';

test('GamificationToast renders operational confirmation', () => {
  const html = renderToStaticMarkup(<GamificationToast xp={25} />);
  assert.match(html, /Activity saved/);
  assert.doesNotMatch(html, /XP/);
});

test('GamificationToast renders label when provided without xp copy', () => {
  const html = renderToStaticMarkup(<GamificationToast xp={15} label="Call logged" />);
  assert.match(html, /Call logged/);
  assert.doesNotMatch(html, /XP/);
});
