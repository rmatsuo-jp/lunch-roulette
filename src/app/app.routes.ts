import { Routes } from '@angular/router';
import { environment } from '../environments/environment';

export const routes: Routes = [
  {
    path: '',
    title: 'ランチくじ',
    loadComponent: () =>
      import('@features/recommend/recommend').then((m) => m.Recommend),
  },
  {
    path: 'data',
    title: '取り込み & タグ付け',
    loadComponent: () => import('@features/data-import/data').then((m) => m.Data),
  },
  {
    path: 'settings',
    title: '設定',
    loadComponent: () => import('@features/settings/settings').then((m) => m.Settings),
  },
  // 開発用タブは本番ビルドでは存在させない（isDev による app.html のナビ表示制御と対応）。
  // `environment.production` は本番ビルドで定数畳み込みされるため、この分岐ごと除去され
  // dev の遅延チャンク自体が dist に出力されない（`npm run build` の出力で確認済み）。
  ...(!environment.production
    ? [
        {
          path: 'dev',
          title: '開発',
          loadComponent: () => import('@features/dev/dev').then((m) => m.Dev),
        },
      ]
    : []),
  { path: '**', redirectTo: '' },
];
