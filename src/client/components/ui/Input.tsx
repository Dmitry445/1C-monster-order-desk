import React from 'react';
import './Input.css';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, className = '', id, ...props }, ref) => {
    const inputId = id ?? `input-${Math.random().toString(36).substr(2, 9)}`;
    const errorId = error !== undefined && error !== '' ? `${inputId}-error` : undefined;
    const helperId =
      helperText !== undefined && helperText !== '' ? `${inputId}-helper` : undefined;
    const describedBy = [errorId, helperId]
      .filter((value): value is string => value !== undefined)
      .join(' ');

    return (
      <div className={`input-wrapper ${className}`}>
        {label !== undefined && label !== '' && (
          <label htmlFor={inputId} className="input-label">
            {label}
            {props.required === true && (
              <span className="input-required" aria-label="обязательное поле">
                {' '}
                *
              </span>
            )}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={`input ${error !== undefined && error !== '' ? 'input-error input--error' : ''}`}
          aria-invalid={error !== undefined && error !== '' ? 'true' : undefined}
          aria-describedby={describedBy !== '' ? describedBy : undefined}
          {...props}
        />
        {error !== undefined && error !== '' && (
          <div id={errorId} className="input-message input-message-error" role="alert">
            {error}
          </div>
        )}
        {helperText !== undefined && helperText !== '' && (error === undefined || error === '') && (
          <div id={helperId} className="input-message input-message-helper">
            {helperText}
          </div>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
