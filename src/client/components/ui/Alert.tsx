import React from 'react';
import './Alert.css';

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'success' | 'warning' | 'error' | 'info';
  title?: string;
}

export const Alert: React.FC<AlertProps> = ({
  variant = 'info',
  title,
  className = '',
  children,
  ...props
}) => {
  const classes = ['alert', `alert-${variant}`, className].filter(Boolean).join(' ');

  return (
    <div className={classes} role="alert" {...props}>
      {title !== undefined && title !== '' && <div className="alert-title">{title}</div>}
      <div className="alert-content">{children}</div>
    </div>
  );
};
