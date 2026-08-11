/**
 * @file `CsvImport` の回帰テスト。
 * Google Takeout 保存リスト CSV の代表パターン（欠損フィールド、説明行付き、複数ファイルの結合）を検証する。
 */
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { CsvImport } from './csv-import';

describe('CsvImport', () => {
  let csv: CsvImport;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    csv = TestBed.inject(CsvImport);
  });

  describe('parseText', () => {
    it('標準的な Title,Note,URL を変換する', () => {
      const text = ['Title,Note,URL', 'ラーメン太郎,昼は行列,https://maps.example/1'].join('\n');
      const result = csv.parseText(text, '新宿');

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        name: 'ラーメン太郎',
        note: '昼は行列',
        url: 'https://maps.example/1',
        area: '新宿',
        genres: [],
        moods: [],
      });
      expect(result[0].id).toBeTruthy();
    });

    it('id は行ごとに一意に採番される', () => {
      const text = ['Title,Note,URL', 'A店,,', 'B店,,'].join('\n');
      const result = csv.parseText(text, '新宿');
      expect(result[0].id).not.toBe(result[1].id);
    });

    it('note / url が空なら undefined になる', () => {
      const text = ['Title,Note,URL', 'そば次郎,,'].join('\n');
      const result = csv.parseText(text, '渋谷');

      expect(result).toHaveLength(1);
      expect(result[0].note).toBeUndefined();
      expect(result[0].url).toBeUndefined();
    });

    it('店名が空の行はスキップする', () => {
      const text = ['Title,Note,URL', ',メモだけ,https://maps.example/1', '有効な店,,'].join('\n');
      const result = csv.parseText(text, '渋谷');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('有効な店');
    });

    it('ヘッダーの前に説明行がある形式でもヘッダー行から解析する', () => {
      const text = [
        'このリストは Google マップからエクスポートされました',
        '',
        'Title,Note,URL',
        'カレー三郎,,https://maps.example/3',
      ].join('\n');
      const result = csv.parseText(text, '池袋');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('カレー三郎');
      expect(result[0].url).toBe('https://maps.example/3');
    });

    it('ヘッダーの大文字小文字・前後空白を吸収する', () => {
      const text = [' TITLE , NOTE , URL ', '定食四郎,日替わり,https://maps.example/4'].join('\n');
      const result = csv.parseText(text, '品川');

      expect(result[0]).toMatchObject({
        name: '定食四郎',
        note: '日替わり',
        url: 'https://maps.example/4',
      });
    });

    it('日本語ヘッダー（店名/メモ/リンク）にも対応する', () => {
      const text = ['店名,メモ,リンク', '和食五郎,予約推奨,https://maps.example/5'].join('\n');
      const result = csv.parseText(text, '銀座');

      expect(result[0]).toMatchObject({
        name: '和食五郎',
        note: '予約推奨',
        url: 'https://maps.example/5',
      });
    });

    it('値の前後の空白は除去される', () => {
      const text = ['Title,Note,URL', '  寿司六郎  ,  夜のみ  ,  https://maps.example/6  '].join(
        '\n',
      );
      const result = csv.parseText(text, '築地');

      expect(result[0]).toMatchObject({
        name: '寿司六郎',
        note: '夜のみ',
        url: 'https://maps.example/6',
      });
    });

    it('データ行が無ければ空配列を返す', () => {
      expect(csv.parseText('Title,Note,URL', '新宿')).toEqual([]);
    });

    it('ジャンル・気分は取り込み時点では未設定（空配列）', () => {
      const result = csv.parseText(['Title,Note,URL', '七郎食堂,,'].join('\n'), '新宿');
      expect(result[0].genres).toEqual([]);
      expect(result[0].moods).toEqual([]);
    });
  });

  describe('parseFile / parseFiles', () => {
    /** テキストから File を作るヘルパー。 */
    function makeFile(name: string, lines: string[]): File {
      return new File([lines.join('\n')], name, { type: 'text/csv' });
    }

    it('エリアはファイル名（拡張子を除いたもの）になる', async () => {
      const file = makeFile('新宿ランチ.csv', ['Title,Note,URL', 'A店,,']);
      const result = await csv.parseFile(file);

      expect(result).toHaveLength(1);
      expect(result[0].area).toBe('新宿ランチ');
    });

    it('拡張子しか無いファイル名なら「未分類」になる', async () => {
      const file = makeFile('.csv', ['Title,Note,URL', 'A店,,']);
      const result = await csv.parseFile(file);

      expect(result[0].area).toBe('未分類');
    });

    it('複数ファイルを結合し、それぞれのエリアを保持する', async () => {
      const files = [
        makeFile('新宿.csv', ['Title,Note,URL', 'A店,,', 'B店,,']),
        makeFile('渋谷.csv', ['Title,Note,URL', 'C店,,']),
      ];
      const result = await csv.parseFiles(files);

      expect(result).toHaveLength(3);
      expect(result.map((r) => r.name)).toEqual(['A店', 'B店', 'C店']);
      expect(result.map((r) => r.area)).toEqual(['新宿', '新宿', '渋谷']);
    });
  });

  describe('パース警告', () => {
    it('正常な CSV では警告が出ない', () => {
      const result = csv.parseTextDetailed(['Title,Note,URL', 'A店,,'].join('\n'), '新宿');

      expect(result.warnings).toEqual([]);
      expect(result.restaurants).toHaveLength(1);
    });

    it('列数が合わない行は警告として報告される', () => {
      // 列ズレを黙って捨てると「N件取り込みました」と表示され、欠落に気付けない
      const result = csv.parseTextDetailed(
        ['Title,Note,URL', 'A店,メモ,https://example.com,余計な列'].join('\n'),
        '新宿',
      );

      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('警告が多すぎる場合は先頭数件＋残件数にまとめる', () => {
      const rows = Array.from({ length: 10 }, (_, i) => `店${i},メモ,url,余計な列`);
      const result = csv.parseTextDetailed(['Title,Note,URL', ...rows].join('\n'), '新宿');

      expect(result.warnings.length).toBeLessThanOrEqual(4);
      expect(result.warnings.at(-1)).toContain('ほか');
    });

    it('ファイル単位の警告にはファイル名が付く', async () => {
      const file = new File(['Title,Note,URL\nA店,メモ,url,余計な列'], '新宿.csv', {
        type: 'text/csv',
      });
      const result = await csv.parseFileDetailed(file);

      expect(result.warnings[0]).toContain('新宿.csv');
    });
  });

  describe('ヘッダー行の検出', () => {
    it('クォート内にカンマを含む説明行をヘッダーと誤認しない', () => {
      const text = ['"このリストは、恵比寿のランチ候補です"', 'Title,Note,URL', 'A店,,'].join('\n');

      const result = csv.parseText(text, '恵比寿');

      expect(result.map((r) => r.name)).toEqual(['A店']);
    });
  });
});
