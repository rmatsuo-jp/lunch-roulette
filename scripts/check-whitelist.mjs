/**
 * @file クラウド同期の許可メール一覧が、クライアントと Firestore ルールで一致するかを検証する。
 *
 * 一覧は src/app/core/firebase/auth.constants.ts と firestore.rules の二重管理になっており、
 * これまでコメントで「同期させること」と書かれているだけだった。ずれると
 * 「UI ではログインできるのに書き込みが全部拒否される」「ルールにはあるのに UI が弾く」
 * といった分かりにくい不具合になるため、ビルド前に機械的に突き合わせる。
 *
 * .rules は Angular のビルダーがモジュールとして読み込めないため、ユニットテストではなく
 * このスクリプトで検証している（npm run check:whitelist / pretest から実行）。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONSTANTS_PATH = join(root, 'src/app/core/firebase/auth.constants.ts');
const RULES_PATH = join(root, 'firestore.rules');

/** `ALLOWED_SYNC_EMAILS: readonly string[] = ['a@b'];` からメールを抽出する。 */
function readClientEmails() {
  const src = readFileSync(CONSTANTS_PATH, 'utf8');
  const match = src.match(/ALLOWED_SYNC_EMAILS[^=]*=\s*\[([^\]]*)\]/);
  if (!match) fail(`${CONSTANTS_PATH} から ALLOWED_SYNC_EMAILS を抽出できませんでした`);
  return extractQuoted(match[1]);
}

/** `request.auth.token.email in ['a@b']` からメールを抽出する。 */
function readRuleEmails() {
  const src = readFileSync(RULES_PATH, 'utf8');
  const match = src.match(/request\.auth\.token\.email\s+in\s+\[([^\]]*)\]/);
  if (!match) fail(`${RULES_PATH} から許可メール一覧を抽出できませんでした`);
  return extractQuoted(match[1]);
}

function extractQuoted(text) {
  return [...text.matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1]).sort();
}

function fail(message) {
  console.error(`[check-whitelist] ${message}`);
  process.exit(1);
}

const client = readClientEmails();
const rules = readRuleEmails();

if (client.length === 0) {
  fail('許可メール一覧が空です（誰もクラウド同期できません）');
}

if (JSON.stringify(client) !== JSON.stringify(rules)) {
  console.error('[check-whitelist] 許可メール一覧が一致しません。');
  console.error(`  auth.constants.ts : ${client.join(', ') || '(空)'}`);
  console.error(`  firestore.rules   : ${rules.join(', ') || '(空)'}`);
  console.error('  両方のファイルを同じ内容に揃えてください。');
  process.exit(1);
}

console.log(`[check-whitelist] OK (${client.length}件): ${client.join(', ')}`);
