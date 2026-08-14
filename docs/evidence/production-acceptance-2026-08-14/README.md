# Production acceptance evidence — 14 August 2026

This packet records the final JustUrbanWears Shop and Studio acceptance run.

## Release

- Application commit: `83987c8ece4dca1dc9d1b2c570f82e01d1771081`
- Production deployment: `dpl_EsC1CjwvWmdd9siWuvPFkaeGoRtb`
- Production URL: <https://www.justurbanwears.com>
- Return window: 7 days

## Real interface captures

- `01-checkout-pickup.jpg` — checkout with Studio pickup selected and an exact order summary.
- `02-order-created.jpg` — the newly created order asking for a transfer receipt.

The remaining order lifecycle was validated live through collection, return, refund, and restock. Browser-visible final copy included **Return complete**, **Another reason**, **Refund complete**, and **Restocked**. The temporary acceptance order and private receipt were then deleted. JUW-001 remained `AVAILABLE`, with one-off inventory conservation intact.

Later-stage screenshots are not represented as real captures because the browser capture backend stopped producing images during that portion of the run. The verification record below preserves the live API and database outcomes without fabricating screenshots.

## Verification record

- Customer flow: add to bag → checkout → order → receipt → payment → pickup → return → refund → restock.
- Final temporary order state before cleanup: `COMPLETED`.
- Final temporary return state before cleanup: `RESOLVED`, refund `COMPLETED`, disposition `RESTOCK`.
- Cleanup: exact temporary order, child records, private receipt, preview deployments, and disposable Neon branch removed.
- Inventory after cleanup: JUW-001 `AVAILABLE`; on hand 1; reserved 0; conservation true.
- Production smoke: Shop, Studio auth handoff, product page, logo/icon assets, PNG fallbacks, and manifest all healthy.

Use [LULU-QUICK-GUIDE.md](./LULU-QUICK-GUIDE.md) as the current action guide.
