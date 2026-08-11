import { Injectable } from '@angular/core';
import Papa from 'papaparse';
import { Restaurant } from '@shared/models/restaurant';

/** 取り込み結果。`warnings` はパースで問題があった行の説明（空なら正常）。 */
export interface CsvImportResult {
  restaurants: Restaurant[];
  warnings: string[];
}

/** 警告として表示する最大件数（壊れた CSV で大量に出るのを防ぐ）。 */
const MAX_REPORTED_WARNINGS = 3;

/** 店名列として認識する候補キー（ヘッダー行の判定・値の抽出の両方で使う）。 */
const NAME_COLUMN_KEYS = ['title', 'name', 'タイトル', '名前', '店名'];

/**
 * Google Takeout（保存済みリスト）の CSV を Restaurant[] へ変換する。
 *
 * Takeout の CSV は基本 `Title, Note, URL` の3列。
 * エリアはファイル名（拡張子を除いたもの＝Google Map のリスト名）から決める。
 * ジャンルは取り込み時点では未設定（空配列）とし、手動タグ付け、または
 * データ管理画面での Places API 取得（`places-genre-map.ts`）で後から付与する。
 */
@Injectable({ providedIn: 'root' })
export class CsvImport {
  /** 複数ファイルをまとめて取り込む（警告は破棄）。 */
  async parseFiles(files: FileList | File[]): Promise<Restaurant[]> {
    return (await this.parseFilesDetailed(files)).restaurants;
  }

  /** 複数ファイルをまとめて取り込み、パース警告も返す。 */
  async parseFilesDetailed(files: FileList | File[]): Promise<CsvImportResult> {
    const list = Array.from(files);
    const results = await Promise.all(list.map((f) => this.parseFileDetailed(f)));
    return {
      restaurants: results.flatMap((r) => r.restaurants),
      warnings: results.flatMap((r) => r.warnings),
    };
  }

  /** 1ファイルを取り込む（警告は破棄）。 */
  async parseFile(file: File): Promise<Restaurant[]> {
    return (await this.parseFileDetailed(file)).restaurants;
  }

  /** 1ファイルを取り込み、パース警告も返す。 */
  async parseFileDetailed(file: File): Promise<CsvImportResult> {
    const area = this.areaFromFileName(file.name);
    const text = await file.text();
    const result = this.parseTextDetailed(text, area);
    // どのファイルの警告か分かるようファイル名を添える
    return {
      restaurants: result.restaurants,
      warnings: result.warnings.map((w) => `${file.name}: ${w}`),
    };
  }

  /** CSV テキストを指定エリアの Restaurant[] へ変換する（警告は破棄）。 */
  parseText(text: string, area: string): Restaurant[] {
    return this.parseTextDetailed(text, area).restaurants;
  }

  /**
   * CSV テキストを指定エリアの Restaurant[] へ変換し、パース警告も返す。
   * papaparse の `errors` を無視すると、列がずれた壊れた CSV でも
   * 「N件を取り込みました」と成功表示され、欠落に気付けないため。
   */
  parseTextDetailed(text: string, area: string): CsvImportResult {
    // 説明文や空行が先頭にある CSV にも対応するため、本当のヘッダー行から解析を始める。
    const body = this.sliceFromHeader(text);
    const parsed = Papa.parse<Record<string, string>>(body, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase(),
    });

    const warnings = this.describeParseErrors(parsed.errors ?? []);
    const rows = parsed.data ?? [];
    const out: Restaurant[] = [];
    for (const row of rows) {
      const name = this.pick(row, NAME_COLUMN_KEYS);
      if (!name) continue; // 店名が無い行はスキップ
      out.push({
        id: crypto.randomUUID(),
        name,
        note: this.pick(row, ['note', 'comment', 'メモ', 'コメント']) || undefined,
        url: this.pick(row, ['url', 'link', 'リンク']) || undefined,
        area,
        genres: [],
        moods: [],
      });
    }
    return { restaurants: out, warnings };
  }

  /**
   * papaparse のエラーをユーザー向けの説明に変換する。
   * 件数が多いと通知に収まらないため先頭数件に絞り、残りは件数だけ伝える。
   */
  private describeParseErrors(errors: Papa.ParseError[]): string[] {
    if (errors.length === 0) return [];
    const head = errors.slice(0, MAX_REPORTED_WARNINGS).map((e) => {
      // row は 0 始まり。ヘッダー行を含む見た目の行番号に合わせる。
      const line = typeof e.row === 'number' ? `${e.row + 2}行目` : '不明な行';
      return `${line}: ${e.message}`;
    });
    const rest = errors.length - head.length;
    return rest > 0 ? [...head, `ほか ${rest} 件の問題があります`] : head;
  }

  /**
   * 本当のヘッダー行から始まるテキストへ切り詰める。
   * Google 標準形式（1行目がヘッダー）はそのまま、
   * 先頭に説明文や空行がある形式では該当行以前を読み飛ばす。
   */
  private sliceFromHeader(text: string): string {
    const lines = text.split(/\r?\n/);
    // 既知の列名のいずれかを含む最初の行をヘッダーとみなす（店名列 + url列）。
    const headerKeys = [...NAME_COLUMN_KEYS, 'url'];
    const idx = lines.findIndex((line) => {
      // 素朴なカンマ分割だと `"店名, 住所"` のようなクォート内カンマを誤って分割するため、
      // 1行だけ papaparse に通して正しくセルへ分解する。
      const cells = (Papa.parse<string[]>(line).data[0] ?? []).map((c) =>
        c.trim().toLowerCase(),
      );
      return cells.some((c) => headerKeys.includes(c));
    });
    // 見つからなければ元テキストをそのまま返す（従来動作を維持）。
    return idx <= 0 ? text : lines.slice(idx).join('\n');
  }

  /** ファイル名からエリア名を作る（拡張子除去）。 */
  private areaFromFileName(fileName: string): string {
    const base = fileName.replace(/\.[^.]+$/, '').trim();
    return base || '未分類';
  }

  /** 候補キーのうち最初に見つかった非空値を返す。 */
  private pick(row: Record<string, string>, keys: string[]): string {
    for (const k of keys) {
      const v = row[k];
      if (v && v.trim()) return v.trim();
    }
    return '';
  }
}
