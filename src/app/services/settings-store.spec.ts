/**
 * @file `SettingsStore` の回帰テスト。
 * 特に昼休み分数のバリデーションを検証する。空欄の number 入力から渡る NaN を保存すると、
 * 営業時間フィルタの `remaining < NaN` が常に false になり、フィルタが黙って無効化されるため。
 */
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  MAX_LUNCH_BREAK_MINUTES,
  SettingsStore,
  normalizeLunchBreakMinutes,
} from './settings-store';

const STORAGE_KEY = 'lunch-roulette.settings.v1';
const DEFAULT_MINUTES = 60;

describe('normalizeLunchBreakMinutes', () => {
  it('NaN は既定値へフォールバックする', () => {
    expect(normalizeLunchBreakMinutes(NaN)).toBe(DEFAULT_MINUTES);
  });

  it('Infinity も既定値へフォールバックする', () => {
    expect(normalizeLunchBreakMinutes(Infinity)).toBe(DEFAULT_MINUTES);
  });

  it('負の値は 0 に丸める', () => {
    expect(normalizeLunchBreakMinutes(-30)).toBe(0);
  });

  it('上限を超える値はクランプする', () => {
    expect(normalizeLunchBreakMinutes(10_000)).toBe(MAX_LUNCH_BREAK_MINUTES);
  });

  it('小数は切り捨てる', () => {
    expect(normalizeLunchBreakMinutes(45.9)).toBe(45);
  });

  it('正常な値はそのまま通す', () => {
    expect(normalizeLunchBreakMinutes(45)).toBe(45);
  });
});

describe('SettingsStore', () => {
  let settings: SettingsStore;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    settings = TestBed.inject(SettingsStore);
  });

  it('不正な昼休み分数は保存されない', () => {
    settings.setLunchBreakMinutes(NaN);
    expect(settings.lunchBreakMinutes()).toBe(DEFAULT_MINUTES);
  });

  it('保存済みの不正値は読み込み時に是正される', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 3, googleMapsApiKey: '', theme: 'system', lunchBreakMinutes: null }),
    );

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const restored = TestBed.inject(SettingsStore);

    expect(restored.lunchBreakMinutes()).toBe(DEFAULT_MINUTES);
  });

  it('APIキーは前後の空白を除去して保存する', () => {
    settings.setGoogleMapsApiKey('  abc  ');
    expect(settings.googleMapsApiKey()).toBe('abc');
  });
});
