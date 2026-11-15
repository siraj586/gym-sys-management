-- Payments are taken in cash or with Whish Money; bank transfers are no longer used.
-- Renaming the value converts every existing bank-transfer payment to Whish Money.
ALTER TYPE "PaymentMethod" RENAME VALUE 'BANK_TRANSFER' TO 'WHISH_MONEY';
