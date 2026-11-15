import { startCheckoutSchema } from '@calisthenics/shared';
import express, { Router } from 'express';
import { z } from 'zod';
import { AppError } from '../../lib/errors.js';
import { formatCents } from '../../lib/money.js';
import { currentUser, requireAuth, requireRole } from '../../middleware/auth.js';
import * as checkoutService from './checkout.service.js';
import { FAKE_SIGNATURE_HEADER, FakeProvider } from './providers/fake.js';
import { paymentProvider } from './providers/index.js';

// ---------- /api/portal/checkout: the signed-in client ----------

export const portalCheckoutRouter = Router();

portalCheckoutRouter.use(requireAuth, requireRole('CLIENT'));

portalCheckoutRouter.get('/options', async (req, res) => {
  res.json(await checkoutService.options(currentUser(req).id));
});

portalCheckoutRouter.post('/', async (req, res) => {
  const { planId } = startCheckoutSchema.parse(req.body);
  res.status(201).json(await checkoutService.start(currentUser(req).id, planId));
});

portalCheckoutRouter.get('/:id', async (req, res) => {
  res.json(await checkoutService.state(currentUser(req).id, req.params.id));
});

// ---------- /api/checkout: the provider's side, no sign-in ----------

/**
 * Mounted BEFORE the global JSON parser: a notification's signature is checked
 * over the exact bytes received, so this router reads the raw body itself.
 */
export const checkoutProviderRouter = Router();

checkoutProviderRouter.post(
  '/notify/:provider',
  express.raw({ type: '*/*', limit: '100kb' }),
  async (req, res) => {
    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    await checkoutService.handleNotification(req.params.provider, { headers: req.headers, body });
    res.status(200).json({ received: true });
  },
);

function fakeProvider(): FakeProvider {
  const provider = paymentProvider();
  if (!(provider instanceof FakeProvider)) {
    throw new AppError(404, 'NOT_FOUND', 'No simulated payment page here.');
  }
  return provider;
}

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** The simulated provider's payment page (development only). */
checkoutProviderRouter.get('/fake/:ref', (req, res) => {
  const session = fakeProvider().sessions.get(req.params.ref);
  if (!session) throw new AppError(404, 'CHECKOUT_NOT_FOUND', 'This payment does not exist.');
  const amount = escapeHtml(formatCents(session.amountCents, session.currency));
  const action = `/api/checkout/fake/${encodeURIComponent(req.params.ref)}/decide`;
  res.type('html').send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Simulated payment</title>
<style>
body{margin:0;font-family:system-ui,sans-serif;background:#f4f4f5;color:#18181b;display:grid;place-items:center;min-height:100vh}
main{background:#fff;border-radius:12px;padding:28px;max-width:360px;width:calc(100% - 32px);box-shadow:0 4px 24px #0002}
.tag{display:inline-block;background:#fef3c7;color:#92400e;border-radius:999px;padding:4px 10px;font-size:12px;font-weight:600}
h1{font-size:20px;margin:14px 0 4px}.amount{font-size:34px;font-weight:700;margin:14px 0}
p{color:#52525b;font-size:14px;margin:0}form{display:flex;gap:10px;margin-top:22px}
button{flex:1;min-height:48px;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer}
.pay{background:#16a34a;color:#fff;border:0}.cancel{background:#fff;border:1px solid #d4d4d8}
</style></head><body><main>
<span class="tag">SIMULATION — no real money</span>
<h1>Pay with Whish (simulated)</h1>
<p>${escapeHtml(session.description)}</p>
<div class="amount">${amount}</div>
<p>This page stands in for Whish while its integration is not connected. It only exists in development.</p>
<form method="post" action="${action}">
<button class="cancel" name="decision" value="cancel">Cancel</button>
<button class="pay" name="decision" value="pay">Pay</button>
</form></main></body></html>`);
});

const decisionBody = z.object({ decision: z.enum(['pay', 'cancel']) });

/** A button on the simulated page: notify like a provider would, then send the client back. */
checkoutProviderRouter.post(
  '/fake/:ref/decide',
  express.urlencoded({ extended: false, limit: '10kb' }),
  async (req, res) => {
    const provider = fakeProvider();
    const session = provider.sessions.get(req.params.ref);
    if (!session) throw new AppError(404, 'CHECKOUT_NOT_FOUND', 'This payment does not exist.');
    const { decision } = decisionBody.parse(req.body);
    const { body, signature } = provider.notificationFor(
      req.params.ref,
      decision === 'pay' ? 'PAID' : 'FAILED',
    );
    await checkoutService.handleNotification('fake', {
      headers: { [FAKE_SIGNATURE_HEADER]: signature },
      body: Buffer.from(body),
    });
    res.redirect(303, session.returnUrl);
  },
);
