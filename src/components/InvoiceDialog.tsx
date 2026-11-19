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
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
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
  type Draft = { items: ReturnType<typeof newItem>[]; dueDate: string };
  const newDraft = (): Draft => ({ items: [newItem()], dueDate: today() });
  const [mode, setMode] = useState<'bulk' | 'individual'>('bulk');
  const [dismissedHints, setDismissedHints] = useState({
    bulk: false,
    individual: false,
  });
  const [bulk, setBulk] = useState<Draft>(newDraft);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [activeId, setActiveId] = useState('');
  const activeIndex = Math.max(
    0,
    selected.findIndex((contact) => contact.id === activeId),
  );
  const activeContact = selected[activeIndex];
  const draft = mode === 'bulk' ? bulk : drafts[activeContact?.id];
  const items = draft?.items ?? [];
  const updateDraft = (update: (value: Draft) => Draft) => {
    if (mode === 'bulk') setBulk(update);
    else if (activeContact)
      setDrafts((values) => ({
        ...values,
        [activeContact.id]: update(values[activeContact.id]),
      }));
  };
  const setItems = (update: (rows: Draft['items']) => Draft['items']) =>
    updateDraft((value) => ({ ...value, items: update(value.items) }));
  const [history, setHistory] = useState<string[]>([]);
  const totalAmount = items.reduce((sum, item) => sum + Number(item.amount), 0);
  const isValid = (value?: Draft) =>
    !!value &&
    value.items.length > 0 &&
    value.items.every(
      (item) =>
        item.description.trim() &&
        item.description.trim().length <= 160 &&
        Number.isInteger(Number(item.amount)) &&
        Number(item.amount) > 0,
    ) &&
    value.items.reduce((sum, item) => sum + Number(item.amount), 0) <=
      999999999 &&
    /^\d{4}-\d{2}-\d{2}$/.test(value.dueDate) &&
    value.dueDate >= today();
  const validItems =
    mode === 'bulk'
      ? isValid(bulk)
      : selected.every((contact) => isValid(drafts[contact.id]));
  useEffect(() => {
    if (!open) return;
    let active = true;
    setBulk(newDraft());
    setDrafts({});
    setMode('bulk');
    setDismissedHints({ bulk: false, individual: false });
    setActiveId('');
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
          if (busy || selected.length > 100 || !validItems) return;
          const serialize = (value: Draft) => ({
            items: value.items.map((item) => ({
              description: item.description,
              amount: Number(item.amount),
            })),
            dueDate: value.dueDate,
          });
          onSubmit(
            mode === 'bulk'
              ? {
                  mode,
                  contactIds: selected.map((contact) => contact.id),
                  ...serialize(bulk),
                }
              : {
                  mode,
                  invoices: selected.map((contact) => ({
                    contactId: contact.id,
                    ...serialize(drafts[contact.id]),
                  })),
                },
          );
        }}
      >
        <DialogTitle>請求書を発行</DialogTitle>
        <DialogContent>
          <Stack spacing={3} sx={{ pt: 1 }}>
            <ToggleButtonGroup
              exclusive
              value={mode}
              disabled={busy}
              onChange={(_event, value) => {
                if (value) setMode(value);
              }}
              aria-label="請求書の作成モード"
              fullWidth
            >
              <ToggleButton value="individual">個別モード</ToggleButton>
              <ToggleButton value="bulk">一括モード</ToggleButton>
            </ToggleButtonGroup>
            {!dismissedHints[mode] && (
              <Alert
                severity="info"
                closeText="説明を閉じる"
                onClose={() =>
                  setDismissedHints((previous) => ({
                    ...previous,
                    [mode]: true,
                  }))
                }
              >
                {mode === 'bulk'
                  ? '選択した全員に、同じ内容・金額・支払期日で請求書を作成します。金額は1人あたりです。'
                  : '左右の矢印で宛先を切り替え、内容・金額・支払期日を個別に入力してください。'}
              </Alert>
            )}
            <Autocomplete
              multiple
              disableCloseOnSelect
              options={contacts}
              value={selected}
              disabled={busy}
              onChange={(_event, value) => {
                setSelected(value);
                setDrafts((previous) => {
                  const next = { ...previous };
                  value.forEach((contact) => {
                    next[contact.id] ??= newDraft();
                  });
                  return next;
                });
              }}
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
            {total > 25 && (
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
            )}
            {mode === 'individual' && (
              <Stack
                direction="row"
                alignItems="center"
                justifyContent="space-between"
                spacing={1}
              >
                <IconButton
                  aria-label="前の宛先"
                  disabled={busy || activeIndex === 0}
                  onClick={() => setActiveId(selected[activeIndex - 1].id)}
                >
                  <ChevronLeftIcon />
                </IconButton>
                <Stack
                  sx={{
                    minWidth: 0,
                    textAlign: 'center',
                    overflowWrap: 'anywhere',
                  }}
                  aria-live="polite"
                >
                  <Typography fontWeight={700}>
                    {activeContact
                      ? `${activeContact.name} (${activeContact.email})`
                      : '宛先を選択してください'}
                  </Typography>
                  <Typography variant="caption">
                    {selected.length ? activeIndex + 1 : 0} / {selected.length}
                    人 · 入力済み{' '}
                    {
                      selected.filter((contact) => isValid(drafts[contact.id]))
                        .length
                    }
                    人
                  </Typography>
                </Stack>
                <IconButton
                  aria-label="次の宛先"
                  disabled={busy || activeIndex >= selected.length - 1}
                  onClick={() => setActiveId(selected[activeIndex + 1].id)}
                >
                  <ChevronRightIcon />
                </IconButton>
              </Stack>
            )}
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
                {mode === 'bulk'
                  ? '合計金額（1人あたり）'
                  : 'この宛先の合計金額'}
                ：{yen(totalAmount)}
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
              value={draft?.dueDate ?? ''}
              disabled={busy || !draft}
              onChange={(event) =>
                updateDraft((value) => ({
                  ...value,
                  dueDate: event.target.value,
                }))
              }
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
