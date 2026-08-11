/**
 * @file localStorage への安全な読み書きユーティリティ。
 * プライベートブラウズ等でストレージ操作が失敗しても例外を投げず、既定値やno-opにフォールバックする。
 *
 * ただし「静かに失敗する」だけだとデータ消失につながるため、
 * 呼び出し側が失敗を検知できる `readJsonResult` / `writeJson` の戻り値も提供する。
 * （保存済み JSON が壊れていた場合に既定値で上書きしてしまうと復旧手段が無くなる。）
 */

/** 読み込み結果。`ok:false` は「保存値はあるがパースに失敗した」＝データ破損を意味する。 */
export interface ReadResult<T> {
  ok: boolean;
  value: T;
  /** パースに失敗した生の文字列（復旧・退避用）。 */
  raw?: string;
}

/** キーからJSONを読み込み、成否と生データを含む結果を返す。 */
export function readJsonResult<T>(key: string, fallback: T): ReadResult<T> {
  let raw: string | null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    // ストレージ自体にアクセスできない（プライベートブラウズ等）。破損ではないので ok 扱い。
    return { ok: true, value: fallback };
  }
  if (!raw) return { ok: true, value: fallback };
  try {
    return { ok: true, value: JSON.parse(raw) as T };
  } catch {
    return { ok: false, value: fallback, raw };
  }
}

/** キーからJSONを読み込む。値が無い・パース失敗時は fallback を返す。 */
export function readJson<T>(key: string, fallback: T): T {
  return readJsonResult(key, fallback).value;
}

/**
 * キーへJSONを書き込む。
 * @returns 書き込めたら true、失敗（容量超過・プライベートブラウズ等）なら false
 */
export function writeJson<T>(key: string, value: T): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** 生の文字列をそのまま書き込む（破損データの退避用）。失敗時は false。 */
export function writeRaw(key: string, raw: string): boolean {
  try {
    localStorage.setItem(key, raw);
    return true;
  } catch {
    return false;
  }
}
