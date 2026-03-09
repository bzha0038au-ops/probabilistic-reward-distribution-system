import Decimal from 'decimal.js';

export type MoneyValue = Decimal.Value;

export const toDecimal = (value: MoneyValue) => new Decimal(value);

export const toMoneyString = (value: MoneyValue) =>
  toDecimal(value).toFixed(2);
