import { useEffect, useState, type FormEvent } from 'react';
import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  MenuItem,
  Snackbar,
  Stack,
  TableCell,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import PeopleOutlineIcon from '@mui/icons-material/PeopleOutline';
import TuneIcon from '@mui/icons-material/Tune';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import AddIcon from '@mui/icons-material/Add';
import type { Contact, Invoice, Settings, Summary } from '../shared/types';
import { api, dateTime, today, yen } from './api';
import Status from './components/Status';
import Stat from './components/Stat';
import Listing from './components/Listing';
import InvoiceDialog from './components/InvoiceDialog';

type Section = 'invoices' | 'contacts' | 'settings';

type Kind = 'invoice' | 'receipt';

const emptySettings: Settings = {
  issuer: '',
  bank: '',
  branch: '',
  accountType: '普通',
  accountNumber: '',
  accountHolder: '',
};

const emptyContact = { name: '', kana: '', email: '', phone: '' };

const titles: Record<Section, string> = {
  invoices: '請求書一覧',
  contacts: '連絡先',
  settings: '発行者・振込先',
};

export default function App() {
  const [section, setSection] = useState<Section>('invoices');
  const [revision, setRevision] = useState(0);
  const [settings, setSettings] = useState<Settings>(emptySettings);
  const [configured, setConfigured] = useState(false);
  const [mailReady, setMailReady] = useState(false);
  const [summary, setSummary] = useState<Summary>({
    outstanding: 0,
    overdue: 0,
    completed: 0,
    total: 0,
  });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [contactEdit, setContactEdit] = useState<Partial<Contact>>();
  const [detail, setDetail] = useState<Invoice>();
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [file, setFile] = useState<File>();
  const [imageUrl, setImageUrl] = useState<string>();
  const [imageLoading, setImageLoading] = useState(false);
  const [imageRevision, setImageRevision] = useState(0);
  const [kind, setKind] = useState<Kind>('invoice');
  const [delivery, setDelivery] = useState<{
    method: 'email' | 'shared';
    resend: boolean;
  }>();
  const refresh = () => setRevision((value) => value + 1);
  const fail = (value: unknown) =>
    setError(value instanceof Error ? value.message : '処理に失敗しました');
  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await work();
    } catch (value) {
      fail(value);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    let active = true;
    Promise.all([
      api<{ settings?: Settings; mailConfigured: boolean }>('/settings'),
      api<Summary>('/summary'),
    ])
      .then(([data, totals]) => {
        if (active) {
          setSettings(data.settings || emptySettings);
          setConfigured(Boolean(data.settings));
          setMailReady(data.mailConfigured);
          setSummary(totals);
        }
      })
      .catch((value) => {
        if (active) fail(value);
      });
    return () => {
      active = false;
    };
  }, [revision]);
  // 共有ボタンを押す前に画像ファイルを取得し、ブラウザのユーザー操作条件を満たす。
  useEffect(() => {
    setFile(undefined);
    setImageUrl(undefined);
    if (!detail) {
      setImageLoading(false);
      return;
    }
    setImageLoading(true);
    let active = true;
    let objectUrl: string | undefined;
    const controller = new AbortController();
    fetch(`/api/invoices/${detail.id}/${kind}/image`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('画像を読み込めませんでした');
        return response.blob();
      })
      .then((blob) => {
        if (active) {
          objectUrl = URL.createObjectURL(blob);
          setImageUrl(objectUrl);
          setFile(
            new File(
              [blob],
              `${kind === 'receipt' ? detail.receipt!.id : detail.id}.png`,
              { type: 'image/png' },
            ),
          );
        }
      })
      .catch((value) => {
        if (active) fail(value);
      })
      .finally(() => {
        if (active) setImageLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [detail, kind, imageRevision]);
  const showDetail = (invoice: Invoice) => {
    setKind('invoice');
    setDetail(invoice);
  };
  const askDelivery = (method: 'email' | 'shared') =>
    setDelivery({
      method,
      resend: Boolean(
        kind === 'invoice' ? detail?.sentAt : detail?.receipt?.sentAt,
      ),
    });
  function download() {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = file.name;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice(
      '画像を保存しました。送信後に「共有先への送信を記録」を押してください。',
    );
  }
  async function share() {
    if (!file) return;
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: kind === 'invoice' ? '請求書' : '領収書',
        });
        askDelivery('shared');
      } else download();
    } catch (value) {
      if (!(value instanceof DOMException && value.name === 'AbortError'))
        fail(value);
    }
  }
  return (
    <div className="shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(event) => {
            event.preventDefault();
            setSection('invoices');
          }}
        >
          <span className="brand-icon">
            <ReceiptLongOutlinedIcon sx={{ fontSize: 22 }} />
          </span>
          <span>
            たてかえ<small>請求書・領収書管理</small>
          </span>
        </a>
        <div className="nav-caption">ワークスペース</div>
        <nav aria-label="メインメニュー">
          {(['invoices', 'contacts', 'settings'] as Section[]).map((item) => (
            <button
              key={item}
              aria-current={section === item ? 'page' : undefined}
              className={section === item ? 'nav-item active' : 'nav-item'}
              onClick={() => setSection(item)}
            >
              {item === 'invoices' ? (
                <ReceiptLongOutlinedIcon sx={{ fontSize: 22 }} />
              ) : item === 'contacts' ? (
                <PeopleOutlineIcon sx={{ fontSize: 22 }} />
              ) : (
                <TuneIcon sx={{ fontSize: 22 }} />
              )}
              {titles[item]}
              {item === 'invoices' && (
                <span className="nav-count">{summary.total}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className="online-dot" />
          プライベートワークスペース
          <small>データはお使いのサーバーに保存</small>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span>
            ワークスペース <span className="breadcrumb">/</span>{' '}
            <strong>{titles[section]}</strong>
          </span>
          <span className="user-badge">管</span>
        </header>
        <main id="main">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {section === 'invoices'
                  ? 'INVOICES'
                  : section === 'contacts'
                    ? 'CONTACTS'
                    : 'SETTINGS'}
              </div>
              <Typography variant="h4" component="h1">
                {titles[section]}
              </Typography>
              <p>
                {section === 'invoices'
                  ? '立て替えたお金を、すっきり管理。請求から領収までをひとつに。'
                  : section === 'contacts'
                    ? '一緒に過ごす人たちの連絡先を、ひとつに。'
                    : '書類に記載するお名前と、お振込先を設定します。'}
              </p>
            </div>
            {section !== 'settings' && (
              <Button
                variant="contained"
                startIcon={<AddIcon sx={{ fontSize: 22 }} />}
                onClick={() =>
                  section === 'invoices'
                    ? setInvoiceOpen(true)
                    : setContactEdit(emptyContact)
                }
              >
                {section === 'invoices' ? '請求書を発行' : '連絡先を追加'}
              </Button>
            )}
          </div>
          {error && (
            <Alert
              severity="error"
              onClose={() => setError('')}
              sx={{ mb: 3, whiteSpace: 'pre-line' }}
            >
              {error}
            </Alert>
          )}
          {!configured && section !== 'settings' && (
            <Alert
              severity="info"
              sx={{ mb: 3 }}
              action={
                <Button onClick={() => setSection('settings')}>設定する</Button>
              }
            >
              はじめに、発行者・振込先を設定してください。
            </Alert>
          )}
          {section === 'invoices' && (
            <>
              <div className="stats">
                <Stat
                  label="未回収の金額"
                  value={yen(summary.outstanding)}
                  hint="未送信・送信済みの請求額"
                />
                <Stat
                  label="期日を過ぎた請求"
                  value={`${summary.overdue}`}
                  suffix="件"
                  hint="お支払い状況を確認しましょう"
                  warning={summary.overdue > 0}
                />
                <Stat
                  label="完了した請求"
                  value={`${summary.completed}`}
                  suffix="件"
                  hint="領収書の送信まで完了"
                />
              </div>
              <Listing<Invoice>
                key={`invoices-${revision}`}
                path="invoices"
                columns={[
                  '宛先 / 内容',
                  '発行日時',
                  'お支払期日',
                  '金額',
                  'ステータス',
                  '',
                ]}
                onError={fail}
                render={(invoice) => (
                  <TableRow key={invoice.id} hover>
                    <TableCell>
                      <button
                        className="name-link"
                        onClick={() => showDetail(invoice)}
                      >
                        {invoice.contact.name}
                      </button>
                      <div className="subtext">{invoice.description}</div>
                    </TableCell>
                    <TableCell>{dateTime(invoice.issuedAt)}</TableCell>
                    <TableCell>
                      <span
                        className={
                          invoice.status !== 'completed' &&
                          invoice.status !== 'cancelled' &&
                          invoice.dueDate < today()
                            ? 'overdue'
                            : ''
                        }
                      >
                        {invoice.dueDate.replaceAll('-', '/')}
                      </span>
                    </TableCell>
                    <TableCell className="money">
                      {yen(invoice.amount)}
                    </TableCell>
                    <TableCell>
                      <Status invoice={invoice} />
                    </TableCell>
                    <TableCell>
                      <Button size="small" onClick={() => showDetail(invoice)}>
                        詳細 <ChevronRightIcon sx={{ fontSize: 22 }} />
                      </Button>
                    </TableCell>
                  </TableRow>
                )}
                empty="まだ請求書はありません"
              />
            </>
          )}
          {section === 'contacts' && (
            <>
              <div className="import-bar">
                <div>
                  <strong>CSVでまとめて登録</strong>
                  <p>
                    テンプレートに連絡先を記入して、最大1,000件を一括登録できます。
                  </p>
                </div>
                <Stack direction="row" spacing={1} flexWrap="wrap">
                  <Button href="/api/contacts/template" variant="outlined">
                    テンプレート
                  </Button>
                  <Button component="label" variant="contained" disabled={busy}>
                    CSVをインポート
                    <input
                      type="file"
                      accept=".csv,text/csv"
                      hidden
                      onChange={(event) => {
                        const input = event.target;
                        const selected = input.files?.[0];
                        if (selected)
                          void run(async () => {
                            if (selected.size > 1000000)
                              throw new Error('CSVは1MB以下にしてください');
                            const result = await api<{ imported: number }>(
                              '/contacts/import',
                              { csv: await selected.text() },
                            );
                            refresh();
                            setNotice(
                              `${result.imported}件の連絡先を登録しました`,
                            );
                          });
                        input.value = '';
                      }}
                    />
                  </Button>
                </Stack>
              </div>
              <Listing<Contact>
                key={`contacts-${revision}`}
                path="contacts"
                columns={[
                  '名前 / ふりがな',
                  'メールアドレス',
                  '電話番号',
                  '連絡先ID',
                  '',
                ]}
                onError={fail}
                empty="まだ連絡先はありません"
                render={(contact) => (
                  <TableRow key={contact.id} hover>
                    <TableCell>
                      <strong>{contact.name}</strong>
                      <div className="subtext">{contact.kana || '—'}</div>
                    </TableCell>
                    <TableCell>{contact.email}</TableCell>
                    <TableCell>{contact.phone || '—'}</TableCell>
                    <TableCell>
                      <span className="small-id" title={contact.id}>
                        {contact.id}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Button onClick={() => setContactEdit(contact)}>
                        編集
                      </Button>
                    </TableCell>
                  </TableRow>
                )}
              />
            </>
          )}
          {section === 'settings' && (
            <form
              className="settings-card"
              onSubmit={(event) => {
                event.preventDefault();
                void run(async () => {
                  await api('/settings', settings, 'PUT');
                  setConfigured(true);
                  refresh();
                  setNotice('設定を保存しました');
                });
              }}
            >
              <h2>発行者情報</h2>
              <p>発行する請求書と領収書に記載されます。</p>
              <TextField
                label="発行者名"
                required
                value={settings.issuer}
                onChange={(event) =>
                  setSettings({ ...settings, issuer: event.target.value })
                }
                inputProps={{ maxLength: 60 }}
              />
              <Divider sx={{ my: 4 }} />
              <h2>お振込先</h2>
              <p>発行済みの書類には、発行当時の情報が残ります。</p>
              <div className="form-grid">
                {(['bank', 'branch'] as const).map((key) => (
                  <TextField
                    key={key}
                    label={key === 'bank' ? '銀行名' : '支店名'}
                    required
                    value={settings[key]}
                    onChange={(event) =>
                      setSettings({ ...settings, [key]: event.target.value })
                    }
                    inputProps={{ maxLength: 60 }}
                  />
                ))}
                <TextField
                  select
                  label="口座種別"
                  value={settings.accountType}
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      accountType: event.target.value,
                    })
                  }
                >
                  {['普通', '当座', '貯蓄'].map((value) => (
                    <MenuItem key={value} value={value}>
                      {value}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  required
                  label="口座番号（7桁）"
                  value={settings.accountNumber}
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      accountNumber: event.target.value,
                    })
                  }
                  inputProps={{
                    pattern: '[0-9]{7}',
                    maxLength: 7,
                    inputMode: 'numeric',
                  }}
                />
              </div>
              <TextField
                required
                label="口座名義"
                value={settings.accountHolder}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    accountHolder: event.target.value,
                  })
                }
                inputProps={{ maxLength: 100 }}
              />
              <div className="settings-footer">
                <Button type="submit" variant="contained" disabled={busy}>
                  設定を保存
                </Button>
              </div>
              <Alert severity={mailReady ? 'success' : 'info'}>
                メール送信:{' '}
                {mailReady
                  ? '設定済み'
                  : '未設定。.envのSMTP設定後にサーバーを再起動してください。'}
              </Alert>
            </form>
          )}
          <footer className="page-footer">
            たてかえ <span>日々の立て替えを、気持ちよく。</span>
          </footer>
        </main>
      </div>
      <InvoiceDialog
        open={invoiceOpen}
        busy={busy}
        onClose={() => setInvoiceOpen(false)}
        onError={fail}
        onSubmit={(body) =>
          void run(async () => {
            const invoices = await api<Invoice[]>('/invoices', body);
            setInvoiceOpen(false);
            refresh();
            setNotice(`${invoices.length}件の請求書を発行しました`);
            if (invoices.length === 1) showDetail(invoices[0]);
          })
        }
      />
      <Dialog
        open={Boolean(contactEdit)}
        onClose={() => !busy && setContactEdit(undefined)}
        fullWidth
        maxWidth="sm"
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void run(async () => {
              await api(
                `/contacts${contactEdit?.id ? `/${contactEdit.id}` : ''}`,
                contactEdit,
                contactEdit?.id ? 'PUT' : 'POST',
              );
              setContactEdit(undefined);
              refresh();
              setNotice('連絡先を保存しました');
            });
          }}
        >
          <DialogTitle>
            {contactEdit?.id ? '連絡先を編集' : '連絡先を追加'}
          </DialogTitle>
          <DialogContent>
            <Stack spacing={3} sx={{ pt: 1 }}>
              {(['name', 'kana', 'email', 'phone'] as const).map((key) => (
                <TextField
                  key={key}
                  label={
                    {
                      name: '名前',
                      kana: 'ふりがな',
                      email: 'メールアドレス',
                      phone: '電話番号',
                    }[key]
                  }
                  required={key === 'name' || key === 'email'}
                  type={key === 'email' ? 'email' : 'text'}
                  value={contactEdit?.[key] || ''}
                  onChange={(event) =>
                    setContactEdit({
                      ...contactEdit,
                      [key]: event.target.value,
                    })
                  }
                  inputProps={{
                    maxLength:
                      key === 'email'
                        ? 254
                        : key === 'phone'
                          ? 30
                          : key === 'name'
                            ? 60
                            : 100,
                  }}
                />
              ))}
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button disabled={busy} onClick={() => setContactEdit(undefined)}>
              キャンセル
            </Button>
            <Button disabled={busy} variant="contained" type="submit">
              保存する
            </Button>
          </DialogActions>
        </form>
      </Dialog>
      <Dialog
        open={Boolean(detail)}
        onClose={() => !busy && setDetail(undefined)}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>
          <div className="detail-heading">
            <span>書類の詳細</span>
            {detail && <Status invoice={detail} />}
          </div>
        </DialogTitle>
        <DialogContent>
          {detail && (
            <>
              <div className="detail-meta">
                <strong>{detail.contact.name} 様</strong>
                <span>{detail.contact.email}</span>
                <span>請求書ID: {detail.id}</span>
              </div>
              <Stack direction="row" spacing={1} sx={{ my: 2 }}>
                <Button
                  variant={kind === 'invoice' ? 'contained' : 'outlined'}
                  onClick={() => setKind('invoice')}
                >
                  請求書
                </Button>
                {detail.receipt ? (
                  <Button
                    variant={kind === 'receipt' ? 'contained' : 'outlined'}
                    onClick={() => setKind('receipt')}
                  >
                    領収書
                  </Button>
                ) : (
                  <Button
                    variant="outlined"
                    disabled={busy || detail.status === 'cancelled'}
                    onClick={() => setReceiptOpen(true)}
                  >
                    領収書を発行
                  </Button>
                )}
              </Stack>
              {imageLoading && (
                <Typography role="status">画像を生成しています…</Typography>
              )}
              {imageUrl && (
                <img
                  className="document-preview"
                  src={imageUrl}
                  alt={`${detail.contact.name}様の${kind === 'invoice' ? '請求書' : '領収書'}。金額${yen(detail.amount)}`}
                />
              )}
              <Stack
                direction="row"
                spacing={1}
                useFlexGap
                flexWrap="wrap"
                sx={{ my: 2 }}
              >
                <Button
                  variant="contained"
                  disabled={
                    busy || !mailReady || !file || detail.status === 'cancelled'
                  }
                  onClick={() => askDelivery('email')}
                >
                  メールで送信
                </Button>
                <Button
                  variant="outlined"
                  disabled={!file || busy || detail.status === 'cancelled'}
                  onClick={() => void share()}
                >
                  画像を共有
                </Button>
                <Button disabled={!file || busy} onClick={download}>
                  PNGを保存
                </Button>
                <Button
                  variant="outlined"
                  disabled={busy || imageLoading}
                  onClick={() => {
                    setFile(undefined);
                    setImageUrl(undefined);
                    setImageLoading(true);
                    setImageRevision((value) => value + 1);
                  }}
                >
                  {imageLoading ? '画像を生成中…' : '画像を再生成'}
                </Button>
                <Button
                  disabled={busy || detail.status === 'cancelled'}
                  onClick={() => askDelivery('shared')}
                >
                  共有先への送信を記録
                </Button>
              </Stack>
              {detail.status === 'cancelled' ? (
                <Alert severity="warning" sx={{ mb: 2 }}>
                  この請求書は取り消し済みです。
                  {detail.cancelledAt &&
                    ` 取消日時: ${dateTime(detail.cancelledAt)}`}
                </Alert>
              ) : (
                <Button
                  color="error"
                  variant="outlined"
                  disabled={busy}
                  onClick={() => setCancelOpen(true)}
                  sx={{ mb: 2 }}
                >
                  請求書を取り消す
                </Button>
              )}
              <Alert severity="info">
                画像共有は対応ブラウザのHTTPS環境で利用できます。共有できない場合はPNGを保存してLINEなどで送信し、送信を記録してください。
                {kind === 'receipt' &&
                  '領収書の送信を記録すると請求が完了します。'}
              </Alert>
              {!mailReady && (
                <Alert severity="warning" sx={{ mt: 1 }}>
                  メール送信にはサーバーのSMTP設定が必要です。
                </Alert>
              )}
              {(kind === 'invoice'
                ? detail.sentAt
                : detail.receipt?.sentAt) && (
                <p className="subtext">
                  最終送信記録:{' '}
                  {dateTime(
                    (kind === 'invoice'
                      ? detail.sentAt
                      : detail.receipt?.sentAt)!,
                  )}
                </p>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={() => setDetail(undefined)}>
            閉じる
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={receiptOpen}
        onClose={() => !busy && setReceiptOpen(false)}
        fullWidth
        maxWidth="sm"
      >
        <form
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            void run(async () => {
              const updated = await api<Invoice>(
                `/invoices/${detail!.id}/receipt`,
                {
                  name: form.get('name'),
                  description: form.get('description'),
                },
              );
              setDetail(updated);
              setKind('receipt');
              setReceiptOpen(false);
              refresh();
              setNotice('領収書を発行しました。送信すると請求が完了します。');
            });
          }}
        >
          <DialogTitle>領収書を発行</DialogTitle>
          <DialogContent>
            <Stack spacing={3} sx={{ pt: 1 }}>
              <Alert severity="info">
                入金をご確認のうえ発行してください。発行後は内容を変更できません。
              </Alert>
              <Typography>
                受領金額: <strong>{detail && yen(detail.amount)}</strong>
              </Typography>
              <TextField
                label="宛名"
                name="name"
                required
                defaultValue={detail?.contact.name}
                inputProps={{ maxLength: 60 }}
              />
              <TextField
                label="但書"
                name="description"
                required
                defaultValue={detail?.description.slice(0, 160)}
                inputProps={{ maxLength: 160 }}
              />
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button disabled={busy} onClick={() => setReceiptOpen(false)}>
              キャンセル
            </Button>
            <Button type="submit" variant="contained" disabled={busy}>
              領収書を発行
            </Button>
          </DialogActions>
        </form>
      </Dialog>
      <Dialog
        open={Boolean(delivery)}
        onClose={() => !busy && setDelivery(undefined)}
      >
        <DialogTitle>
          {delivery?.method === 'email'
            ? delivery.resend
              ? 'メールを再送しますか'
              : 'メールを送信しますか'
            : '共有先への送信は完了しましたか'}
        </DialogTitle>
        <DialogContent>
          <p>
            {delivery?.method === 'email'
              ? `${detail?.contact.email} に${kind === 'invoice' ? '請求書' : '領収書'}画像を送信します。`
              : 'LINEなどの送信先で、画像が送信できたことを確認してください。'}
          </p>
          {kind === 'receipt' && (
            <Alert severity="info">
              送信の記録後、請求書を「完了」に変更します。
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={() => setDelivery(undefined)}>
            キャンセル
          </Button>
          <Button
            variant="contained"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const updated = await api<Invoice>(
                  `/invoices/${detail!.id}/${kind}/deliver`,
                  delivery,
                );
                setDetail(updated);
                setDelivery(undefined);
                refresh();
                setNotice('送信を記録しました');
              })
            }
          >
            {busy
              ? '処理中…'
              : delivery?.method === 'email'
                ? '送信する'
                : '送信済みとして記録'}
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={cancelOpen} onClose={() => !busy && setCancelOpen(false)}>
        <DialogTitle>請求書を取り消しますか</DialogTitle>
        <DialogContent>
          <p>
            {detail?.contact.name} 様への請求 {detail && yen(detail.amount)}{' '}
            を取り消します。
          </p>
          <Alert severity="warning">
            履歴は残りますが、未回収額・期限超過の集計から除外され、送信や領収書発行ができなくなります。この操作は元に戻せません。送信済みの書類は回収されず、相手への通知や返金は行われません。
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={() => setCancelOpen(false)}>
            戻る
          </Button>
          <Button
            color="error"
            variant="contained"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const updated = await api<Invoice>(
                  `/invoices/${detail!.id}/cancel`,
                  {},
                );
                setDetail(updated);
                setCancelOpen(false);
                refresh();
                setNotice('請求書を取り消しました');
              })
            }
          >
            {busy ? '処理中…' : '取り消しを確定'}
          </Button>
        </DialogActions>
      </Dialog>
      <Snackbar
        open={Boolean(notice)}
        autoHideDuration={6000}
        onClose={() => setNotice('')}
      >
        <Alert severity="success" onClose={() => setNotice('')}>
          {notice}
        </Alert>
      </Snackbar>
      {busy && (
        <div className="busy-indicator" role="status">
          <CircularProgress size={18} />
          処理中です
        </div>
      )}
    </div>
  );
}
