/**
 * @file 起動時に表示する「新機能」モーダル。未読バージョンのリリースノートを `MAT_DIALOG_DATA` で
 * 受け取って表示するだけの薄いコンポーネント（取得・既読記録は `ReleaseNotesService` と app.ts 側の責務）。
 * 1バージョン分の描画は `ReleaseNoteEntry`（設定ページと共通）に委譲する。
 */
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { ReleaseNoteEntry } from '@shared/ui/release-note-entry/release-note-entry';
import { ReleaseNoteEntry as ReleaseNoteEntryData } from '../release-notes.service';

@Component({
  selector: 'app-whats-new-dialog',
  imports: [MatDialogModule, MatButtonModule, ReleaseNoteEntry],
  templateUrl: './whats-new-dialog.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WhatsNewDialog {
  /** 表示する未読バージョンのリリースノート（新しい順）。 */
  protected readonly entries = inject<ReleaseNoteEntryData[]>(MAT_DIALOG_DATA);
}
