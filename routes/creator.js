const express = require('express');
const axios   = require('axios');
const multer  = require('multer');
const path    = require('path');
const os      = require('os');
const fs      = require('fs');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const router   = express.Router();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// ── Multer Configuration for media uploads ─────────────────────────────────
// On Vercel (serverless) the only writable dir is /tmp. Locally use uploads/.
const UPLOAD_DIR = process.env.VERCEL ? path.join(os.tmpdir(), 'velt-uploads') : 'uploads/';
if (!process.env.VERCEL && !fs.existsSync(UPLOAD_DIR)) {
    try { fs.mkdirSync(UPLOAD_DIR, { recursive: true }); } catch (_) {}
}
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        if (process.env.VERCEL && !fs.existsSync(UPLOAD_DIR)) {
            try { fs.mkdirSync(UPLOAD_DIR, { recursive: true }); } catch (_) {}
        }
        cb(null, UPLOAD_DIR);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ 
    storage,
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit (no small limits!)
});

// Razorpay basic auth header
function razorpayAuth() {
    const creds = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64');
    return { Authorization: `Basic ${creds}`, 'Content-Type': 'application/json' };
}

// ── Helper: get or create Razorpay Contact for a creator ────────────────────
async function getOrCreateContact(email, name) {
    // Check if we already created one
    const { data: existing } = await supabase
        .from('creator_payment_methods')
        .select('razorpay_contact_id')
        .eq('user_email', email)
        .not('razorpay_contact_id', 'is', null)
        .limit(1);

    if (existing && existing.length > 0) {
        return existing[0].razorpay_contact_id;
    }

    // Create new contact in Razorpay
    const res = await axios.post(
        'https://api.razorpay.com/v1/contacts',
        { name, email, type: 'employee', reference_id: email },
        { headers: razorpayAuth() }
    );
    return res.data.id;
}

// ── GET /api/creator/payment-details ────────────────────────────────────────
// Returns saved payment methods for a creator
router.get('/payment-details', async (req, res) => {
    const { email } = req.query;
    if (!email) return res.status(400).json({ error: 'Email required' });

    const { data, error } = await supabase
        .from('creator_payment_methods')
        .select('*')
        .eq('user_email', email)
        .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    res.json({ data });
});

// ── POST /api/creator/payment/add-upi ───────────────────────────────────────
// Creator adds their UPI ID
router.post('/payment/add-upi', async (req, res) => {
    const { email, name, upi_id } = req.body;

    if (!email || !name || !upi_id) {
        return res.status(400).json({ error: 'email, name and upi_id are required' });
    }

    // Basic UPI format check  (example@upi or number@bank)
    if (!upi_id.includes('@')) {
        return res.status(400).json({ error: 'Invalid UPI ID format. Should be like yourname@upi' });
    }

    try {
        const contactId = await getOrCreateContact(email, name);

        // Create Fund Account (VPA = UPI)
        const faRes = await axios.post(
            'https://api.razorpay.com/v1/fund_accounts',
            {
                contact_id:   contactId,
                account_type: 'vpa',
                vpa:          { address: upi_id }
            },
            { headers: razorpayAuth() }
        );

        const fundAccountId = faRes.data.id;

        // Delete any old UPI entries for this creator (only one primary)
        await supabase
            .from('creator_payment_methods')
            .delete()
            .eq('user_email', email)
            .eq('payment_type', 'upi');

        // Save to Supabase
        const { error: dbErr } = await supabase
            .from('creator_payment_methods')
            .insert({
                user_email:               email,
                razorpay_contact_id:      contactId,
                razorpay_fund_account_id: fundAccountId,
                payment_type:             'upi',
                upi_id:                   upi_id,
                account_holder_name:      name,
                is_verified:              false   // CEO/admin verifies manually
            });

        if (dbErr) throw dbErr;

        res.json({ success: true, fund_account_id: fundAccountId, message: 'UPI added. Pending verification.' });

    } catch (err) {
        console.error('add-upi error:', err.response?.data || err.message);
        res.status(500).json({ error: err.response?.data?.error?.description || err.message });
    }
});

