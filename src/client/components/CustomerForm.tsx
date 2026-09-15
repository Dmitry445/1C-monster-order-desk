import { useState } from 'react';
import { formatRussianPhone, getRussianPhoneNationalDigits } from '../../shared/phoneFormat';
import type { Customer } from '../../shared/types';
import './CustomerForm.css';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { Input } from './ui/Input';

interface CustomerFormProps {
  customer: Customer;
  onChange: (customer: Customer) => void;
  onSubmit: () => void;
  loading: boolean;
  previewName: string;
  submitLabel?: string;
}

function validatePhone(phone: string): string | undefined {
  if (phone.trim() === '') return undefined;
  if (getRussianPhoneNationalDigits(phone).length !== 10) {
    return 'Введите 10 цифр номера телефона';
  }
  return undefined;
}

function validateEmail(email: string): string | undefined {
  if (email.trim() === '') return undefined;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return 'Неверный формат email';
  }
  return undefined;
}

export function CustomerForm({
  customer,
  onChange,
  onSubmit,
  loading,
  previewName,
  submitLabel = 'Сформировать документ'
}: CustomerFormProps) {
  const [submitted, setSubmitted] = useState(false);
  const handleChange = (field: keyof Customer) => (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({
      ...customer,
      [field]: field === 'phone' ? formatRussianPhone(e.target.value) : e.target.value
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (isValid) onSubmit();
  };

  const phoneError = validatePhone(customer.phone);
  const emailError = validateEmail(customer.email);

  const isValid =
    customer.lastName.trim() !== '' &&
    customer.firstName.trim() !== '' &&
    customer.phone.trim() !== '' &&
    customer.email.trim() !== '' &&
    phoneError === undefined &&
    emailError === undefined;

  return (
    <Card>
      <form onSubmit={handleSubmit} className="customer-form">
        <h3 className="customer-form__title">Данные получателя</h3>

        <div className="customer-form__grid">
          <Input
            label="Фамилия"
            value={customer.lastName}
            onChange={handleChange('lastName')}
            placeholder="Иванов"
            disabled={loading}
            required
            error={submitted && customer.lastName.trim() === '' ? 'Укажите фамилию' : undefined}
          />

          <Input
            label="Имя"
            value={customer.firstName}
            onChange={handleChange('firstName')}
            placeholder="Иван"
            disabled={loading}
            required
            error={submitted && customer.firstName.trim() === '' ? 'Укажите имя' : undefined}
          />

          <Input
            label="Отчество"
            value={customer.middleName ?? ''}
            onChange={handleChange('middleName')}
            placeholder="Иванович"
            disabled={loading}
            helperText="Необязательное поле"
          />

          <Input
            label="Телефон"
            type="tel"
            value={customer.phone}
            onChange={handleChange('phone')}
            placeholder="+7 (999) 123-45-67"
            disabled={loading}
            required
            error={
              submitted && customer.phone.trim() === ''
                ? 'Укажите телефон'
                : customer.phone.trim() !== ''
                  ? phoneError
                  : undefined
            }
          />

          <Input
            label="Email"
            type="email"
            value={customer.email}
            onChange={handleChange('email')}
            placeholder="ivanov@example.com"
            disabled={loading}
            required
            error={
              submitted && customer.email.trim() === ''
                ? 'Укажите email'
                : customer.email.trim() !== ''
                  ? emailError
                  : undefined
            }
          />
        </div>

        {previewName !== '' && (
          <div className="customer-form__preview">
            <span className="customer-form__preview-label">В документе будет указано:</span>
            <span className="customer-form__preview-value">Выдать {previewName}</span>
          </div>
        )}

        <div className="customer-form__actions">
          <Button type="submit" variant="primary" disabled={loading}>
            {loading ? 'Формирование документа...' : submitLabel}
          </Button>
        </div>
      </form>
    </Card>
  );
}
