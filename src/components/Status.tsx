import { Chip } from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import type { Invoice } from '../../shared/types';
import { today } from '../api';

export default function Status({ invoice }: { invoice: Invoice }) {
  const overdue =
    invoice.status !== 'completed' &&
    invoice.status !== 'cancelled' &&
    invoice.dueDate < today();
  const status = overdue ? 'overdue' : invoice.status;
  const styles = {
    issued: {
      color: '#854d0e',
      backgroundColor: '#fef3c7',
      borderColor: '#f5cf70',
    },
    sent: {
      color: '#0031d8',
      backgroundColor: '#edf2ff',
      borderColor: '#b8c9ff',
    },
    completed: {
      color: '#17643b',
      backgroundColor: '#e8f5ec',
      borderColor: '#a8d5b8',
    },
    cancelled: {
      color: '#586174',
      backgroundColor: '#f0f1f4',
      borderColor: '#cbd0d9',
    },
    overdue: {
      color: '#b42318',
      backgroundColor: '#fef0ed',
      borderColor: '#f3b5ad',
    },
  };
  return (
    <Chip
      size="small"
      variant="outlined"
      sx={{
        ...styles[status],
        fontWeight: 700,
        '& .MuiChip-icon': { color: 'inherit' },
      }}
      icon={invoice.status === 'completed' ? <CheckIcon /> : undefined}
      label={
        invoice.status === 'completed'
          ? '完了'
          : invoice.status === 'cancelled'
            ? '取り消し済み'
            : overdue
              ? '期日超過'
              : invoice.status === 'sent'
                ? '送信済み'
                : '未送信'
      }
    />
  );
}
