/* ================================================
   VELT INDUSTRIES — Shared Application Logic
   ================================================ */

// Hardcoded campaigns as fallback when no API campaigns exist
const FALLBACK_CAMPAIGNS = [
    {
        id: 'brewbro',
        brand: 'BrewBro India',
        tag: 'Beverages · College',
        tagline: 'Premium chai for campus life',
        payPerReel: 300,
        slots: 1000,
        claimed: 153,
        deadline: 'Apr 30, 2026',
        color: '#FF6B35',
        bgColor: '#FFF5F2'
    },
    {
        id: 'fitfuel',
        brand: 'FitFuel India',
        tag: 'Health · Fitness',
        tagline: 'Premium whey protein, desi price',
        payPerReel: 450,
        slots: 500,
        claimed: 89,
        deadline: 'May 15, 2026',
        color: '#E74C3C',
        bgColor: '#FEF2F2'
    },
    {
        id: 'stylestreet',
        brand: 'StyleStreet',
        tag: 'Fashion · Gen-Z',
        tagline: 'Drop-worthy fashion, street-ready looks',
        payPerReel: 350,
        slots: 300,
        claimed: 44,
        deadline: 'May 5, 2026',
        color: '#8E44AD',
        bgColor: '#F5F3FF'
    },
    {
        id: 'gamezone',
        brand: 'GameZone Pro',
        tag: 'Gaming · Tech',
        tagline: 'Level up your setup for less',
        payPerReel: 300,
        slots: 400,
        claimed: 61,
        deadline: 'May 20, 2026',
        color: '#3B82F6',
        bgColor: '#EFF6FF'
    }
];

// Active campaigns (loaded from API or fallback)
let CAMPAIGNS = [];

// Category color mapping
const CATEGORY_COLORS = {
    'fashion':   { color: '#8E44AD', bg: '#F5F3FF' },
    'food':      { color: '#FF6B35', bg: '#FFF5F2' },
    'tech':      { color: '#3B82F6', bg: '#EFF6FF' },
    'health':    { color: '#E74C3C', bg: '#FEF2F2' },
    'gaming':    { color: '#3B82F6', bg: '#EFF6FF' },
    'education': { color: '#10B981', bg: '#F0FDF4' },
    'beauty':    { color: '#EC4899', bg: '#FDF2F8' },
    'travel':    { color: '#F59E0B', bg: '#FFFBEB' },
    'finance':   { color: '#6366F1', bg: '#EEF2FF' },
    'other':     { color: '#6B7280', bg: '#F3F4F6' },
    'general':   { color: '#6B7280', bg: '#F3F4F6' }
};

// ── Load Campaigns from API ──────────────────────────
async function loadCampaignsFromAPI() {
    try {
        const res = await fetch('/api/brand/active-campaigns');
        const body = await res.json();
        const apiCampaigns = body.data || [];

        if (apiCampaigns.length > 0) {
            // Convert API campaigns to display format
            CAMPAIGNS = apiCampaigns.map(c => {
                const catColors = CATEGORY_COLORS[c.category] || CATEGORY_COLORS['general'];
                const brandName = c.brands ? c.brands.company_name : 'Brand';
                const deadlineStr = c.deadline
                    ? new Date(c.deadline).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })
                    : 'Open';

                return {
                    id: c.id,
                    brand: brandName,
                    tag: (c.category || 'general').charAt(0).toUpperCase() + (c.category || 'general').slice(1),
                    tagline: c.description || c.title,
                    payPerReel: c.pay_per_reel,
                    slots: c.total_slots,
                    claimed: c.claimed_slots || 0,
                    deadline: deadlineStr,
                    color: c.color || catColors.color,
                    bgColor: c.bg_color || catColors.bg,
                    requirements: c.requirements,
                    isFromAPI: true
                };
            });
        } else {
            // No API campaigns — use fallback
            CAMPAIGNS = FALLBACK_CAMPAIGNS;
        }
    } catch (err) {
        console.warn('Could not load campaigns from API, using fallback:', err.message);
        CAMPAIGNS = FALLBACK_CAMPAIGNS;
    }

    renderCampaigns();
}

