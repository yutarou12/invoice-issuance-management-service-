import { useEffect, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import type { Contact, Page } from '../../shared/types';
import { api, today, yen } from '../api';

export default function InvoiceDialog({
  open,
  busy,
  onClose,
  onSubmit,
  onError,
}: {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onSubmit: (body: unknown) => void;
  onError: (error: unknown) => void;
}) {
  const [selected, setSelected] = useState<Contact[]>([]);
  const newItem = () => ({
    id: crypto.randomUUID(),
    description: '',
    amount: '',
  });
  const [items, setItems] = useState(() => [newItem()]);
  const [history, setHistory] = useState<string[]>([]);
  const totalAmount = items.reduce((sum, item) => sum + Number(item.amount), 0);
  const validItems =
    items.every(
      (item) =>
        item.description.trim() &&
        Number.isInteger(Number(item.amount)) &&
        Number(item.amount) > 0,
    ) && totalAmount <= 999999999;
  useEffect(() => {
    if (!open) return;
    let active = true;
    setItems([newItem()]);
    api<string[]>('/invoice-item-history')
      .then((values) => {
        if (active) setHistory(values);
      })
      .catch((error) => {
        if (active) onError(error);
      });
    return () => {
      active = false;
    };
  }, [open]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  useEffect(() => {
    if (open) {
      setSelected([]);
      setQuery('');
      setPage(0);
    }
  }, [open]);
  useEffect(() => {
    if (!open) return;
    let active = true;
    const timer = setTimeout(() => {
      api<Page<Contact>>(
        `/contacts?${new URLSearchParams({ q: query, page: String(page + 1), pageSize: '25' })}`,
      )
        .then((data) => {
          if (active) {
            setContacts(data.items);
            setTotal(data.total);
          }
        })
        .catch((error) => {
          if (active) onError(error);
        });
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [open, query, page]);
  return (
    <Dialog
      open={open}
      onClose={() => !busy && onClose()}
      fullWidth
      maxWidth="sm"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!selected.length) {
            onError(new Error('宛先を1人以上選んでください'));
            return;
          }
          const form = new FormData(event.currentTarget);
          onSubmit({
            contactIds: selected.map((contact) => contact.id),
            items: items.map((item) => ({
              description: item.description,
              amount: Number(item.amount),
            })),
            dueDate: form.get('dueDate'),
          });
        }}
      >
        <DialogTitle>請求書を発行</DialogTitle>
        <DialogContent>
          <Stack spacing={3} sx={{ pt: 1 }}>
            <Alert severity="info">
              複数人を選択すると、1人ずつ請求書を発行します。金額は1人あたりです。
            </Alert>
            <Autocomplete
              multiple
              disableCloseOnSelect
              options={contacts}
              value={selected}
              onChange={(_event, value) => setSelected(value)}
              inputValue={query}
              onInputChange={(_event, value, reason) => {
                if (reason === 'input' || reason === 'clear') {
                  setQuery(value);
                  setPage(0);
                }
              }}
              filterOptions={(options) => options}
              getOptionLabel={(contact) => `${contact.name} (${contact.email})`}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              noOptionsText="連絡先がありません。連絡先画面で登録してください"
              renderOption={(props, option, { selected: checked }) => {
                const { key, ...rest } = props;
                return (
                  <li key={key} {...rest}>
                    <Checkbox checked={checked} />
                    {option.name}
                    <span className="option-email">{option.email}</span>
                  </li>
                );
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="宛先を選択"
                  helperText={`${selected.length}人を選択中（最大100人）`}
                />
              )}
            />
            <div className="picker-pages">
              <Button disabled={page === 0} onClick={() => setPage(page - 1)}>
                前へ
              </Button>
              <span>
                {total}件中 {Math.min(page * 25 + 1, total)}–
                {Math.min((page + 1) * 25, total)}件
              </span>
              <Button
                disabled={(page + 1) * 25 >= total}
                onClick={() => setPage(page + 1)}
              >
                次へ
              </Button>
            </div>
            <Stack spacing={2}>
              <Typography component="h3">内容</Typography>
              {items.map((item, index) => (
                <Stack
                  key={item.id}
                  direction="row"
                  spacing={1}
                  alignItems="flex-start"
                >
                  <Autocomplete
                    freeSolo
                    options={history}
                    inputValue={item.description}
                    onInputChange={(_event, value) =>
                      setItems((rows) =>
                        rows.map((row) =>
                          row.id === item.id
                            ? { ...row, description: value }
                            : row,
                        ),
                      )
                    }
                    sx={{ flex: 1, minWidth: 0 }}
                    disabled={busy}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label={`内容 ${index + 1}`}
                        required
                        inputProps={{ ...params.inputProps, maxLength: 160 }}
                      />
                    )}
                  />
                  <TextField
                    label="金額（円）"
                    type="number"
                    required
                    value={item.amount}
                    disabled={busy}
                    sx={{ width: 140 }}
                    inputProps={{ min: 1, max: 999999999, step: 1 }}
                    onChange={(event) =>
                      setItems((rows) =>
                        rows.map((row) =>
                          row.id === item.id
                            ? { ...row, amount: event.target.value }
                            : row,
                        ),
                      )
                    }
                  />
                  <IconButton
                    aria-label={`項目${index + 1}の後に追加`}
                    disabled={busy || items.length >= 100}
                    onClick={() =>
                      setItems((rows) => [
                        ...rows.slice(0, index + 1),
                        newItem(),
                        ...rows.slice(index + 1),
                      ])
                    }
                  >
                    <AddIcon sx={{ fontSize: 22 }} />
                  </IconButton>
                  <IconButton
                    aria-label={`項目${index + 1}を削除`}
                    disabled={busy || items.length === 1}
                    onClick={() =>
                      setItems((rows) =>
                        rows.filter((row) => row.id !== item.id),
                      )
                    }
                  >
                    <DeleteOutlineIcon sx={{ fontSize: 22 }} />
                  </IconButton>
                </Stack>
              ))}
              <Typography fontWeight={700}>
                合計金額（1人あたり）：{yen(totalAmount)}
              </Typography>
              {totalAmount > 999999999 && (
                <Alert severity="error">
                  合計金額は999,999,999円以下にしてください
                </Alert>
              )}
            </Stack>
            <TextField
              name="dueDate"
              label="お支払期日"
              type="date"
              required
              defaultValue={today()}
              slotProps={{
                inputLabel: { shrink: true },
                htmlInput: { min: today() },
              }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={onClose}>
            キャンセル
          </Button>
          <Button
            variant="contained"
            type="submit"
            disabled={
              busy || !selected.length || selected.length > 100 || !validItems
            }
          >
            {selected.length > 1 ? `${selected.length}人分を発行` : '発行する'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
