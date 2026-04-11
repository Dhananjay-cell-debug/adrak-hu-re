const express = require('express');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const router   = express.Router();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const ADMIN_EMAIL = 'dhananjaychitmila@gmail.com';

// ══════════════════════════════════════════════════════════════════════════════
// USER REGISTRATION & AUTH
// ══════════════════════════════════════════════════════════════════════════════

// ── POST /api/user/register ───────────────────────────────────────────────────
// Called on every login — creates user if new, updates last_login if existing
router.post('/register', async (req, res) => {
    const { email, name, picture, role } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });

    try {
        const { data: existing } = await supabase
            .from('users')
            .select('*')
            .eq('email', email)
            .limit(1);

        if (existing && existing.length > 0) {
            // Update last login + any changed fields
            const updates = { last_login: new Date().toISOString() };
            if (name) updates.name = name;
            if (picture) updates.picture = picture;
            if (role) updates.role = role;

            await supabase.from('users').update(updates).eq('email', email);
            return res.json({ success: true, user: { ...existing[0], ...updates }, is_new: false });
        }

        // New user
        const { data, error } = await supabase
            .from('users')
            .insert({ email, name, picture, role: role || 'creator' })
            .select();

        if (error) throw error;
        res.json({ success: true, user: data[0], is_new: true });
    } catch (err) {
        console.error('user/register error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// USERNAME SYSTEM
// ══════════════════════════════════════════════════════════════════════════════

// ── GET /api/user/check-username ─────────────────────────────────────────────
// Check if a username is available
router.get('/check-username', async (req, res) => {
    const { username } = req.query;
    if (!username) return res.status(400).json({ error: 'Username required' });

    const clean = username.toLowerCase().trim();

    // Validate format: 3-20 chars, lowercase letters, numbers, underscores only
    if (!/^[a-z][a-z0-9_]{2,19}$/.test(clean)) {
        return res.json({ available: false, reason: 'Username must be 3-20 characters, start with a letter, and contain only lowercase letters, numbers, or underscores.' });
    }

    // Reserved words
    const reserved = ['admin', 'velt', 'ceo', 'brand', 'creator', 'support', 'help', 'system', 'null', 'undefined', 'api', 'www', 'root'];
    if (reserved.includes(clean)) {
        return res.json({ available: false, reason: 'This username is reserved.' });
    }

    const { data } = await supabase
        .from('users')
        .select('id')
        .eq('username', clean)
        .limit(1);

    res.json({ available: !data || data.length === 0, username: clean });
});

// ── POST /api/user/set-username ──────────────────────────────────────────────
// Set username for a user (one-time or update)
router.post('/set-username', async (req, res) => {
    const { email, username } = req.body;
    if (!email || !username) return res.status(400).json({ error: 'Email and username required' });

    const clean = username.toLowerCase().trim();

    if (!/^[a-z][a-z0-9_]{2,19}$/.test(clean)) {
        return res.status(400).json({ error: 'Username must be 3-20 characters, start with a letter, and contain only lowercase letters, numbers, or underscores.' });
    }

    const reserved = ['admin', 'velt', 'ceo', 'brand', 'creator', 'support', 'help', 'system', 'null', 'undefined', 'api', 'www', 'root'];
    if (reserved.includes(clean)) {
        return res.status(400).json({ error: 'This username is reserved.' });
    }

    try {
        // Check if already taken by someone else
        const { data: existing } = await supabase
            .from('users')
            .select('email')
            .eq('username', clean)
            .limit(1);

        if (existing && existing.length > 0 && existing[0].email !== email) {
            return res.status(409).json({ error: 'Username already taken.' });
        }

        const { data, error } = await supabase
            .from('users')
            .update({ username: clean })
            .eq('email', email)
            .select();

        if (error) throw error;
        res.json({ success: true, username: clean, user: data ? data[0] : null });
    } catch (err) {
        if (err.code === '23505') {
            return res.status(409).json({ error: 'Username already taken.' });
        }
        console.error('set-username error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// CREATOR PROFILES
// ══════════════════════════════════════════════════════════════════════════════

// ── GET /api/user/profile ─────────────────────────────────────────────────────
router.get('/profile', async (req, res) => {
    const { email } = req.query;
    if (!email) return res.status(400).json({ error: 'Email required' });

    try {
        const { data, error } = await supabase
            .from('creator_profiles')
            .select('*')
            .eq('user_email', email)
            .limit(1);

        if (error) throw error;
        res.json({ data: data && data.length > 0 ? data[0] : null });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── POST /api/user/profile ────────────────────────────────────────────────────
router.post('/profile', async (req, res) => {
    const { email, bio, niche, instagram, youtube, twitter, whatsapp, website, avatar_url, followers_count, city } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });

    try {
        const { data: existing } = await supabase
            .from('creator_profiles')
            .select('id')
            .eq('user_email', email)
            .limit(1);

        const profileData = { bio, niche, instagram, youtube, twitter, whatsapp, website, avatar_url, followers_count, city };
        // Remove undefined values
        Object.keys(profileData).forEach(k => profileData[k] === undefined && delete profileData[k]);

        if (existing && existing.length > 0) {
            const { data, error } = await supabase
                .from('creator_profiles')
                .update(profileData)
                .eq('user_email', email)
                .select();
            if (error) throw error;

            // Mark profile as complete if key fields filled
            const isComplete = !!(instagram && (bio || niche));
            await supabase.from('users').update({ profile_complete: isComplete }).eq('email', email);

            return res.json({ success: true, data: data[0] });
        }

        // Insert new profile
        const { data, error } = await supabase
            .from('creator_profiles')
            .insert({ user_email: email, ...profileData })
            .select();
        if (error) throw error;

        const isComplete = !!(instagram && (bio || niche));
        await supabase.from('users').update({ profile_complete: isComplete }).eq('email', email);

        res.json({ success: true, data: data[0] });
    } catch (err) {
        console.error('profile save error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// CAMPAIGN ENROLLMENT (with full form data)
// ══════════════════════════════════════════════════════════════════════════════

// ── POST /api/user/enroll ─────────────────────────────────────────────────────
router.post('/enroll', async (req, res) => {
    const { campaign_id, creator_email, creator_name, instagram_handle, delivery_date } = req.body;

    if (!campaign_id || !creator_email || !instagram_handle || !delivery_date) {
        return res.status(400).json({ error: 'campaign_id, creator_email, instagram_handle, and delivery_date are required' });
    }

    try {
        // Check campaign has slots
        const { data: campaign } = await supabase
            .from('brand_campaigns')
            .select('total_slots, claimed_slots, pay_per_reel, status')
            .eq('id', campaign_id)
            .limit(1);

        if (!campaign || campaign.length === 0) return res.status(404).json({ error: 'Campaign not found' });
        if (!['approved', 'active'].includes(campaign[0].status)) return res.status(400).json({ error: 'Campaign not accepting enrollments' });
        if (campaign[0].claimed_slots >= campaign[0].total_slots) return res.status(400).json({ error: 'All slots are filled' });

        // Check not already enrolled
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
            .insert({
                campaign_id,
                creator_email,
                creator_name: creator_name || creator_email,
                instagram_handle,
                delivery_date,
                agreed_rate: campaign[0].pay_per_reel,
                status: 'enrolled'
            })
            .select();

        if (error) throw error;

        // Increment claimed slots
        await supabase
            .from('brand_campaigns')
            .update({ claimed_slots: campaign[0].claimed_slots + 1 })
            .eq('id', campaign_id);

        res.json({ success: true, data: data[0], message: 'Enrolled! Check My Campaigns for next steps.' });
    } catch (err) {
        console.error('enroll error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ── GET /api/user/my-campaigns ────────────────────────────────────────────────
router.get('/my-campaigns', async (req, res) => {
    const { email } = req.query;
    if (!email) return res.status(400).json({ error: 'Email required' });

    const { data, error } = await supabase
        .from('campaign_enrollments')
        .select('*, brand_campaigns(id, title, pay_per_reel, deadline, category, requirements, brand_email, brands(company_name, logo_url))')
        .eq('creator_email', email)
        .order('enrolled_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    res.json({ data });
});

// ══════════════════════════════════════════════════════════════════════════════
// CONTENT SUBMISSIONS
// ══════════════════════════════════════════════════════════════════════════════

// ── POST /api/user/submit-content ─────────────────────────────────────────────
router.post('/submit-content', async (req, res) => {
    const { enrollment_id, campaign_id, creator_email, reel_url, notes } = req.body;

    if (!enrollment_id || !campaign_id || !creator_email || !reel_url) {
        return res.status(400).json({ error: 'enrollment_id, campaign_id, creator_email, and reel_url are required' });
    }

    try {
        // Check enrollment exists and belongs to this creator
        const { data: enrollment } = await supabase
            .from('campaign_enrollments')
            .select('id, status')
            .eq('id', enrollment_id)
            .eq('creator_email', creator_email)
            .limit(1);

        if (!enrollment || enrollment.length === 0) {
            return res.status(404).json({ error: 'Enrollment not found' });
        }

        // Insert submission
        const { data, error } = await supabase
            .from('content_submissions')
            .insert({ enrollment_id, campaign_id, creator_email, reel_url, notes })
            .select();

        if (error) throw error;

        // Update enrollment status to 'submitted'
        await supabase
            .from('campaign_enrollments')
            .update({ status: 'submitted' })
            .eq('id', enrollment_id);

        res.json({ success: true, data: data[0], message: 'Content submitted for review!' });
    } catch (err) {
        console.error('submit-content error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ── GET /api/user/my-submissions ──────────────────────────────────────────────
router.get('/my-submissions', async (req, res) => {
    const { email } = req.query;
    if (!email) return res.status(400).json({ error: 'Email required' });

    const { data, error } = await supabase
        .from('content_submissions')
        .select('*, brand_campaigns(title, brand_email, brands(company_name))')
        .eq('creator_email', email)
        .order('submitted_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    res.json({ data });
});

// ══════════════════════════════════════════════════════════════════════════════
// CEO ENDPOINTS
// ══════════════════════════════════════════════════════════════════════════════

// ── GET /api/user/all-creators ────────────────────────────────────────────────
// CEO sees all creators with profile status
router.get('/all-creators', async (req, res) => {
    const { admin_email } = req.query;
    if (admin_email !== ADMIN_EMAIL) return res.status(403).json({ error: 'Unauthorized' });

    const { data, error } = await supabase
        .from('users')
        .select('*, creator_profiles(*)')
        .eq('role', 'creator')
        .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    res.json({ data });
});

// ── GET /api/user/all-enrollments ─────────────────────────────────────────────
// CEO sees all enrollments across all campaigns
router.get('/all-enrollments', async (req, res) => {
    const { admin_email } = req.query;
    if (admin_email !== ADMIN_EMAIL) return res.status(403).json({ error: 'Unauthorized' });

    const { data, error } = await supabase
        .from('campaign_enrollments')
        .select('*, brand_campaigns(title, pay_per_reel, brand_email, brands(company_name)), creator_profiles:creator_email(instagram, niche, avatar_url)')
        .order('enrolled_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    res.json({ data });
});

// ── GET /api/user/all-submissions ─────────────────────────────────────────────
// CEO sees all content submissions for review
router.get('/all-submissions', async (req, res) => {
    const { admin_email } = req.query;
    if (admin_email !== ADMIN_EMAIL) return res.status(403).json({ error: 'Unauthorized' });

    const { data, error } = await supabase
        .from('content_submissions')
        .select('*, brand_campaigns(title, pay_per_reel, brand_email, brands(company_name)), campaign_enrollments(instagram_handle, delivery_date, creator_name)')
        .order('submitted_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    res.json({ data });
});

// ── POST /api/user/review-submission ──────────────────────────────────────────
// CEO reviews a submission — rate, feedback, decide payment
router.post('/review-submission', async (req, res) => {
    const { admin_email, submission_id, ceo_rating, ceo_feedback, decided_amount, status } = req.body;
    if (admin_email !== ADMIN_EMAIL) return res.status(403).json({ error: 'Unauthorized' });
    if (!submission_id || !status) return res.status(400).json({ error: 'submission_id and status required' });

    try {
        const updates = {
            status,
            reviewed_at: new Date().toISOString()
        };
        if (ceo_rating !== undefined) updates.ceo_rating = ceo_rating;
        if (ceo_feedback !== undefined) updates.ceo_feedback = ceo_feedback;
        if (decided_amount !== undefined) updates.decided_amount = parseInt(decided_amount);

        const { data, error } = await supabase
            .from('content_submissions')
            .update(updates)
            .eq('id', submission_id)
            .select();

        if (error) throw error;

        // Update enrollment status too
        if (data && data.length > 0) {
            const enrollStatus = status === 'approved' ? 'approved' : status === 'rejected' ? 'rejected' : 'under_review';
            await supabase
                .from('campaign_enrollments')
                .update({ status: enrollStatus })
                .eq('id', data[0].enrollment_id);
        }

        res.json({ success: true, data: data ? data[0] : null });
    } catch (err) {
        console.error('review-submission error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ── GET /api/user/platform-stats ──────────────────────────────────────────────
// Real platform stats from DB (replaces localStorage stats.js)
router.get('/platform-stats', async (req, res) => {
    try {
        const [usersRes, creatorsRes, brandsRes, campaignsRes, enrollmentsRes, submissionsRes, payoutsRes] = await Promise.all([
            supabase.from('users').select('id', { count: 'exact', head: true }),
            supabase.from('users').select('id', { count: 'exact', head: true }).eq('role', 'creator'),
            supabase.from('brands').select('id', { count: 'exact', head: true }),
            supabase.from('brand_campaigns').select('id', { count: 'exact', head: true }).in('status', ['approved', 'active']),
            supabase.from('campaign_enrollments').select('id', { count: 'exact', head: true }),
            supabase.from('content_submissions').select('id', { count: 'exact', head: true }),
            supabase.from('payouts').select('amount').not('status', 'eq', 'failed')
        ]);

        const totalPaid = (payoutsRes.data || []).reduce((sum, p) => sum + (p.amount || 0), 0);

        res.json({
            totalUsers: usersRes.count || 0,
            totalCreators: creatorsRes.count || 0,
            totalBrands: brandsRes.count || 0,
            activeCampaigns: campaignsRes.count || 0,
            totalEnrollments: enrollmentsRes.count || 0,
            totalSubmissions: submissionsRes.count || 0,
            totalPaidPaise: totalPaid,
            totalPaidINR: totalPaid / 100
        });
    } catch (err) {
        console.error('platform-stats error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
