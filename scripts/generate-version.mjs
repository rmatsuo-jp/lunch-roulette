/**
 * @file src/version.ts を自動生成するスクリプト。
 *       package.json の version を読み取り、実行当日（JST）をリリース日として埋め込む。
 *       呼び出し元は2系統:
 *       1. semantic-release の prepareCmd（.releaserc.json）— リリース時の正式なバージョン埋め込み。
 *       2. package.json の prestart / prebuild / prewatch / pretest — 開発時。
 *          src/version.ts は .gitignore 済み（git追跡外）でクローン直後は存在せず、
 *          未生成だと settings.ts の import が解決できずビルドが落ちるため毎回生成する。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(here, '../package.json'), 'utf8'));

// JST の YYYY-MM-DD。'sv-SE' ロケールは ISO 形式（年-月-日）で返るため整形が楽。
const releaseDate = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });

const contents = `// このファイルは scripts/generate-version.mjs により自動生成されます（手動編集しない）。
export const APP_VERSION = '${pkg.version}';
export const RELEASE_DATE = '${releaseDate}';
`;

writeFileSync(resolve(here, '../src/version.ts'), contents, 'utf8');
console.log(`[generate-version] APP_VERSION=${pkg.version} RELEASE_DATE=${releaseDate}`);
