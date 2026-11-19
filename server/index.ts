import { createApp } from './app.js';
import { createStore } from './store.js';

const password = process.env.APP_PASSWORD || '';
if (
  password.length < 16 ||
  password === 'change-this-to-a-long-random-password'
) {
  throw new Error(
    '.envのAPP_PASSWORDに独自の16文字以上のパスワードを設定してください',
  );
}
const store = createStore(process.env.DATA_DIR || './data');
const server = createApp(store, password).listen(
  Number(process.env.PORT || 3000),
  process.env.HOST || '127.0.0.1',
  () =>
    console.log('たてかえを起動しました: ポート ' + (process.env.PORT || 3000)),
);
// 終了時は接続を閉じるだけで、保存ファイルは削除しない。
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () =>
    server.close(() => {
      store.db.close();
      process.exit(0);
    }),
  );

server.on('error', (error) => {
  console.error('起動に失敗しました:', error.message);
  store.db.close();
  process.exitCode = 1;
});
