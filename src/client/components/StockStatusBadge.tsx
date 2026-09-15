import React from 'react';
import { Badge } from './ui/Badge';

export interface StockStatusBadgeProps {
  ordered: number;
  available?: number;
  size?: 'sm' | 'md';
}

export const StockStatusBadge: React.FC<StockStatusBadgeProps> = ({
  ordered,
  available,
  size = 'sm'
}) => {
  if (available === undefined) {
    return (
      <Badge variant="neutral" size={size}>
        Неизвестно
      </Badge>
    );
  }

  if (available >= ordered) {
    return (
      <Badge variant="success" size={size}>
        Достаточно
      </Badge>
    );
  }

  if (available > 0) {
    return (
      <Badge variant="warning" size={size}>
        Недостаточно
      </Badge>
    );
  }

  return (
    <Badge variant="error" size={size}>
      Отсутствует
    </Badge>
  );
};
