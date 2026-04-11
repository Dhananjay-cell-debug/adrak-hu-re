-- Run this in Supabase → SQL Editor
-- CreatorHub v4 — Full Schema

-- ══════════════════════════════════════════════════════════════════════════════
-- CORE: Users & Creator Profiles
-- ══════════════════════════════════════════════════════════════════════════════

-- ── Users table: every person who logs in ─────────────────────────────────────
CREATE TABLE users (
    id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email             TEXT NOT NULL UNIQUE,
    name              TEXT,
    picture           TEXT,
    username          TEXT UNIQUE,                       -- unique handle e.g. @dhananjay
    role              TEXT NOT NULL DEFAULT 'creator',  -- 'creator' | 'brand' | 'ceo'
    profile_complete  BOOLEAN DEFAULT FALSE,
    last_login        TIMESTAMPTZ DEFAULT NOW(),
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE UNIQUE INDEX idx_users_username ON users(username) WHERE username IS NOT NULL;

-- ── Creator Profiles: detailed info for creators ──────────────────────────────
CREATE TABLE creator_profiles (
    id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_email        TEXT NOT NULL UNIQUE REFERENCES users(email) ON DELETE CASCADE,
    bio               TEXT,
    niche             TEXT,                             -- 'fashion' | 'gaming' | 'tech' etc.
    instagram         TEXT,                             -- primary IG handle
    youtube           TEXT,
    twitter           TEXT,
    whatsapp          TEXT,
    website           TEXT,
    avatar_url        TEXT,
    followers_count   INTEGER DEFAULT 0,
    city              TEXT,
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_creator_profiles_email ON creator_profiles(user_email);

-- Auto-update updated_at on any row change
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_creator_profiles_updated BEFORE UPDATE ON creator_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ══════════════════════════════════════════════════════════════════════════════
-- PAYMENTS
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE creator_payment_methods (
    id                        UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_email                TEXT NOT NULL,
    razorpay_contact_id       TEXT,
    razorpay_fund_account_id  TEXT,
    payment_type              TEXT NOT NULL,          -- 'upi' | 'bank_account'
    upi_id                    TEXT,
    bank_account_number       TEXT,
    bank_ifsc                 TEXT,
    account_holder_name       TEXT,
    is_verified               BOOLEAN DEFAULT FALSE,
    created_at                TIMESTAMPTZ DEFAULT NOW(),
    updated_at                TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_payment_methods_email ON creator_payment_methods(user_email);
CREATE TRIGGER trg_payment_updated BEFORE UPDATE ON creator_payment_methods FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE payouts (
    id                     UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    creator_email          TEXT NOT NULL,
    creator_name           TEXT,
    amount                 INTEGER NOT NULL,              -- amount in paise
    currency               TEXT DEFAULT 'INR',
    campaign_name          TEXT,
    campaign_id            UUID,
    razorpay_payout_id     TEXT,
    razorpay_fund_account_id TEXT,
    payment_type           TEXT,
    status                 TEXT DEFAULT 'pending',        -- 'pending' | 'processing' | 'processed' | 'failed' | 'reversed'
    failure_reason         TEXT,
    initiated_by           TEXT,
    created_at             TIMESTAMPTZ DEFAULT NOW(),
    updated_at             TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_payouts_creator ON payouts(creator_email);
CREATE INDEX idx_payouts_status ON payouts(status);
CREATE TRIGGER trg_payouts_updated BEFORE UPDATE ON payouts FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ══════════════════════════════════════════════════════════════════════════════
-- BRAND HUB
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE brands (
    id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email             TEXT NOT NULL UNIQUE,
    company_name      TEXT NOT NULL,
    contact_person    TEXT,
    phone             TEXT,
    website           TEXT,
    logo_url          TEXT,
    industry          TEXT,
    description       TEXT,
    is_verified       BOOLEAN DEFAULT FALSE,
    status            TEXT DEFAULT 'pending',
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_brands_email ON brands(email);
CREATE INDEX idx_brands_status ON brands(status);
CREATE TRIGGER trg_brands_updated BEFORE UPDATE ON brands FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE brand_campaigns (
    id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    brand_id          UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    brand_email       TEXT NOT NULL,
    title             TEXT NOT NULL,
    description       TEXT,
    category          TEXT,
    pay_per_reel      INTEGER NOT NULL DEFAULT 0,    -- in INR
    total_budget      INTEGER NOT NULL DEFAULT 0,    -- total budget INR
    total_slots       INTEGER NOT NULL DEFAULT 0,
    claimed_slots     INTEGER NOT NULL DEFAULT 0,
    deadline          DATE,
    requirements      TEXT,
    reference_links   TEXT,
    color             TEXT DEFAULT '#3b82f6',
    bg_color          TEXT DEFAULT '#EFF6FF',
    status            TEXT DEFAULT 'pending_review',  -- 'pending_review' | 'approved' | 'active' | 'paused' | 'completed' | 'rejected'
    ceo_notes         TEXT,
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_brand_campaigns_brand ON brand_campaigns(brand_id);
CREATE INDEX idx_brand_campaigns_status ON brand_campaigns(status);
CREATE TRIGGER trg_brand_campaigns_updated BEFORE UPDATE ON brand_campaigns FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ══════════════════════════════════════════════════════════════════════════════
-- CAMPAIGN PIPELINE: Enrollment → Submission → Review → Payment
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE campaign_enrollments (
    id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    campaign_id       UUID NOT NULL REFERENCES brand_campaigns(id) ON DELETE CASCADE,
    creator_email     TEXT NOT NULL,
    creator_name      TEXT,
    instagram_handle  TEXT NOT NULL,                   -- which IG account they'll post from
    delivery_date     DATE NOT NULL,                   -- when they'll deliver the content
    agreed_rate       INTEGER,                         -- agreed pay in INR (can differ from campaign default)
    status            TEXT DEFAULT 'enrolled',          -- 'enrolled' | 'in_progress' | 'submitted' | 'under_review' | 'approved' | 'rejected' | 'paid'
    enrolled_at       TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(campaign_id, creator_email)
);

CREATE INDEX idx_enrollments_campaign ON campaign_enrollments(campaign_id);
CREATE INDEX idx_enrollments_creator ON campaign_enrollments(creator_email);
CREATE INDEX idx_enrollments_status ON campaign_enrollments(status);

-- ── Content Submissions: creators submit their work for CEO review ────────────
CREATE TABLE content_submissions (
    id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    enrollment_id     UUID NOT NULL REFERENCES campaign_enrollments(id) ON DELETE CASCADE,
    campaign_id       UUID NOT NULL REFERENCES brand_campaigns(id) ON DELETE CASCADE,
    creator_email     TEXT NOT NULL,
    reel_url          TEXT NOT NULL,                   -- Instagram reel/post link
    notes             TEXT,                            -- creator's notes about the submission
    ceo_rating        INTEGER,                         -- 1-5 quality rating by CEO
    ceo_feedback      TEXT,                            -- CEO's review notes
    decided_amount    INTEGER,                         -- final payment amount in INR (CEO decides based on quality)
    status            TEXT DEFAULT 'pending_review',    -- 'pending_review' | 'approved' | 'revision_needed' | 'rejected' | 'paid'
    submitted_at      TIMESTAMPTZ DEFAULT NOW(),
    reviewed_at       TIMESTAMPTZ,
    paid_at           TIMESTAMPTZ
);

CREATE INDEX idx_submissions_creator ON content_submissions(creator_email);
CREATE INDEX idx_submissions_campaign ON content_submissions(campaign_id);
CREATE INDEX idx_submissions_status ON content_submissions(status);
