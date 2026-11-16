-- CreateEnum
CREATE TYPE "CheckoutStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'EXPIRED');

-- CreateTable
CREATE TABLE "OnlineCheckout" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "planName" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerRef" TEXT,
    "status" "CheckoutStatus" NOT NULL DEFAULT 'PENDING',
    "failureReason" TEXT,
    "subscriptionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "OnlineCheckout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OnlineCheckout_providerRef_key" ON "OnlineCheckout"("providerRef");

-- CreateIndex
CREATE UNIQUE INDEX "OnlineCheckout_subscriptionId_key" ON "OnlineCheckout"("subscriptionId");

-- CreateIndex
CREATE INDEX "OnlineCheckout_memberId_createdAt_idx" ON "OnlineCheckout"("memberId", "createdAt");

-- AddForeignKey
ALTER TABLE "OnlineCheckout" ADD CONSTRAINT "OnlineCheckout_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnlineCheckout" ADD CONSTRAINT "OnlineCheckout_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnlineCheckout" ADD CONSTRAINT "OnlineCheckout_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
