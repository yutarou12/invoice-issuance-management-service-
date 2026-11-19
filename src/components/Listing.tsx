import { useEffect, useState, type ReactNode } from 'react';
import {
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
} from '@mui/material';
import type { Page } from '../../shared/types';
import { api } from '../api';
import Empty from './Empty';

export default function Listing<T>({
  path,
  columns,
  render,
  onError,
  empty,
}: {
  path: 'invoices' | 'contacts';
  columns: string[];
  render: (item: T) => ReactNode;
  onError: (error: unknown) => void;
  empty: string;
}) {
  const [data, setData] = useState<Page<T>>({
    items: [],
    total: 0,
    page: 1,
    pageSize: 10,
  });
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(10);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setFailed(false);
    const timer = setTimeout(() => {
      api<Page<T>>(
        `/${path}?${new URLSearchParams({ q, status, page: String(page + 1), pageSize: String(size) })}`,
      )
        .then((result) => {
          if (active) setData(result);
        })
        .catch((error) => {
          if (active) {
            onError(error);
            setFailed(true);
          }
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [path, q, status, page, size]);
  return (
    <section
      className="list-card"
      aria-label={path === 'invoices' ? '請求書の一覧' : '連絡先の一覧'}
    >
      <div className="list-toolbar">
        <TextField
          label={
            path === 'invoices'
              ? '宛先・内容・IDで検索'
              : '名前・ふりがな・メールで検索'
          }
          value={q}
          onChange={(event) => {
            setQ(event.target.value);
            setPage(0);
          }}
          sx={{ maxWidth: 340 }}
        />
        {path === 'invoices' && (
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>ステータス</InputLabel>
            <Select
              label="ステータス"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(0);
              }}
            >
              {[
                ['', 'すべて'],
                ['issued', '未送信'],
                ['sent', '送信済み'],
                ['overdue', '期日超過'],
                ['completed', '完了'],
                ['cancelled', '取り消し済み'],
              ].map(([value, label]) => (
                <MenuItem key={value} value={value}>
                  {label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}
        <span className="list-total">全 {data.total} 件</span>
      </div>
      {loading ? (
        <div className="loading">
          <CircularProgress size={28} />
          <span>読み込み中</span>
        </div>
      ) : failed ? (
        <Empty title="一覧を取得できませんでした">
          接続を確認し、検索条件を変更して再試行してください。
        </Empty>
      ) : data.items.length ? (
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                {columns.map((column, index) => (
                  <TableCell key={index}>{column}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>{data.items.map(render)}</TableBody>
          </Table>
        </TableContainer>
      ) : (
        <Empty title={q || status ? '条件に合うデータがありません' : empty}>
          {q || status
            ? '検索条件を変えてお試しください。'
            : path === 'invoices'
              ? '「請求書を発行」から、はじめての請求書を作成しましょう。'
              : '連絡先を追加するか、CSVでまとめて登録しましょう。'}
        </Empty>
      )}
      <TablePagination
        component="div"
        count={data.total}
        page={page}
        rowsPerPage={size}
        onPageChange={(_event, value) => setPage(value)}
        onRowsPerPageChange={(event) => {
          setSize(Number(event.target.value));
          setPage(0);
        }}
        rowsPerPageOptions={[10, 25, 50]}
        labelRowsPerPage="表示件数"
        labelDisplayedRows={({ from, to, count }) =>
          `${count}件中 ${from}–${to}件`
        }
        getItemAriaLabel={(type) =>
          type === 'next' ? '次のページ' : '前のページ'
        }
      />
    </section>
  );
}