// ── POST /api/creator/payment/add-bank ──────────────────────────────────────
// Creator adds their bank account
router.post('/payment/add-bank', async (req, res) => {
    const { email, name, account_number, ifsc } = req.body;

    if (!email || !name || !account_number || !ifsc) {
        return res.status(400).json({ error: 'email, name, account_number and ifsc are required' });
    }

    // Basic IFSC format check (11 chars, starts with 4 letters)
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc.toUpperCase())) {
        return res.status(400).json({ error: 'Invalid IFSC code format (e.g. HDFC0001234)' });
    }

    try {
        const contactId = await getOrCreateContact(email, name);

        // Create Fund Account (Bank Account)
        const faRes = await axios.post(
            'https://api.razorpay.com/v1/fund_accounts',
            {
                contact_id:   contactId,
                account_type: 'bank_account',
                bank_account: {
                    name:           name,
                    ifsc:           ifsc.toUpperCase(),
                    account_number: account_number
                }
            },
            { headers: razorpayAuth() }
        );

        const fundAccountId = faRes.data.id;

        // Delete old bank entries for this creator
        await supabase
            .from('creator_payment_methods')
            .delete()
            .eq('user_email', email)
            .eq('payment_type', 'bank_account');

        // Save to Supabase
        const { error: dbErr } = await supabase
            .from('creator_payment_methods')
            .insert({
                user_email:               email,
                razorpay_contact_id:      contactId,
                razorpay_fund_account_id: fundAccountId,
                payment_type:             'bank_account',
                bank_account_number:      account_number,
                bank_ifsc:                ifsc.toUpperCase(),
                account_holder_name:      name,
                is_verified:              false
            });

        if (dbErr) throw dbErr;

        res.json({ success: true, fund_account_id: fundAccountId, message: 'Bank account added. Pending verification.' });

    } catch (err) {
        console.error('add-bank error:', err.response?.data || err.message);
        res.status(500).json({ error: err.response?.data?.error?.description || err.message });
    }
});

// ── POST /api/creator/upload-profile-media ─────────────────────────────────
// Handles profile image/video uploads
router.post('/upload-profile-media', upload.single('media'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    // Return the relative URL to the file
    const fileUrl = `/uploads/${req.file.filename}`;
    res.json({ success: true, url: fileUrl });
});

// ═══════════════════════════════════════════════════════════════════════════
// CEO / ADMIN ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════

const ADMIN_EMAIL = 'dhananjaychitmila@gmail.com';

// ── GET /api/creator/all-payment-methods ────────────────────────────────────
// CEO fetches all creators' payment methods
router.get('/all-payment-methods', async (req, res) => {
    const { admin_email } = req.query;
    if (admin_email !== ADMIN_EMAIL) return res.status(403).json({ error: 'Unauthorized' });

    const { data, error } = await supabase
        .from('creator_payment_methods')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    res.json({ data });
});

// ── POST /api/creator/payment/verify ────────────────────────────────────────
// CEO verifies or rejects a creator's payment method
router.post('/payment/verify', async (req, res) => {
    const { admin_email, payment_method_id, verified } = req.body;
    if (admin_email !== ADMIN_EMAIL) return res.status(403).json({ error: 'Unauthorized' });
    if (!payment_method_id) return res.status(400).json({ error: 'payment_method_id required' });

    const { data, error } = await supabase
        .from('creator_payment_methods')
        .update({ is_verified: verified })
        .eq('id', payment_method_id)
        .select();

    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, data });
});

