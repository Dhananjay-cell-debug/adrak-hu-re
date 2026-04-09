const express = require('express');
const multer  = require('multer');
const path    = require('path');
const os      = require('os');
const fs      = require('fs');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const router   = express.Router();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const ADMIN_EMAIL = 'dhananjaychitmila@gmail.com';

// Multer for brand logo uploads
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
        cb(null, 'brand-' + uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// ══════════════════════════════════════════════════════════════════════════════
// BRAND ENDPOINTS
// ══════════════════════════════════════════════════════════════════════════════

// ── POST /api/brand/register ──────────────────────────────────────────────────
// Brand registers/updates their profile
router.post('/register', async (req, res) => {
    const { email, company_name, contact_person, phone, website, industry, description } = req.body;

    if (!email || !company_name) {
        return res.status(400).json({ error: 'email and company_name are required' });
    }

    try {
        // Check if brand already exists
        const { data: existing } = await supabase
            .from('brands')
            .select('id')
            .eq('email', email)
            .limit(1);

        if (existing && existing.length > 0) {
            // Update existing brand
            const { data, error } = await supabase
                .from('brands')
                .update({ company_name, contact_person, phone, website, industry, description })
                .eq('email', email)
                .select();

            if (error) throw error;
            return res.json({ success: true, data: data[0], message: 'Brand profile updated' });
        }

        // Create new brand
        const { data, error } = await supabase
            .from('brands')
            .insert({ email, company_name, contact_person, phone, website, industry, description })
            .select();

        if (error) throw error;
        res.json({ success: true, data: data[0], message: 'Brand registered. Pending verification.' });

    } catch (err) {
        console.error('brand/register error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ── POST /api/brand/upload-logo ───────────────────────────────────────────────
router.post('/upload-logo', upload.single('logo'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const logoUrl = `/uploads/${req.file.filename}`;
    const email = req.body.email;

    if (email) {
        await supabase.from('brands').update({ logo_url: logoUrl }).eq('email', email);
    }

    res.json({ success: true, url: logoUrl });
});

// ── GET /api/brand/profile ────────────────────────────────────────────────────
router.get('/profile', async (req, res) => {
    const { email } = req.query;
    if (!email) return res.status(400).json({ error: 'Email required' });

    const { data, error } = await supabase
        .from('brands')
        .select('*')
        .eq('email', email)
        .limit(1);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ data: data && data.length > 0 ? data[0] : null });
});

// ── POST /api/brand/campaign/create ───────────────────────────────────────────
// Brand publishes a new campaign
router.post('/campaign/create', async (req, res) => {
    const { email, title, description, category, pay_per_reel, total_budget, total_slots, deadline, requirements, reference_links, color, bg_color } = req.body;

    if (!email || !title || !pay_per_reel || !total_slots) {
        return res.status(400).json({ error: 'email, title, pay_per_reel, and total_slots are required' });
    }

    try {
        // Get brand ID
        const { data: brand } = await supabase
            .from('brands')
            .select('id, status')
            .eq('email', email)
            .limit(1);

        if (!brand || brand.length === 0) {
            return res.status(400).json({ error: 'Brand not registered. Please complete your profile first.' });
        }

        const { data, error } = await supabase
            .from('brand_campaigns')
            .insert({
                brand_id: brand[0].id,
                brand_email: email,
                title,
                description,
                category: category || 'general',
                pay_per_reel: parseInt(pay_per_reel),
                total_budget: parseInt(total_budget) || (parseInt(pay_per_reel) * parseInt(total_slots)),
                total_slots: parseInt(total_slots),
                deadline,
                requirements,
                reference_links,
                color: color || '#3b82f6',
                bg_color: bg_color || '#EFF6FF',
                status: 'pending_review'
            })
            .select();

        if (error) throw error;
        res.json({ success: true, data: data[0], message: 'Campaign submitted for CEO review.' });

    } catch (err) {
        console.error('campaign/create error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ── GET /api/brand/campaigns ──────────────────────────────────────────────────
// Brand fetches their own campaigns
router.get('/campaigns', async (req, res) => {
    const { email } = req.query;
    if (!email) return res.status(400).json({ error: 'Email required' });

    const { data, error } = await supabase
        .from('brand_campaigns')
        .select('*')
        .eq('brand_email', email)
        .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    res.json({ data });
});

// ── GET /api/brand/campaign/:id/enrollments ───────────────────────────────────
// Brand sees who enrolled in their campaign
router.get('/campaign/:id/enrollments', async (req, res) => {
    const { email } = req.query;
    if (!email) return res.status(400).json({ error: 'Email required' });

    // Verify brand owns this campaign
    const { data: campaign } = await supabase
        .from('brand_campaigns')
        .select('brand_email')
        .eq('id', req.params.id)
        .limit(1);

    if (!campaign || campaign.length === 0) return res.status(404).json({ error: 'Campaign not found' });
    if (campaign[0].brand_email !== email && email !== ADMIN_EMAIL) {
        return res.status(403).json({ error: 'Unauthorized' });
    }

    const { data, error } = await supabase
        .from('campaign_enrollments')
        .select('*')
        .eq('campaign_id', req.params.id)
        .order('enrolled_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    res.json({ data });
});

// ══════════════════════════════════════════════════════════════════════════════
// CEO ENDPOINTS FOR BRAND MANAGEMENT
// ══════════════════════════════════════════════════════════════════════════════

// ── GET /api/brand/all ────────────────────────────────────────────────────────
// CEO fetches all brands
router.get('/all', async (req, res) => {
    const { admin_email } = req.query;
    if (admin_email !== ADMIN_EMAIL) return res.status(403).json({ error: 'Unauthorized' });

    const { data, error } = await supabase
        .from('brands')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    res.json({ data });
});

// ── POST /api/brand/verify ────────────────────────────────────────────────────
// CEO verifies/activates a brand
router.post('/verify', async (req, res) => {
    const { admin_email, brand_id, verified } = req.body;
    if (admin_email !== ADMIN_EMAIL) return res.status(403).json({ error: 'Unauthorized' });

    const status = verified ? 'active' : 'pending';
    const { data, error } = await supabase
        .from('brands')
        .update({ is_verified: verified, status })
        .eq('id', brand_id)
        .select();

    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, data });
});

// ── GET /api/brand/all-campaigns ──────────────────────────────────────────────
// CEO fetches ALL campaigns from all brands
router.get('/all-campaigns', async (req, res) => {
    const { admin_email } = req.query;
    if (admin_email !== ADMIN_EMAIL) return res.status(403).json({ error: 'Unauthorized' });

    const { data, error } = await supabase
        .from('brand_campaigns')
        .select('*, brands(company_name, email, logo_url)')
        .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    res.json({ data });
});

// ── POST /api/brand/campaign/review ───────────────────────────────────────────
// CEO approves/rejects/modifies a campaign
router.post('/campaign/review', async (req, res) => {
    const { admin_email, campaign_id, status, ceo_notes, pay_per_reel, total_slots, deadline, title, description, requirements } = req.body;
    if (admin_email !== ADMIN_EMAIL) return res.status(403).json({ error: 'Unauthorized' });
    if (!campaign_id || !status) return res.status(400).json({ error: 'campaign_id and status required' });

    const updates = { status };
    if (ceo_notes !== undefined) updates.ceo_notes = ceo_notes;
    if (pay_per_reel !== undefined) updates.pay_per_reel = parseInt(pay_per_reel);
    if (total_slots !== undefined) updates.total_slots = parseInt(total_slots);
    if (deadline !== undefined) updates.deadline = deadline;
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (requirements !== undefined) updates.requirements = requirements;

    // Recalculate budget if pricing changed
    if (pay_per_reel !== undefined || total_slots !== undefined) {
        const { data: current } = await supabase.from('brand_campaigns').select('pay_per_reel, total_slots').eq('id', campaign_id).limit(1);
        if (current && current.length > 0) {
            const ppr = pay_per_reel !== undefined ? parseInt(pay_per_reel) : current[0].pay_per_reel;
            const ts = total_slots !== undefined ? parseInt(total_slots) : current[0].total_slots;
            updates.total_budget = ppr * ts;
        }
    }

    const { data, error } = await supabase
        .from('brand_campaigns')
        .update(updates)
        .eq('id', campaign_id)
        .select();

    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, data });
});

// ── GET /api/brand/active-campaigns ───────────────────────────────────────────
// Public: returns only approved/active campaigns (for creator hub)
router.get('/active-campaigns', async (req, res) => {
    const { data, error } = await supabase
        .from('brand_campaigns')
        .select('*, brands(company_name, logo_url)')
        .in('status', ['approved', 'active'])
        .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    res.json({ data });
});

// ── POST /api/brand/campaign/enroll ───────────────────────────────────────────
// Creator enrolls in a campaign
router.post('/campaign/enroll', async (req, res) => {
    const { campaign_id, creator_email, creator_name } = req.body;

    if (!campaign_id || !creator_email) {
        return res.status(400).json({ error: 'campaign_id and creator_email required' });
    }

    try {
        // Check if campaign exists and has slots
        const { data: campaign } = await supabase
            .from('brand_campaigns')
            .select('total_slots, claimed_slots, status')
            .eq('id', campaign_id)
            .limit(1);

        if (!campaign || campaign.length === 0) return res.status(404).json({ error: 'Campaign not found' });
        if (!['approved', 'active'].includes(campaign[0].status)) return res.status(400).json({ error: 'Campaign is not active' });
        if (campaign[0].claimed_slots >= campaign[0].total_slots) return res.status(400).json({ error: 'All slots filled' });

        // Check if already enrolled
        const { data: existing } = await supabase
            .from('campaign_enrollments')
            .select('id')
            .eq('campaign_id', campaign_id)
            .eq('creator_email', creator_email)
            .limit(1);

        if (existing && existing.length > 0) {
            return res.status(400).json({ error: 'Already enrolled in this campaign' });
        }

        // Enroll
        const { data, error } = await supabase
            .from('campaign_enrollments')
            .insert({ campaign_id, creator_email, creator_name: creator_name || creator_email })
            .select();

        if (error) throw error;

        // Increment claimed slots
        await supabase
            .from('brand_campaigns')
            .update({ claimed_slots: campaign[0].claimed_slots + 1 })
            .eq('id', campaign_id);

        res.json({ success: true, message: 'Enrolled successfully!' });

    } catch (err) {
        console.error('campaign/enroll error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ── GET /api/brand/my-enrollments ─────────────────────────────────────────────
// Creator fetches their enrollments
router.get('/my-enrollments', async (req, res) => {
    const { email } = req.query;
    if (!email) return res.status(400).json({ error: 'Email required' });

    const { data, error } = await supabase
        .from('campaign_enrollments')
        .select('*, brand_campaigns(title, pay_per_reel, brand_email, brands(company_name))')
        .eq('creator_email', email)
        .order('enrolled_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    res.json({ data });
});

// ── GET /api/brand/all-enrollments ────────────────────────────────────────────
// CEO fetches all enrollments across all campaigns
router.get('/all-enrollments', async (req, res) => {
    const { admin_email } = req.query;
    if (admin_email !== ADMIN_EMAIL) return res.status(403).json({ error: 'Unauthorized' });

    const { data, error } = await supabase
        .from('campaign_enrollments')
        .select('*, brand_campaigns(title, pay_per_reel, brand_email, brands(company_name))')
        .order('enrolled_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    res.json({ data });
});

module.exports = router;
