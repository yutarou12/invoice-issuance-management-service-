# たてかえ — 請求書発行・管理サービス

友人への立替請求、送信記録、領収書発行をローカルで管理するアプリです。TypeScript / React / MUI / Express / SQLiteを使用します。

## 起動（Docker Compose）

DockerとDocker Compose v2が必要です。

```sh
cp .env.example .env
```

.envのAPP_PASSWORDを独自の16文字以上のパスワードに変更してください。サンプルのままでは起動できません。

```sh
docker compose up --build -d
```

[http://localhost:3000](http://localhost:3000)を開き、ユーザー名admin、設定したパスワードでログインします。最初に「発行者・振込先」で名前と口座を保存してください。

初期データは空です。連絡先を追加・CSV取込してから請求書を発行します。テンプレート内のサンプル行は実際の連絡先に置き換えてください。

## 使い方

1. 「連絡先」で名前・ふりがな・メール・電話を登録。IDは自動発行。編集にも対応します。
2. CSVテンプレートはUTF-8 BOM付き。取込もUTF-8です。Excelで保存する場合は「CSV UTF-8」を選んでください。重複メール・不正行があれば全件を登録しません。最大1MB / 1,000件です。
3. 「請求書を発行」で登録済み宛先を選び、金額・内容・期日を入力。複数宛先には**1人あたりの金額**で個別発行します。発行後の内容は変更できません。
4. 詳細画面でPNGを保存・共有、またはメール送信します。メールは確認ダイアログで宛先を確認して送信します。SMTP受付後に「送信済み」になります。
5. 入金を確認したら詳細から「領収書を発行」。宛名・但書を入力します。金額は請求額を引き継ぎます。
6. 領収書メールの受付成功、または共有先への送信確認後に請求が「完了」になります。発行のみでは完了しません。

一覧は検索・状態絞り込み・10/25/50件のページングに対応。宛先候補も検索と25件ごとのページングに対応します。日時は日本時間です。

## Cloudflare Email Service SMTP

[Cloudflare公式SMTP仕様](https://developers.cloudflare.com/email-service/api/send-emails/smtp/)に従います。

- Email Sendingを有効化し、送信元ドメインを登録・検証。
- Email Sending: Edit権限のAPIトークンを作成。
- .envのSMTP_PASSWORDにAPIトークン、SMTP_FROMに検証済みドメインの送信元アドレスを設定。
- 標準接続先はsmtp.mx.cloudflare.net:465、Implicit TLS、ユーザー名api_token。
- 設定変更後は `docker compose up -d --force-recreate` で再作成。

認証情報はサーバーだけで使用します。メール未設定でも画像発行・共有は利用できます。SMTP成功は受付の確認で、配達・既読の保証ではありません。タイムアウト後の再送前はCloudflareログも確認してください。

## VPN経由の利用

既定の公開先は127.0.0.1のみです。.envのBIND_ADDRESSを**ホストのVPN IP**に変更し、コンテナを再作成します。インターネットへのポート転送は不要です。

Basic認証は通信の暗号化を行わないため、VPN内でもHTTPSリバースプロキシの利用を推奨します。Web Share APIはHTTPSまたはlocalhostの対応ブラウザでのみ利用できます。VPN IPのHTTP接続ではPNGを保存してLINE等へ添付し、「共有先への送信を記録」で状態を更新してください。共有ダイアログの終了だけでは送信成功を判定できません。

HTTPSプロキシは同じHost・Originをバックエンドに渡してください。独自CORS設定は不要です。このアプリは単一管理者向けで、複数ユーザーの権限分離はありません。

## ローカル開発

Node.js 24以上が必要です。DockerなしでPNGを生成する場合、OSに日本語フォント（Noto Sans CJK JPなど）が必要です。

```sh
npm ci
npm run build
npm start
```

開発時はAPI用に `npm run dev`、別ターミナルで `npm run dev:web`。Viteが表示するlocalhost URLを開きます。

```sh
npm test
npm run build
```

[実装計画](docs/PLAN.md) / [コーディング規約](docs/CODING_GUIDELINES.md)

## 保存・バックアップ

DBはDockerのinvoice-dataボリューム内 /app/data/tatekae.sqlite に保存されます。ローカル起動ではDATA_DIR（既定./data）です。停止・再起動後も保存されます。

バックアップは先に `docker compose stop` を実行し、`docker compose cp app:/app/data ./backup-YYYYMMDD` でディレクトリ全体をコピーし、`docker compose start` で再開します。ローカル起動も停止後、dataディレクトリ全体をコピーしてください。バックアップはアクセス制限された場所に保管します。

ファイル削除は実装・運用ともに事前承認が必要です。ボリューム削除コマンドやデータ削除機能は用意していません。請求書の訂正・取消、税務用の適格請求書発行は現在の対象外です。
