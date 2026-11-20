# たてかえ — 請求書発行・管理サービス

友人への立替請求、送信記録、領収書発行をローカルで管理するアプリです。TypeScript / React / MUI / Express / SQLiteを使用します。

## 起動（Docker Compose + OS上のnginx）

DockerとDocker Compose v2、およびホストOSにインストールしたnginxを使用します。Composeが作成するのはアプリのコンテナのみです。

```sh
cp .env.example .env
```

.envのAPP_PASSWORDを独自の16文字以上のパスワードに変更してください。サンプルのままでは起動できません。

```sh
docker compose config --quiet
docker compose up --build -d
```

アプリはホストの`127.0.0.1:3000`で待ち受けます。ポートを変更する場合は`.env`に`APP_PORT=3001`などを設定し、`docker compose up -d`で反映してください。

構成は「ブラウザ → OS上のnginx（HTTPS）→ 127.0.0.1:3000 → アプリコンテナ」です。nginxの設定と証明書はホストOS上で管理します。

### OS上のnginx設定

[nginx/default.conf](nginx/default.conf)を設定例として使用できます。ホストOSのnginxが読み込む設定ファイル（例: `/etc/nginx/conf.d/tatekae.conf`）に設定し、次の値を環境に合わせて変更してください。

- `listen`: HTTPSの待受ポート。設定例は443です。LAN/VPNの特定IPだけに公開する場合は`listen 192.168.1.10:443 ssl;`のように指定します。
- `server_name`: 証明書に合わせたホスト名（例: `invoice.home.arpa`）。
- `ssl_certificate`・`ssl_certificate_key`: ホスト上のサーバー証明書と秘密鍵の絶対パス。
- `proxy_pass`: `http://127.0.0.1:3000`。`APP_PORT`を変更した場合は同じポートに合わせます。

自宅CAで発行したサーバー証明書のSANにはアクセスするホスト名、IPでアクセスするならそのIPアドレスを含めてください。`fullchain.pem`にはサーバー証明書を先頭に必要な中間CA証明書を連結し、`privkey.pem`には対応するサーバー秘密鍵を配置します。秘密鍵の読み取り権限はOS上のnginxの起動ユーザーに合わせて制限してください。CAの秘密鍵は配置しません。

接続するPC・スマートフォンで自宅CAのルート証明書を信頼済みに登録し、ローカルDNSまたはhostsでホスト名をサーバーIPへ解決できるようにします。

設定・証明書を配置したら、ホスト上で構文確認後に再読み込みします（nginxが起動済みの場合）。

```sh
sudo nginx -t
# 上の検証が成功した場合のみ実行
sudo nginx -s reload
```

証明書の更新やnginx設定の変更も同じ手順で反映できます。アプリコンテナの再ビルドや証明書のボリュームマウントは不要です。

証明書に合わせたURL（例: `https://invoice.home.arpa`）を開き、ユーザー名admin、設定したパスワードでログインします。HTTPSを443以外で公開する場合はURLにもポートを付けてください。最初に「発行者・振込先」で名前と口座を保存してください。

nginxでは`Host`のポート番号と`Origin`を保持し、`X-Forwarded-For`を`$remote_addr`で上書きしてください。Composeでは`TRUST_PROXY=1`で直前のプロキシ1段を信頼し、認証試行制限を接続元IPごとに適用します。アプリの公開先は`127.0.0.1`のまま使用してください。設定の参考: [nginxプロキシ仕様](https://nginx.org/en/docs/http/ngx_http_proxy_module.html)、[Expressのプロキシ設定](https://expressjs.com/en/guide/behind-proxies/)。

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

OS上のnginxをホストのVPN IPで待ち受けるように設定し、証明書のホスト名がVPN IPへ解決されるようにしてください。アプリコンテナの公開先は127.0.0.1のまま使用します。インターネットへのポート転送は不要です。

VPN内でもOS上のnginx経由のHTTPSを使用します。Web Share APIはHTTPSまたはlocalhostの対応ブラウザでのみ利用できます。非対応の場合はPNGを保存してLINE等へ添付し、「共有先への送信を記録」で状態を更新してください。共有ダイアログの終了だけでは送信成功を判定できません。

独自CORS設定は不要です。このアプリは単一管理者向けで、複数ユーザーの権限分離はありません。

## ローカル開発

Node.js 24以上が必要です。DockerなしでPNGを生成する場合、OSに日本語フォント（Noto Sans CJK JPなど）が必要です。

```sh
npm ci
npm run build
npm start
```

Dockerなしで起動した場合は[http://localhost:3000](http://localhost:3000)を開きます。`PORT`・`HOST`はこのローカル起動用で、Composeのホスト側ポートには`APP_PORT`を使用します。HTTPSの公開先はOS上のnginxで設定します。ローカルで直接起動する場合は`TRUST_PROXY`を設定せず、転送ヘッダーを信頼しない既定動作を使ってください。

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
