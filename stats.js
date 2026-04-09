// Platform Stats — fetches real data from API, falls back to zeros
const INITIAL_STATS = {
    totalEarnings: 0,
    totalUsers: 0,
    totalEnrolled: 0
};

let _cachedStats = { ...INITIAL_STATS };

async function initStats() {
    try {
        const res = await fetch('/api/user/platform-stats');
        const data = await res.json();
        _cachedStats = {
            totalEarnings: data.totalPaidINR || 0,
            totalUsers: data.totalCreators || 0,
            totalEnrolled: data.totalEnrollments || 0
        };
    } catch (err) {
        console.warn('Could not load platform stats, using defaults:', err.message);
        _cachedStats = { ...INITIAL_STATS };
    }
}

function getStats() {
    return _cachedStats;
}

// trackNewUser now handled by /api/user/register — this is a no-op for backward compat
function trackNewUser() {}

// Init on load
initStats();
