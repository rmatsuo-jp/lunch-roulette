/**
 * @file `ReleaseNotesService` の回帰テスト。
 * CHANGELOG.md は semantic-release が生成する外部入力（CRLF・コミットリンク付き）であり、
 * パースが崩れると新機能モーダルが黙って空になるため、見出し・本文抽出と既読判定を検証する。
 */
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReleaseNotesService } from './release-notes.service';

const SEEN_KEY = 'lunch-roulette.release-notes.v1';

// semantic-release が実際に出力する形式（CRLF・`# [x.y.z](link) (date)` 見出し・末尾のコミットリンク）
const CHANGELOG = [
  '# [1.1.0](https://example.com/compare/v1.0.0...v1.1.0) (2026-08-10)',
  '',
  '### Features',
  '',
  '* 気分タグでの絞り込みを追加 ([#12](https://example.com/pull/12))',
  '',
  '### Bug Fixes',
  '',
  '* 距離順ソートの誤差を修正 ([abc1234](https://example.com/commit/abc1234))',
  '',
  '## [1.0.1](https://example.com/compare/v1.0.0...v1.0.1) (2026-08-01)',
  '',
  '### Bug Fixes',
  '',
  '* CSV取込の列ズレを修正',
  '',
].join('\r\n');

function mockFetch(body: string, ok = true) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok, text: () => Promise.resolve(body) } as Response),
  );
}

describe('ReleaseNotesService', () => {
  let service: ReleaseNotesService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(ReleaseNotesService);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('CHANGELOG.md をバージョンごとにパースする（CRLF・コミットリンク除去込み）', async () => {
    mockFetch(CHANGELOG);

    const notes = await service.getAllNotes();

    expect(notes.map((n) => n.version)).toEqual(['1.1.0', '1.0.1']);
    expect(notes[0].date).toBe('2026-08-10');
    expect(notes[0].features).toEqual(['気分タグでの絞り込みを追加']);
    expect(notes[0].fixes).toEqual(['距離順ソートの誤差を修正']);
    expect(notes[1].features).toEqual([]);
    expect(notes[1].fixes).toEqual(['CSV取込の列ズレを修正']);
  });

  it('初回起動時は何も表示せず、現在バージョンを既読として記録する', async () => {
    mockFetch(CHANGELOG);

    expect(await service.getUnseenNotes('1.1.0')).toEqual([]);
    expect(JSON.parse(localStorage.getItem(SEEN_KEY)!)).toEqual({ lastSeenVersion: '1.1.0' });
  });

  it('既読バージョンより新しい分だけ返す', async () => {
    mockFetch(CHANGELOG);
    service.markSeen('1.0.1');

    const unseen = await service.getUnseenNotes('1.1.0');

    expect(unseen.map((n) => n.version)).toEqual(['1.1.0']);
  });

  it('最新まで既読なら空配列を返す', async () => {
    mockFetch(CHANGELOG);
    service.markSeen('1.1.0');

    expect(await service.getUnseenNotes('1.1.0')).toEqual([]);
  });

  it('CHANGELOG.md を取得できない場合は空配列を返す', async () => {
    mockFetch('', false);

    expect(await service.getAllNotes()).toEqual([]);
  });

  it('fetch が例外を投げても空配列を返す', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(await service.getAllNotes()).toEqual([]);
  });
});
