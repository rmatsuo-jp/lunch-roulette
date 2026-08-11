/**
 * @file ホワイトリストの回帰テスト。
 *
 * クライアント（auth.constants.ts）と Firestore ルール（firestore.rules）の
 * 許可メール一覧が一致するかは、ビルダーが .rules を読み込めないためここでは検証できない。
 * その突き合わせは `scripts/check-whitelist.mjs`（`npm run check:whitelist`、pretest で自動実行）
 * が担当する。
 */
import { describe, expect, it } from 'vitest';
import { ALLOWED_SYNC_EMAILS, isAllowedSyncUser } from './auth.constants';

describe('ホワイトリスト', () => {
  it('空でない（誤って全員拒否になっていない）', () => {
    expect(ALLOWED_SYNC_EMAILS.length).toBeGreaterThan(0);
  });
});

describe('isAllowedSyncUser', () => {
  it('許可メールなら true', () => {
    expect(isAllowedSyncUser(ALLOWED_SYNC_EMAILS[0])).toBe(true);
  });

  it('未許可メールは false', () => {
    expect(isAllowedSyncUser('stranger@example.com')).toBe(false);
  });

  it('null / undefined / 空文字は false', () => {
    expect(isAllowedSyncUser(null)).toBe(false);
    expect(isAllowedSyncUser(undefined)).toBe(false);
    expect(isAllowedSyncUser('')).toBe(false);
  });
});
