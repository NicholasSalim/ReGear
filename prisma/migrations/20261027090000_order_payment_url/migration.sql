-- Hosted payment page (Midtrans Snap) for an unpaid order, reused on every "Pay" click.
ALTER TABLE "Order" ADD COLUMN "paymentUrl" TEXT;
