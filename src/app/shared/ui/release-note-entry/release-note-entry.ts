/**
 * @file リリースノート1バージョン分の表示コンポーネント。
 * 設定ページの「リリースノートを見る」一覧と、起動時の新機能モーダルの双方から使う
 * （表示ロジックの重複を避けるための共通部品）。
 * 新機能（Features）は常に表示し、不具合修正（Bug Fixes）は件数が多くなりがちなため
 * 折りたたみ（mat-expansion-panel）に入れる。
 */
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatExpansionModule } from '@angular/material/expansion';
import { ReleaseNoteEntry as ReleaseNoteEntryData } from '@core/release-notes/release-notes.service';

@Component({
  selector: 'app-release-note-entry',
  imports: [MatExpansionModule],
  templateUrl: './release-note-entry.html',
  styleUrl: './release-note-entry.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReleaseNoteEntry {
  /** 表示するリリースノート1件分。 */
  readonly entry = input.required<ReleaseNoteEntryData>();
}
