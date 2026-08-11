/**
 * @file テキストデータをファイルとしてブラウザにダウンロードさせる汎用サービス。
 * Blob 生成・オブジェクトURL発行・`<a>`要素によるクリックダウンロード・URL解放を1箇所に集約する。
 */
import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class FileDownloadService {
  /** `content` を `filename` としてダウンロードさせる。 */
  downloadText(filename: string, content: string, mimeType: string): void {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
}
