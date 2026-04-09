# Payment System — Status & Pending

## What's Built (Done)

### Backend (routes/creator.js)
| Endpoint | Purpose |
|---|---|
| `GET /api/creator/payment-details` | Creator ka saved UPI/Bank fetch karo |
| `POST /api/creator/payment/add-upi` | Creator UPI save kare (Razorpay contact + fund account banta hai) |
| `POST /api/creator/payment/add-bank` | Creator bank account save kare |
| `GET /api/creator/all-payment-methods` | CEO — saare creators ki payment methods dekhe |
| `POST /api/creator/payment/verify` | CEO — creator ka method verify/unverify kare |
| `POST /api/creator/payout/initiate` | CEO — actual Razorpay Payout bheje |
| `GET /api/creator/payouts` | CEO — poori payout history |
| `GET /api/creator/my-payouts` | Creator — apni khud ki payout history |

### Database (Supabase — project: VELT)
- `creator_payment_methods` — UPI/Bank details + Razorpay IDs + verification status
- `payouts` — har ek payout transaction ka record (amount, status, campaign, date)

### Frontend
- **Creator Hub** → Profile → Earnings & Payouts section → UPI/Bank form → Payout history
- **CEO Hub** → Overview (Quick Payout form + stats) → Creators tab (Verify + Pay) → Payouts tab (history)

---

## Razorpay — Pending (Incomplete)

### Test Mode (Abhi)
- Keys: see `.env` (`RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET`)
- Contacts + Fund Accounts create hote hain ✅
- Actual money transfer NAHI hota (test mode) ❌
- Payout records Supabase me save hote hain ✅

### Live Mode Ke Liye Kya Karna Hai
1. Razorpay onboarding complete karo → `easy.razorpay.com`
2. KYC karo (Aadhaar + PAN)
3. Dashboard → Products → **Payouts** activate karo (Razorpay manually approve karta hai)
4. Ek source bank account link karo (jahan se payout jaayega)
5. Woh account number `.env` me daalo:
   ```
   RAZORPAY_ACCOUNT_NUMBER=your_account_number_here
   ```
6. Live keys `.env` me update karo:
   ```
   RAZORPAY_KEY_ID=rzp_live_...
   RAZORPAY_KEY_SECRET=...
   ```

### Flow (Jab Live Hoga)
```
Creator → UPI daalo → CEO Verify kare → CEO Pay kare → 
Razorpay → Creator ke UPI pe real money transfer
```

---

## .env Reference
See `.env.example` for the full list of required variables. Live values live in your local `.env` (gitignored) and on Vercel as project env vars:
```
RAZORPAY_KEY_ID=<from Razorpay dashboard>
RAZORPAY_KEY_SECRET=<from Razorpay dashboard>
SUPABASE_URL=<from Supabase project settings>
SUPABASE_SERVICE_KEY=<from Supabase project settings — NEVER commit>
RAZORPAY_ACCOUNT_NUMBER=   ← YEH ABHI EMPTY HAI, LIVE HONE PE DAALNA HAI
PORT=3000
```
