# たてかえ — 請求書発行・管理サービス

友人への立替請求、送信記録、領収書発行をローカルで管理するアプリです。TypeScript / React / MUI / Express / SQLiteを使用します。

## 起動（Docker Compose / nginx HTTPS）

DockerとDocker Compose v2が必要です。

```sh
cp .env.example .env
```

.envのAPP_PASSWORDを独自の16文字以上のパスワードに変更してください。サンプルのままでは起動できません。

自宅CAで発行した**サーバー証明書と、そのサーバー用秘密鍵**を用意します。証明書のSANにはアクセス時のホスト名（例: `invoice.home.arpa`）、IPでアクセスするならそのIPアドレスを含めてください。CAの秘密鍵はアプリに配置しません。

```sh
mkdir -p certs
# 発行済みの証明書・秘密鍵を配置（コピー元は実際のパスへ変更）
cp /path/to/fullchain.pem certs/fullchain.pem
cp /path/to/privkey.pem certs/privkey.pem
```

- `fullchain.pem`: PEM形式。サーバー証明書を先頭に、必要な中間CA証明書を順に連結します。ルートCAによる直接署名ならサーバー証明書のみです。
- `privkey.pem`: 対応するPEM形式のサーバー秘密鍵。無人起動できるようパスフレーズなしで用意し、読み取り権限を制限します。
- 接続するPC・スマートフォンで自宅CAの**ルート証明書**を信頼済みに登録し、ローカルDNSまたはhostsでホスト名をサーバーIPへ解決できるようにします。

nginxは非root（UID/GID 101）で動作します。Linuxホストでは、証明書ディレクトリの通過権限と秘密鍵の読み取り権限を付与してください。標準Dockerでの例です（独自パスを指定する場合は読み替え）。

```sh
sudo chown -R root:101 certs
sudo chmod 750 certs
sudo chmod 640 certs/fullchain.pem certs/privkey.pem
```

LAN/VPN上の端末から使う場合の`.env`設定例です。`BIND_ADDRESS`はサーバー自身のLAN/VPN IPに変更してください。

```dotenv
BIND_ADDRESS=192.168.1.10
HTTPS_PORT=443
NGINX_CONF_PATH=./nginx/default.conf
TLS_CERTS_DIR=./certs
```

```sh
docker compose config --quiet
docker compose run --rm --no-deps nginx nginx -t
docker compose up --build -d
```

証明書に合わせたURL（例: `https://invoice.home.arpa`）を開き、ユーザー名admin、設定したパスワードでログインします。`HTTPS_PORT=8443`ならURLにも`:8443`を付けます。既定の`BIND_ADDRESS=127.0.0.1`はサーバー自身からのみアクセスできます。最初に「発行者・振込先」で名前と口座を保存してください。

構成は「ブラウザ → nginx（HTTPS）→ app:3000（Docker内部）」です。ホストへ公開するのはHTTPSのみで、HTTPの80番ポートとアプリの3000番ポートは公開しません。証明書がない状態ではnginxは起動しません。

初期データは空です。連絡先を追加・CSV取込してから請求書を発行します。テンプレート内のサンプル行は実際の連絡先に置き換えてください。

### nginx設定・証明書の差し替え

`NGINX_CONF_PATH`のファイルを`/etc/nginx/conf.d/default.conf`へ、`TLS_CERTS_DIR`のディレクトリを`/etc/nginx/certs`へ、読み取り専用のbind mountで渡します。どちらもホスト側の絶対パスを指定でき、イメージの再ビルドは不要です。ファイル・ディレクトリは起動前に作成してください。

証明書を更新したら、同じディレクトリ内の`fullchain.pem`と`privkey.pem`を置き換え、権限を確認して再読み込みします。ホスト側のシンボリックリンクを使う場合、リンク先もコンテナから参照できる必要があります。

```sh
docker compose exec nginx nginx -t
# 上の検証が成功した場合のみ実行
docker compose exec nginx nginx -s reload
```

`default.conf`を編集・置換した場合や`.env`のマウント元・ポート・公開先を変更した場合は、次の手順で反映します。ファイル単体のbind mountは、エディタによるファイル置換を既存コンテナに反映しない場合があるため、再作成します。

```sh
docker compose run --rm --no-deps nginx nginx -t
# 上の検証が成功した場合のみ実行
docker compose up -d --no-deps --force-recreate nginx
```

証明書と秘密鍵はGit管理・Dockerビルド対象外です。独自の配置先をリポジトリ内に設ける場合は、そのディレクトリも`.gitignore`と`.dockerignore`に追加してください。

nginx設定を変更する際は、`Host`のポート番号と`Origin`を保持し、`X-Forwarded-For`を`$remote_addr`で上書きしてください。Composeでは`TRUST_PROXY=1`で直前のnginxだけを信頼し、認証試行制限を接続元IPごとに適用します。この設定でappを直接公開しないでください。設定の参考: [nginxプロキシ仕様](https://nginx.org/en/docs/http/ngx_http_proxy_module.html)、[非rootイメージ](https://github.com/nginx/docker-nginx-unprivileged)、[Expressのプロキシ設定](https://expressjs.com/en/guide/behind-proxies/)。

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

既定の公開先は127.0.0.1のみです。.envのBIND_ADDRESSを**ホストのVPN IP**に変更し、nginxコンテナを再作成します。証明書のホスト名がVPN IPへ解決されるようにしてください。インターネットへのポート転送は不要です。

ComposeではVPN内でもnginx経由のHTTPSを使用します。Web Share APIはHTTPSまたはlocalhostの対応ブラウザでのみ利用できます。非対応の場合はPNGを保存してLINE等へ添付し、「共有先への送信を記録」で状態を更新してください。共有ダイアログの終了だけでは送信成功を判定できません。

独自CORS設定は不要です。このアプリは単一管理者向けで、複数ユーザーの権限分離はありません。

## ローカル開発

Node.js 24以上が必要です。DockerなしでPNGを生成する場合、OSに日本語フォント（Noto Sans CJK JPなど）が必要です。

```sh
npm ci
npm run build
npm start
```

Dockerなしで起動した場合は[http://localhost:3000](http://localhost:3000)を開きます。`PORT`・`HOST`はこのローカル起動用で、ComposeのHTTPS公開先には`HTTPS_PORT`・`BIND_ADDRESS`を使用します。ローカルで直接起動する場合は`TRUST_PROXY`を設定せず、転送ヘッダーを信頼しない既定動作を使ってください。

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