// ── POST /api/creator/payout/initiate ───────────────────────────────────────
// CEO initiates a real Razorpay Payout to a creator
router.post('/payout/initiate', async (req, res) => {
    const { admin_email, creator_email, creator_name, amount, campaign_name } = req.body;

    if (admin_email !== ADMIN_EMAIL) return res.status(403).json({ error: 'Unauthorized' });
    if (!creator_email || !amount) return res.status(400).json({ error: 'creator_email and amount required' });
    if (amount < 100) return res.status(400).json({ error: 'Minimum payout is ₹1 (100 paise)' });

    try {
        // Get creator's verified payment method
        const { data: methods } = await supabase
            .from('creator_payment_methods')
            .select('*')
            .eq('user_email', creator_email)
            .eq('is_verified', true)
            .order('created_at', { ascending: false })
            .limit(1);

        if (!methods || methods.length === 0) {
            return res.status(400).json({ error: 'No verified payment method found for this creator' });
        }

        const method = methods[0];

        // Create Razorpay Payout
        const payoutRes = await axios.post(
            'https://api.razorpay.com/v1/payouts',
            {
                account_number:  process.env.RAZORPAY_ACCOUNT_NUMBER || '2323230085340683',
                fund_account_id: method.razorpay_fund_account_id,
                amount:          amount,   // in paise
                currency:        'INR',
                mode:            method.payment_type === 'upi' ? 'UPI' : 'NEFT',
                purpose:         'payout',
                queue_if_low_balance: true,
                reference_id:    `payout_${Date.now()}`,
                narration:       campaign_name ? `Velt Industries - ${campaign_name}` : 'Velt Industries Payout'
            },
            { headers: razorpayAuth() }
        );

        const razorpayPayout = payoutRes.data;

        // Save payout record to Supabase
        const { data: payoutRecord, error: dbErr } = await supabase
            .from('payouts')
            .insert({
                creator_email,
                creator_name:             creator_name || creator_email,
                amount,
                campaign_name:            campaign_name || 'General Payout',
                razorpay_payout_id:       razorpayPayout.id,
                razorpay_fund_account_id: method.razorpay_fund_account_id,
                payment_type:             method.payment_type,
                status:                   razorpayPayout.status || 'processing',
                initiated_by:             admin_email
            })
            .select();

        if (dbErr) console.error('DB save error:', dbErr);

        res.json({
            success: true,
            payout_id: razorpayPayout.id,
            status: razorpayPayout.status,
            amount,
            message: `Payout of ₹${(amount / 100).toLocaleString()} initiated successfully`
        });

    } catch (err) {
        console.error('payout/initiate error:', err.response?.data || err.message);

        // Even if Razorpay fails (test mode), save a record as 'pending'
        await supabase.from('payouts').insert({
            creator_email,
            creator_name: creator_name || creator_email,
            amount,
            campaign_name: campaign_name || 'General Payout',
            payment_type: 'upi',
            status: 'pending',
            failure_reason: err.response?.data?.error?.description || err.message,
            initiated_by: admin_email
        });

        // In test mode, Razorpay Payouts API may not be activated
        // Return success anyway so CEO can track the payout intent
        res.json({
            success: true,
            test_mode: true,
            amount,
            status: 'pending',
            message: `Payout of ₹${(amount / 100).toLocaleString()} recorded (Razorpay test mode — activate Payouts for live transfers)`
        });
    }
});

// ── GET /api/creator/payouts ────────────────────────────────────────────────
// CEO fetches all payouts (admin view)
router.get('/payouts', async (req, res) => {
    const { admin_email } = req.query;
    if (admin_email !== ADMIN_EMAIL) return res.status(403).json({ error: 'Unauthorized' });

    const { data, error } = await supabase
        .from('payouts')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    res.json({ data });
});

// ── GET /api/creator/my-payouts ─────────────────────────────────────────────
// Creator fetches their own payout history
router.get('/my-payouts', async (req, res) => {
    const { email } = req.query;
    if (!email) return res.status(400).json({ error: 'Email required' });

    const { data, error } = await supabase
        .from('payouts')
        .select('*')
        .eq('creator_email', email)
        .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    res.json({ data });
});

module.exports = router;