// ── Render Campaign Cards ─────────────────────────────
function renderCampaigns() {
    const grid = document.getElementById('campaigns-grid');
    if (!grid) return;

    grid.innerHTML = '';

    // Update the campaign count badge
    const countBadge = document.querySelector('[data-campaign-count]');
    if (countBadge) countBadge.innerText = CAMPAIGNS.length + ' CAMPAIGNS OPEN';

    CAMPAIGNS.forEach(c => {
        const slotsLeft = c.slots - c.claimed;
        const card = document.createElement('div');
        card.className = 'campaign-card';
        card.innerHTML = `
            <div style="width:48px; height:48px; background:${c.bgColor}; color:${c.color}; border-radius:12px; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:20px; margin-bottom:20px;">
                ${c.brand[0]}
            </div>
            <div style="font-size:12px; font-weight:700; color:${c.color}; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:8px;">${c.tag}</div>
            <h3 style="font-size:22px; margin-bottom:8px;">${c.brand}</h3>
            <p style="color:#666; font-size:14px; margin-bottom:24px;">${c.tagline}</p>
            ${c.requirements ? `<p style="color:#999; font-size:12px; margin-bottom:16px; padding:8px 12px; background:#F9FAFB; border-radius:8px; border:1px solid #eee;"><strong>Requirements:</strong> ${c.requirements}</p>` : ''}
            <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid #eee; padding-top:16px;">
                <div>
                   <span style="display:block; font-size:18px; font-weight:800;">₹${c.payPerReel}</span>
                   <span style="font-size:11px; color:#999; font-weight:600;">per reel · ${slotsLeft} slots left</span>
                </div>
                <button class="btn-primary" style="padding:10px 20px; font-size:13px;" onclick="openEnrollModal('${c.id}', '${c.brand.replace(/'/g, "\\'")}')">Enroll Now</button>
            </div>
        `;
        grid.appendChild(card);
    });
}

// ── Project View Logic ────────────────────────────────
function openProject(id) {
    const campaign = CAMPAIGNS.find(c => c.id === id);
    if (!campaign) return;

    const campaignsView = document.getElementById('campaigns-view');
    const projectView   = document.getElementById('project-view');
    const inner         = document.getElementById('project-inner-content');

    if (campaignsView && projectView) {
        campaignsView.classList.add('hidden');
        projectView.classList.remove('hidden');
        projectView.style.display = 'block';

        inner.innerHTML = `
            <div style="margin-bottom:48px;">
                <h1 style="font-size:56px; margin-bottom:12px;">${campaign.brand}</h1>
                <p style="font-size:20px; color:#666;">${campaign.tagline}</p>
            </div>
            <div style="display:grid; grid-template-columns: 2fr 1fr; gap:40px;">
                <div style="background:#F9FAFB; padding:40px; border-radius:24px; border:1px solid #eee;">
                    <h2 style="font-size:24px; margin-bottom:24px;">Campaign Brief</h2>
                    <p style="color:#444; line-height:1.7; font-size:16px;">
                        ${campaign.requirements || `We are looking for creative partners to help us reach ${campaign.tag} enthusiasts.
                        The goal is to showcase the product in an authentic, high-energy reel that fits your personal style.`}
                    </p>
                </div>
                <div>
                    <div style="background:#fff; border:1px solid #eee; padding:32px; border-radius:24px; margin-bottom:20px;">
                        <div style="color:#999; font-size:12px; font-weight:700; margin-bottom:8px;">EARNINGS</div>
                        <div style="font-size:32px; font-weight:800;">₹${campaign.payPerReel} <span style="font-size:14px; color:#666; font-weight:500;">/reel</span></div>
                    </div>
                     <button class="btn-primary" id="apply-btn" style="width:100%; padding:20px; border-radius:16px; font-size:18px;" onclick="openEnrollModal('${campaign.id}', '${campaign.brand.replace(/'/g, "\\'")}')">Enroll Now</button>
                </div>
            </div>
        `;
        window.scrollTo(0,0);
    }
}

function closeProject() {
    const campaignsView = document.getElementById('campaigns-view');
    const projectView   = document.getElementById('project-view');
    if (campaignsView && projectView) {
        campaignsView.classList.remove('hidden');
        projectView.classList.add('hidden');
        projectView.style.display = 'none';
        window.scrollTo(0,0);
    }
}

// ── Enrollment is handled by the modal in creative-hub.html ──
// openEnrollModal() is defined there — app.js campaign cards call it directly

// ── Navigation ────────────────────────────────────────
function initNavigation() {
    const hamburger = document.getElementById('hamburger-btn');
    const sidebar   = document.getElementById('sidebar');

    if (hamburger && sidebar) {
        hamburger.addEventListener('click', () => {
            sidebar.classList.toggle('open');
        });
    }

    const backBtn = document.getElementById('back-btn');
    if (backBtn) backBtn.addEventListener('click', closeProject);
}

// ── Init ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    loadCampaignsFromAPI();
    initNavigation();
});
