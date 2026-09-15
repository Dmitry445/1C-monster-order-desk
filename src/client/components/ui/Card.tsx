import React from 'react';
import './Card.css';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  noPadding?: boolean;
}

export const Card: React.FC<CardProps> = ({
  title,
  noPadding = false,
  className = '',
  children,
  ...props
}) => {
  return (
    <div className={`card ${className}`} {...props}>
      {title !== undefined && title !== '' && <div className="card-header">{title}</div>}
      <div className={noPadding ? '' : 'card-content'}>{children}</div>
    </div>
  );
};
