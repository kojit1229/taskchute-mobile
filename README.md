# タスクシュート Mobile (PWA)

iPhone/iPad 用の PWA クライアント。PC版 taskchute_journal.py と iCloud Drive 経由で連携します。

## 🎯 機能

- PC が書き出した `latest.json` を読み込み
- タスク一覧表示、完了チェック、コメント編集
- ルーティンチェック
- 新しいタスク・予定の追加
- 変更を差分 JSON として書き出し（iCloud へ手動保存）

対応ブラウザ: **iOS Safari**（ホーム画面追加でアプリ風動作）

---

## 📦 ファイル構成

```
taskchute-mobile/
├── index.html           # メインページ
├── app.js               # アプリロジック
├── style.css            # スタイル
├── manifest.json        # PWA設定
├── service-worker.js    # オフライン対応
├── icon-192.png         # アイコン
├── icon-512.png         # アイコン（大）
└── README.md            # このファイル
```

---

## 🚀 セットアップ手順

### 【事前準備】GitHub アカウント作成 (5分)

1. https://github.com/signup にアクセス
2. メールアドレス・パスワードで登録
3. メール認証

### 【Step 1】リポジトリ作成 (3分)

1. GitHub にログイン
2. 右上「+」→「New repository」
3. Repository name: **`taskchute-mobile`**
4. Public を選択
5. 「Add a README file」にチェック
6. 「Create repository」

### 【Step 2】ファイルをアップロード

1. リポジトリのページで「Add file」→「Upload files」
2. この `taskchute-mobile` フォルダ内のファイルをすべてドラッグ＆ドロップ
3. 下部「Commit changes」押下

### 【Step 3】GitHub Pages 有効化 (3分)

1. リポジトリの「Settings」タブ
2. 左メニュー「Pages」
3. Source: 「Deploy from a branch」
4. Branch: `main` / folder: `/ (root)`
5. 「Save」押下
6. 1〜2分待つと公開URLが表示される

公開URL例:
```
https://<あなたのユーザー名>.github.io/taskchute-mobile/
```

### 【Step 4】iPhone からアクセス

1. iPhone の **Safari** で公開URLにアクセス
2. 下部の「共有」ボタン（□↑アイコン）
3. 「ホーム画面に追加」
4. 名前を確認して「追加」
5. ホーム画面にアイコンが追加される

### 【Step 5】初回データ読み込み

1. **PC側**でアプリを開き、「📱 iPhone同期」→「📤 iPhone用データを書き出す」
2. iCloud Drive の同期フォルダ (`taskchute-sync/exports/latest.json`) にファイルが生成される
3. iCloud 同期を待つ（通常数秒〜1分）
4. **iPhone** でホーム画面のタスクシュートアイコンを開く
5. 「📂 データを読み込む」ボタンをタップ
6. 「ファイル」アプリで iCloud Drive → taskchute-sync → exports → `latest.json` を選択

---

## 📝 使い方

### 朝（PC）
1. アプリを起動
2. 「📱 iPhone同期」→「📤 iPhone用データを書き出す」
3. アプリを閉じる

### 外出先（iPhone）
1. ホーム画面のタスクシュートを開く
2. タスクをチェック、コメント編集、新規追加などを自由に実行
3. 終了時、「💾 変更を書き出し」をタップ
4. ブラウザが JSON ファイルをダウンロードする
5. 「ファイル」アプリで iCloud → taskchute-sync → **edits** フォルダに保存

### 帰宅後（PC）
1. アプリを起動
2. 「📱 iPhone同期」→「📥 iPhoneの変更を取り込む」
3. プレビューで変更内容を確認
4. 「選択した変更を適用」
5. 保存ボタンで Excel に反映

---

## 🛠 トラブルシューティング

### 「データの読み込みに失敗しました」
- `latest.json` の形式が正しくありません
- PC アプリで再度「iPhone用データを書き出す」を実行

### ホーム画面追加後、白画面になる
- ブラウザのキャッシュをクリア → 再度「ホーム画面に追加」
- GitHub Pages の反映を1〜2分待つ

### 変更ファイルが iCloud に保存できない
- Safari のダウンロードは通常「ダウンロード」フォルダに保存される
- ダウンロード後、Files アプリで手動で `taskchute-sync/edits/` に移動

### iCloud Drive が見つからない
- iPhone の「設定」→ 自分のApple ID → iCloud → iCloud Drive をオンに
- Files アプリで「iCloud Drive」が表示されるか確認

---

## 🔒 データ保持

- 読み込んだデータと変更ログは iPhone の **localStorage** に自動保存
- アプリを閉じても次回開いた時に復元される
- 「変更をクリア」ボタンで明示的に削除可能

---

## ⚠️ 注意事項

- 本アプリは **書き込み専用**ではなく、PC側のデータを操作するための編集ログを生成します
- PC側で「取り込み」前は、iPhone での変更は本番データに反映されません
- **PC側の編集中（アプリ起動中）に iPhone 側でも編集しない**ことを推奨
