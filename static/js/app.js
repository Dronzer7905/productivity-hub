/* ═══════════════════════════════════════════════════════
   ATELIER — Executive Productivity Workspace
   Charcoal Atelier Tactile Design System
   ═══════════════════════════════════════════════════════ */

// ── State ──────────────────────────────────────────────
let currentUser = null;
let currentPage = 'dashboard';
let blocksCache = [];
let scheduleModes = [];
let habitState = {};
let currentWeekOffset = 0;
let pomTimer = null;
let plannerSaveTimer = null;
let pomTimeLeft = 25 * 60;
let pomIsRunning = false;
let dashTimer = null;
let notificationsCache = [];
let notificationPoller = null;
let scheduleWatcher = null;
let pomEndsAt = null;
let activePomDuration = 25 * 60;
let pomTaskId = null;
let collaboratorsList = [];

// CSRF & XSS utilities
let csrfToken = '';
const originalFetch = window.fetch;
window.fetch = async function(url, options) {
    options = options || {};
    if (options.method && !['GET', 'HEAD', 'OPTIONS'].includes(options.method.toUpperCase())) {
        if (!options.headers) options.headers = {};
        options.headers['X-CSRFToken'] = csrfToken;
    }
    return originalFetch(url, options);
};

function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
}

async function fetchCsrfToken() {
    try {
        const res = await originalFetch('/api/csrf-token');
        if (res.ok) {
            const data = await res.json();
            csrfToken = data.csrf_token;
        }
    } catch(e) { console.error("CSRF fetch failed", e); }
}

const NOTIFIED_NOTIFICATIONS_KEY = 'commandflow_notified_notifications';
const POMODORO_STATE_KEY = 'commandflow_pomodoro_state';
const BLOCK_NOTIFICATION_KEY = 'commandflow_block_notifications';

document.addEventListener('DOMContentLoaded', async () => {
    try {
        loadPomodoroState();
        loadSettingsState();
        await checkAuth();
        initNav();
        initButtons();
        initMobileMenu();
        initResponsiveEnhancements();
        checkMorningSchedulePrompt();
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                loadPomodoroState();
                checkPomodoroDeadline();
                updatePomDisplay();
                if (typeof ensurePomTimerRunning === 'function') ensurePomTimerRunning();
                checkScheduleNotifications();
                // Refresh current page data if applicable
                if (typeof renderPage === 'function' && currentPage) renderPage(currentPage);
            }
        });
    } catch (e) {
        console.error("Boot error:", e);
    }
});

// ── Shared Utilities ────────────────────────────────────
function getMonday(offsetWeeks = 0) {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1) + (offsetWeeks * 7);
    const mon = new Date(d.setDate(diff));
    return mon.toISOString().split('T')[0];
}

function timeToMin(t) {
    if (!t) return 0;
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
}

async function setManualPoms(id, currentPoms) {
    const val = prompt("Set target Pomodoros for this block (0 to disable, leave empty to auto-calculate):", currentPoms);
    if (val === null) return;
    const body = { description: val.trim() };
    await fetch(`/api/schedule/${id}`, { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body) });
    loadSchedule();
}

async function fetchBlocks() {
    try {
        const r = await fetch('/api/schedule');
        blocksCache = await r.json();
    } catch (e) {
        console.error("Failed to fetch blocks", e);
    }
}

async function fetchCollaborators() {
    if (!currentUser) return;
    try {
        const res = await fetch('/api/teams/collaborators');
        if (res.ok) {
            collaboratorsList = await res.json();
        }
    } catch (e) {
        console.error("Failed to fetch collaborators", e);
    }
}

function getNotificationStorageKey() {
    return `${NOTIFIED_NOTIFICATIONS_KEY}:${currentUser?.id || 'guest'}`;
}

function getSeenNotificationIds() {
    try {
        return JSON.parse(localStorage.getItem(getNotificationStorageKey()) || '[]');
    } catch (e) {
        return [];
    }
}

function rememberSeenNotificationIds(ids) {
    localStorage.setItem(getNotificationStorageKey(), JSON.stringify(Array.from(new Set(ids))));
}


function updateNotificationPulse(unreadCount = 0) {
    const pulse = document.getElementById('notif-pulse');
    if (pulse) pulse.classList.toggle('hidden', unreadCount <= 0);

    ['notif-count', 'mobile-notif-count'].forEach(id => {
        const badge = document.getElementById(id);
        if (!badge) return;
        badge.textContent = unreadCount > 99 ? '99+' : String(unreadCount);
        badge.classList.toggle('hidden', unreadCount <= 0);
    });
}

function formatTimeAgo(value) {
    if (!value) return 'JUST NOW';
    const then = new Date(value);
    const seconds = Math.max(1, Math.floor((Date.now() - then.getTime()) / 1000));
    if (seconds < 60) return 'JUST NOW';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} MIN AGO`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} H AGO`;
    const days = Math.floor(hours / 24);
    return `${days} D AGO`;
}

function currentUserMatchesAssignee(assignee) {
    const probe = (assignee || '').trim().toLowerCase();
    if (!probe || !currentUser) return false;
    const identities = [
        currentUser.display_name,
        currentUser.username,
        currentUser.email
    ].filter(Boolean).map(v => v.trim().toLowerCase());
    return identities.includes(probe);
}

async function requestNotificationPermission() {
    if (!('Notification' in window)) {
        showToast('Browser notifications are not supported on this device');
        return 'unsupported';
    }

    if (Notification.permission === 'granted') return 'granted';
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
        showToast('Browser alerts enabled');
    }
    return permission;
}

function triggerDeviceVibration(pattern) {
    if ('vibrate' in navigator) navigator.vibrate(pattern);
}

function playAlertChime(sequence = [523, 659, 784], duration = 0.18) {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const now = audioCtx.currentTime;
        sequence.forEach((freq, index) => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.frequency.value = freq;
            osc.type = 'sine';
            const start = now + (index * (duration + 0.05));
            gain.gain.setValueAtTime(0.0001, start);
            gain.gain.exponentialRampToValueAtTime(0.32, start + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
            osc.start(start);
            osc.stop(start + duration);
        });
    } catch (e) {
        console.warn('Audio notification unavailable', e);
    }
}

function getDefaultPomSeconds(mode = pomMode) {
    if (mode === 'short') return 5 * 60;
    if (mode === 'long') return 15 * 60;
    return 25 * 60;
}

function savePomodoroState() {
    localStorage.setItem(POMODORO_STATE_KEY, JSON.stringify({
        pomMode,
        pomTimeLeft,
        pomIsRunning,
        pomEndsAt,
        pomTaskInput,
        activePomDuration,
        pomTaskId
    }));
}

function loadPomodoroState() {
    try {
        const saved = JSON.parse(localStorage.getItem(POMODORO_STATE_KEY) || 'null');
        if (!saved) return;
        pomMode = saved.pomMode || pomMode;
        pomTaskInput = saved.pomTaskInput || '';
        activePomDuration = saved.activePomDuration || getDefaultPomSeconds(saved.pomMode);
        pomEndsAt = saved.pomEndsAt || null;
        pomTaskId = saved.pomTaskId || null;
        pomIsRunning = Boolean(saved.pomIsRunning && saved.pomEndsAt);
        if (pomIsRunning) {
            pomTimeLeft = Math.max(0, Math.round((saved.pomEndsAt - Date.now()) / 1000));
        } else {
            pomTimeLeft = saved.pomTimeLeft || getDefaultPomSeconds(saved.pomMode);
        }
        if (pomTimeLeft <= 0 && pomEndsAt) {
            pomIsRunning = false;
            pomEndsAt = null;
            pomTimeLeft = 0;
        }
    } catch (e) {
        console.error('Failed to load pomodoro state', e);
    }
}

function ensurePomTimerRunning() {
    if (pomIsRunning && pomEndsAt && !pomTimer) {
        pomTimer = setInterval(() => {
            pomTimeLeft = Math.max(0, Math.round((pomEndsAt - Date.now()) / 1000));
            updatePomDisplay();
            savePomodoroState();
            if (pomTimeLeft <= 0) { clearInterval(pomTimer); pomTimer = null; completePom(); }
        }, 1000);
    }
}

function clearPomodoroState() {
    localStorage.removeItem(POMODORO_STATE_KEY);
}

function getNotifiedBlockKeys() {
    try {
        return JSON.parse(localStorage.getItem(BLOCK_NOTIFICATION_KEY) || '[]');
    } catch (e) {
        return [];
    }
}

function rememberBlockNotification(key) {
    const current = getNotifiedBlockKeys();
    if (!current.includes(key)) {
        current.push(key);
        localStorage.setItem(BLOCK_NOTIFICATION_KEY, JSON.stringify(current.slice(-200)));
    }
}

function getTodayKey() {
    return new Date().toISOString().split('T')[0];
}

function checkPomodoroDeadline() {
    if (!pomIsRunning || !pomEndsAt) return;
    pomTimeLeft = Math.max(0, Math.round((pomEndsAt - Date.now()) / 1000));
    if (pomTimeLeft <= 0) {
        clearInterval(pomTimer);
        completePom();
    } else {
        savePomodoroState();
    }
}

async function checkScheduleNotifications() {
    if (!currentUser) return;
    if (!blocksCache.length) await fetchBlocks();

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const todayKey = getTodayKey();
    const notified = getNotifiedBlockKeys();
    const visibleBlocks = blocksCache.filter(b => b.day_type === currentScheduleMode || b.day_type === 'daily');

    for (const block of visibleBlocks) {
        const startMinutes = timeToMin(block.start_time);
        const blockKey = `${todayKey}:${currentScheduleMode}:${block.id}:${block.start_time}`;
        if (currentMinutes === startMinutes && !notified.includes(blockKey)) {
            playAlertChime([523, 659, 784, 880], 0.28);
            triggerDeviceVibration([280, 180, 280, 180, 420]);
            await sendBrowserNotification('Schedule block started', {
                body: `${block.title} is starting now.`,
                tag: `block-${block.id}-${todayKey}`,
                vibrate: [280, 180, 280, 180, 420]
            });
            // Removed duplicate showToast here for cleaner mobile experience
            rememberBlockNotification(blockKey);
        }
    }
}

async function sendBrowserNotification(title, options = {}) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    const payload = {
        body: options.body || '',
        tag: options.tag || `commandflow-${Date.now()}`,
        icon: '/static/icon-192.svg',
        badge: '/static/icon-192.svg',
        vibrate: options.vibrate || [180, 120, 180],
        requireInteraction: options.requireInteraction || false,
        data: {
            url: window.location.origin,
            ...options.data
        }
    };

    try {
        const registration = await navigator.serviceWorker?.ready;
        if (registration?.active) {
            registration.active.postMessage({
                type: 'SHOW_NOTIFICATION',
                title,
                options: payload
            });
            return;
        }
    } catch (e) {
        console.warn('Service worker notification fallback engaged', e);
    }

    new Notification(title, payload);
}

async function fetchNotifications({ notifyFresh = false } = {}) {
    if (!currentUser) return;

    try {
        const res = await fetch('/api/notifications');
        if (!res.ok) return;

        const data = await res.json();
        notificationsCache = data.notifications || [];
        updateNotificationPulse(data.unread_count || 0);

        if (notifyFresh) {
            const seenIds = getSeenNotificationIds();
            const freshItems = notificationsCache.filter(n => !n.is_read && !seenIds.includes(n.id));

            if (freshItems.length) {
                for (const item of freshItems) {
                    await sendBrowserNotification(item.title, {
                        body: item.message,
                        tag: `notification-${item.id}`,
                        vibrate: [200, 100, 200]
                    });
                    if (item.type === 'task_assignment') {
                        playAlertChime([659, 784, 988], 0.16);
                    }
                }
                rememberSeenNotificationIds([...seenIds, ...freshItems.map(n => n.id)]);
            }
        }
    } catch (e) {
        console.error('Failed to fetch notifications', e);
    }
}

async function markAllNotificationsRead() {
    try {
        await fetch('/api/notifications/read-all', { method: 'PUT' });
        notificationsCache = notificationsCache.map(item => ({ ...item, is_read: true }));
        updateNotificationPulse(0);
    } catch (e) {
        console.error('Failed to mark notifications as read', e);
    }
}

async function startNotificationPolling() {
    if (!currentUser) return;
    if (notificationPoller) clearInterval(notificationPoller);
    if (scheduleWatcher) clearInterval(scheduleWatcher);
    await fetchNotifications({ notifyFresh: true });
    checkPomodoroDeadline();
    await checkScheduleNotifications();
    notificationPoller = setInterval(() => {
        fetchNotifications({ notifyFresh: true });
        checkPomodoroDeadline();
    }, 30000);
    scheduleWatcher = setInterval(() => {
        checkScheduleNotifications();
        if (currentPage === 'dashboard') updateDashActiveBlock();
    }, 15000);
}

function showToast(msg) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const t = document.createElement('div');
    t.className = 'card-elevated anim-pop';
    t.style.background = 'var(--primary)';
    t.style.color = 'white';
    t.style.padding = '1rem 2rem';
    t.style.borderRadius = 'var(--radius-md)';
    t.style.fontWeight = '800';
    t.style.boxShadow = 'var(--shadow-charcoal)';
    t.textContent = msg;
    container.appendChild(t);
    setTimeout(() => t.remove(), 4000);
}

function openModal(id) {
    const el = document.getElementById(`modal-${id}`);
    if (el) el.classList.remove('hidden');
}

window.closeModal = function(param) {
    if (typeof param === 'string') {
        const el = document.getElementById(`modal-${param}`);
        if (el) el.classList.add('hidden');
    } else {
        const e = param;
        // If it's an event, only close if clicking the background or a dismiss button
        if (e && e.target !== e.currentTarget && !e.target.closest('.btn-ghost') && !e.target.closest('.btn-primary')) return;
        const container = document.getElementById('modal-container');
        if (container) container.innerHTML = '';
    }
};

function getGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 17) return 'Good Afternoon';
    return 'Good Evening';
}


function initButtons() {
    const newBtn = document.getElementById('new-initiative-btn');
    if (newBtn) {
        newBtn.addEventListener('click', showQuickActionModal);
    }
    
    // Keyboard Shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        
        if (e.key === 'q' || (e.ctrlKey && e.key === 'k')) {
            e.preventDefault();
            showQuickActionModal();
        }
        
        if (e.key === 'd') navigate('dashboard');
        if (e.key === 't') navigate('tasks');
        if (e.key === 'p') navigate('pomodoro');
    });
}

// Quick search — highlights matching text in current view
function handleSearch(query) {
    if (!query || query.length < 2) return;
    const lq = query.toLowerCase();
    // Navigate to tasks if searching and show matching tasks
    if (currentPage !== 'tasks' && currentPage !== 'team-grid') {
        navigate('tasks');
    }
}




function initNav() {
    document.querySelectorAll('.nav-item[data-view]').forEach(item => {
        item.addEventListener('click', () => {
            navigate(item.getAttribute('data-view'));
            if (isMobile()) toggleSidebar();
        });
    });
}

function initMobileMenu() {
    const btn = document.getElementById('menu-toggle');
    if (btn) btn.onclick = toggleSidebar;

    document.querySelectorAll('.nav-btn[data-view]').forEach(btn => {
        btn.addEventListener('click', () => {
            navigate(btn.getAttribute('data-view'));
            // If the sidebar is open, close it (though nav-btn is for bottom nav, consistency is good)
            const sb = document.getElementById('sidebar');
            if (sb && sb.classList.contains('open')) toggleSidebar();
        });
    });

}

function initResponsiveEnhancements() {
    syncMobileViewportOffsets();
    enhanceResponsiveTables();

    window.addEventListener('resize', () => {
        syncMobileViewportOffsets();
        enhanceResponsiveTables();

        if (!isMobile()) {
            const sb = document.getElementById('sidebar');
            const overlay = document.getElementById('sidebar-overlay');
            if (sb) sb.classList.remove('open');
            if (overlay) overlay.classList.add('hidden');
        }
    });

    const observer = new MutationObserver(() => {
        syncMobileViewportOffsets();
        enhanceResponsiveTables();
    });

    ['main-view', 'modal-container', 'modal-share', 'auth-container'].forEach(id => {
        const el = document.getElementById(id);
        if (el) observer.observe(el, { childList: true, subtree: true });
    });
}

function syncMobileViewportOffsets() {
    const root = document.documentElement;
    const mobileHeader = document.getElementById('mobile-header');
    const mobileNav = document.getElementById('mobile-nav');
    const headerHeight = mobileHeader ? Math.ceil(mobileHeader.getBoundingClientRect().height) : 72;
    const navHeight = mobileNav ? Math.ceil(mobileNav.getBoundingClientRect().height) : 96;

    root.style.setProperty('--mobile-header-height', `${headerHeight}px`);
    root.style.setProperty('--mobile-nav-height', `${navHeight}px`);
}

function enhanceResponsiveTables() {
    document.querySelectorAll('table').forEach(table => {
        if (table.closest('.table-scroll') || table.closest('.habit-matrix-wrapper')) return;

        const wrapper = document.createElement('div');
        wrapper.className = 'table-scroll';
        table.parentNode.insertBefore(wrapper, table);
        wrapper.appendChild(table);
    });
}

function toggleSidebar() {
    const sb = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (sb) sb.classList.toggle('open');
    if (overlay) overlay.classList.toggle('hidden');
}

function isMobile() {
    return window.innerWidth <= 768;
}

// ── Auth ────────────────────────────────────────────────
async function checkAuth() {
    try {
        await fetchCsrfToken();
        const res = await fetch('/api/auth/me');
        if (res.ok) {
            const data = await res.json();
            currentUser = data.user;
            hideAuthScreen();
            await fetchScheduleModes();
            initializeCurrentScheduleMode();
            updateUserUI();
            await fetchCollaborators();
            navigate(currentPage);
            startNotificationPolling();
        } else {
            showAuthScreen();
        }
    } catch (e) {
        showAuthScreen();
    }
}

function showAuthScreen() {
    const auth = document.getElementById('auth-container');
    const shell = document.getElementById('app-shell');
    auth.classList.remove('hidden');
    shell.classList.add('hidden');
    if (notificationPoller) clearInterval(notificationPoller);
    if (scheduleWatcher) clearInterval(scheduleWatcher);
    renderAuthCard('login');
}

function hideAuthScreen() {
    const auth = document.getElementById('auth-container');
    const shell = document.getElementById('app-shell');
    auth.classList.add('hidden');
    shell.classList.remove('hidden');
}

function renderAuthCard(mode) {
    const container = document.getElementById('auth-container');
    container.innerHTML = `
    <div class="auth-card">
        <div class="auth-logo">
            <span class="material-symbols-outlined" style="font-size:2rem;">token</span>
        </div>
        <div class="auth-tag">COMMANDFLOW — SECURE ACCESS</div>
        <h2 style="font-size:1.5rem;font-weight:800;margin-bottom:2rem;">Welcome to the Workspace</h2>

        <div class="auth-tabs">
            <button class="auth-tab-btn ${mode==='login'?'active':''}" onclick="renderAuthCard('login')">Login</button>
            <button class="auth-tab-btn ${mode==='signup'?'active':''}" onclick="renderAuthCard('signup')">Sign Up</button>
        </div>

        <form onsubmit="handleAuthSubmit(event, '${mode}')">
            ${mode === 'signup' ? `
                <div class="auth-input-group">
                    <label>Display Name</label>
                    <input class="input-recessed" type="text" id="auth-dn" placeholder="e.g. Ansh Gautam" required>
                </div>
            ` : ''}
            <div class="auth-input-group">
                <label>Username or Email</label>
                <input class="input-recessed" type="text" id="auth-id" placeholder="Enter identifier" required>
            </div>
            <div class="auth-input-group">
                <label>Password</label>
                <input class="input-recessed" type="password" id="auth-pw" placeholder="••••••••" required>
            </div>
            <button type="submit" class="btn-primary" style="width:100%;padding:1rem;margin-top:1rem;">
                ${mode === 'login' ? 'Access Workspace' : 'Initialize Protocol'}
            </button>
        </form>

        ${mode === 'login' ? `
            <div class="auth-quick-access">
                <p class="label-sm mb-4">Demo Mode</p>
                <button class="btn-ghost" onclick="quickLogin()" style="width:100%;font-size:0.75rem;">Login as Ansh (Seed Data)</button>
            </div>
        ` : ''}

        <div class="auth-footer">
            CommandFlow Workspace © 2026<br>
            <span style="opacity:0.5;font-size:0.6rem;">Optimized for Executive Output</span>
        </div>
    </div>`;
}

async function handleAuthSubmit(e, mode) {
    e.preventDefault();
    const id = document.getElementById('auth-id').value;
    const pw = document.getElementById('auth-pw').value;
    const dn = document.getElementById('auth-dn')?.value;

    const url = mode === 'login' ? '/api/auth/login' : '/api/auth/signup';
    const body = mode === 'login' ? { username: id, password: pw } : { username: id, email: id, password: pw, display_name: dn };

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(body)
        });
        const data = await res.json();
        if (res.ok) {
            currentUser = data.user;
            hideAuthScreen();
            updateUserUI();
            await fetchCollaborators();
            navigate('dashboard');
            startNotificationPolling();
            showToast(`Welcome back, ${currentUser.display_name}`);
        } else {
            alert(data.error || 'Authentication failed');
        }
    } catch (err) {
        alert('Server connection error');
    }
}

async function quickLogin() {
    document.getElementById('auth-id').value = 'ansh';
    document.getElementById('auth-pw').value = 'charcoal';
    document.querySelector('form').requestSubmit();
}

function updateUserUI() {
    if (!currentUser) return;
    const nameEl = document.getElementById('user-name');
    const avatarEl = document.getElementById('user-avatar');
    if (nameEl) nameEl.textContent = currentUser.display_name;
    if (avatarEl) avatarEl.textContent = (currentUser.display_name || 'E')[0].toUpperCase();
}

async function handleLogout() {
    if (!confirm('De-authenticate this workspace session?')) return;
    await fetch('/api/auth/logout', { method: 'POST' });
    if (notificationPoller) clearInterval(notificationPoller);
    if (scheduleWatcher) clearInterval(scheduleWatcher);
    currentUser = null;
    showToast('Securely logged out');
    window.location.reload();
}

// ── Routing ─────────────────────────────────────────────
function navigate(page) {
    currentPage = page;
    document.querySelectorAll('.nav-item[data-view]').forEach(n => {
        n.classList.toggle('active', n.getAttribute('data-view') === page);
    });

    document.querySelectorAll('.nav-btn[data-view]').forEach(n => {
        n.classList.toggle('active', n.getAttribute('data-view') === page);
        // Special tactile active styling for mobile nav
        if (n.getAttribute('data-view') === page) {
            n.classList.add('bg-[#d9e4ec]', 'shadow-[inset_2px_2px_5px_rgba(0,0,0,0.05),inset_-2px_-2px_5px_rgba(255,255,255,0.7)]', 'text-[#333333]', 'rounded-2xl');
            const icon = n.querySelector('.material-symbols-outlined');
            if (icon) icon.style.fontVariationSettings = "'FILL' 1";
        } else {
            n.classList.remove('bg-[#d9e4ec]', 'shadow-[inset_2px_2px_5px_rgba(0,0,0,0.05),inset_-2px_-2px_5px_rgba(255,255,255,0.7)]', 'text-[#333333]', 'rounded-2xl');
            const icon = n.querySelector('.material-symbols-outlined');
            if (icon) icon.style.fontVariationSettings = "'FILL' 0";
        }
    });

    ['dashboard','schedule','pomodoro','tasks','task-hub','tracker','planner','leads','team-grid','settings','todoist','automation','invites','notifications'].forEach(v => {
        const el = document.getElementById(`view-${v}`);
        if (el) el.classList.add('hidden');
    });

    const target = document.getElementById(`view-${page}`);
    if (target) {
        target.classList.remove('hidden');
        renderPage(page);
        updateBreadcrumbs(page);
        requestAnimationFrame(() => {
            syncMobileViewportOffsets();
            enhanceResponsiveTables();
            document.getElementById('main-view')?.scrollTo({ top: 0, behavior: 'auto' });
        });
    }
}

function updateBreadcrumbs(page) {
    const el = document.getElementById('breadcrumb-current');
    if (!el) return;
    const names = {
        'dashboard': 'Dashboard',
        'schedule': 'Daily Ops',
        'pomodoro': 'Temporal Engine',
        'tasks': 'Priorities',
        'tracker': 'Velocity Tracker',
        'planner': 'Executive Planner',
        'leads': 'Business Pipeline',
        'team-grid': 'Team Radar',
        'settings': 'System Settings',
        'automation': 'Automation logic',
        'invites': 'Invite Center',
        'notifications': 'Notifications'
    };
    el.textContent = names[page] || page.charAt(0).toUpperCase() + page.slice(1);
}

function showQuickActionModal() {
    const container = document.getElementById('modal-container');
    container.innerHTML = `
        <div class="modal-overlay" onclick="closeModal(event)">
            <div class="modal-card anim-pop" style="max-width:800px;">
                <h3 style="font-size:1.5rem;text-align:center;">Unified Creation Center</h3>
                <p style="text-align:center;color:var(--outline);font-size:0.8rem;margin-bottom:2rem;">Deploy new objectives across the workspace pipeline.</p>
                
                <div class="qa-grid">
                    <div class="qa-card" onclick="showNewTaskForm()">
                        <span class="material-symbols-outlined">priority_high</span>
                        <h4>Priority Task</h4>
                        <p>Deploy a new objective to the mission matrix.</p>
                    </div>
                    <div class="qa-card" onclick="showLeadForm()">
                        <span class="material-symbols-outlined">person_add</span>
                        <h4>Business Lead</h4>
                        <p>Initialize a new entity in the growth pipeline.</p>
                    </div>
                    <div class="qa-card" onclick="navigate('schedule'); closeModal();">
                        <span class="material-symbols-outlined">calendar_today</span>
                        <h4>Time Block</h4>
                        <p>Deploy a temporal anchor to the operations daily ops.</p>
                    </div>
                    <div class="qa-card" onclick="openModal('share'); closeModal();">
                        <span class="material-symbols-outlined">share</span>
                        <h4>Collaborate</h4>
                        <p>Share a workspace section with a teammate.</p>
                    </div>
                </div>
                
                <div style="margin-top:3rem;padding-top:2rem;border-top:1px solid var(--surface-container);display:flex;justify-content:center;">
                    <button class="btn-ghost" onclick="closeModal()">Dismiss Protocol</button>
                </div>
            </div>
        </div>
    `;
}

// closeModal merged above


function showNewTaskForm() {
    closeModal();
    navigate('tasks');
    setTimeout(() => {
        const input = document.getElementById('new-task-input');
        if (input) input.focus();
    }, 100);
}

function showLeadForm() {
    closeModal();
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.onclick = (e) => e.target === overlay && overlay.remove();
    overlay.innerHTML = `
        <div class="modal-card anim-pop" style="max-width:500px;">
            <h3 class="mb-6">Capture New Lead</h3>
            <form onsubmit="handleLeadSubmit(event)">
                <div class="mb-4">
                    <label class="label-sm">Name / Entity</label>
                    <input type="text" id="nl-name" class="input-well w-full" placeholder="Contact name" required>
                </div>
                <div class="mb-4">
                    <label class="label-sm">Organization</label>
                    <input type="text" id="nl-company" class="input-well w-full" placeholder="Company name">
                </div>
                <div style="display:grid;grid-template-columns: ${isMobile() ? '1fr' : '1fr 1fr'};gap:1rem;" class="mb-4">
                    <div>
                        <label class="label-sm">Valuation (₹)</label>
                        <input type="number" id="nl-value" class="input-well w-full" value="0">
                    </div>
                    <div>
                        <label class="label-sm">Source</label>
                        <select id="nl-source" class="input-well w-full">
                            <option value="Direct">Direct</option>
                            <option value="Referral">Referral</option>
                            <option value="Website">Website</option>
                            <option value="Social Media">Social Media</option>
                            <option value="Event">Event</option>
                        </select>
                    </div>
                </div>
                <div class="mb-6">
                    <label class="label-sm">Internal Notes</label>
                    <textarea id="nl-notes" class="input-well w-full" style="height:80px;" placeholder="Initial intelligence..."></textarea>
                </div>
                <div style="display:flex;gap:1rem;">
                    <button type="submit" class="btn-primary" style="flex:2;">Create Lead</button>
                    <button type="button" class="btn-ghost" style="flex:1;" onclick="this.closest('.modal-overlay').remove()">Dismiss</button>
                </div>
            </form>
        </div>
    `;
    document.body.appendChild(overlay);
}

async function handleLeadSubmit(e) {
    e.preventDefault();
    const data = {
        name: document.getElementById('nl-name').value,
        company: document.getElementById('nl-company').value,
        value: parseFloat(document.getElementById('nl-value').value),
        source: document.getElementById('nl-source').value,
        notes: document.getElementById('nl-notes').value,
        status: 'New'
    };
    const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    if (res.ok) {
        showToast('Lead captured in pipeline');
        document.querySelector('.modal-overlay').remove();
        loadLeads();
    }
}

function renderPage(page) {
    if (dashTimer) { clearInterval(dashTimer); dashTimer = null; }
    switch(page) {
        case 'dashboard':  loadDashboard(); break;
        case 'schedule':   loadSchedule(); break;
        case 'pomodoro':   loadPomodoro(); break;
        case 'tasks':      loadTasks(); break;
        case 'task-hub':   loadTaskHub(); break;
        case 'tracker':    loadTracker(); break;
        case 'planner':    loadPlanner(); break;
        case 'leads':      loadLeads(); break;
        case 'team-grid':  loadTeamGrid(); break;
        case 'settings':   loadSettings(); break;
        case 'automation': loadAutomationGuide(); break;
        case 'invites':    loadInvites(); break;
        case 'notifications': loadNotificationsPage(); break;
    }
}

function renderQuickAccessLinks(links = []) {
    if (!links.length) return '';
    return `
    <div class="page-shortcuts" style="display:flex;gap:0.75rem;margin-bottom:2rem;overflow-x:auto;padding-bottom:0.5rem;scrollbar-width:none;flex-wrap:nowrap;">
        ${links.map(l => `
            <button onclick="navigate('${l.view}')" class="page-shortcut-btn" style="flex-shrink:0;display:flex;align-items:center;gap:0.5rem;">
                <span class="material-symbols-outlined">${l.icon}</span>
                <span>${l.label}</span>
            </button>
        `).join('')}
    </div>`;
}

async function loadNotificationsPage() {
    await fetchNotifications();
    const c = document.getElementById('view-notifications');
    if (!c) return;

    c.innerHTML = `
    <div class="anim-slide" style="max-width:980px;margin:0 auto;">
        <div class="view-header">
            <div class="view-header-content">
                <span class="label-overline">Workspace Alerts</span>
                <h1 style="font-size:2.6rem;margin:0;">Notifications</h1>
                <p style="color:var(--outline);font-size:0.85rem;margin-top:0.35rem;">
                    ${notificationsCache.filter(item => !item.is_read).length} unread updates
                </p>
            </div>
            <div class="view-header-actions">
                <button class="btn-ghost" onclick="requestNotificationPermission()">Enable Alerts</button>
                <button class="btn-primary" onclick="markAllNotificationsRead().then(loadNotificationsPage)">Mark All Read</button>
            </div>
        </div>
        <div class="card-elevated" style="padding:1rem;">
            ${notificationsCache.length ? notificationsCache.map(item => `
                <div style="padding:1rem 1.2rem;border-bottom:1px solid var(--surface-container-high);display:flex;justify-content:space-between;gap:1rem;align-items:flex-start;">
                    <div style="flex:1;">
                        <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:0.35rem;flex-wrap:wrap;">
                            <span class="pill ${item.is_read ? '' : 'pill-green'}" style="font-size:0.55rem;">${item.is_read ? 'READ' : 'NEW'}</span>
                            <strong style="font-size:0.92rem;color:var(--on-surface);">${item.title}</strong>
                        </div>
                        <p style="font-size:0.82rem;color:var(--on-surface-variant);">${item.message}</p>
                    </div>
                    <div style="font-size:0.65rem;color:var(--outline);white-space:nowrap;">${formatTimeAgo(item.created_at)}</div>
                </div>
            `).join('') : `
                <div style="padding:2.5rem;text-align:center;color:var(--outline);">No notifications yet.</div>
            `}
        </div>
    </div>`;
}

// ═══════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════
async function loadDashboard() {
    const c = document.getElementById('view-dashboard');
    let stats = { today_pomodoros: 0, week_hours: 0, pending_tasks: 0, completed_tasks: 0 };
    let tasks = [];
    try { const r = await fetch('/api/dashboard/stats'); stats = await r.json(); } catch(e) {}
    try { const r = await fetch(`/api/tasks?show=active&day_type=${currentScheduleMode || 'all'}`); tasks = await r.json(); } catch(e) {}

    const pendingTasks = tasks.filter(t => !t.completed);
    const completedTasks = tasks.filter(t => t.completed);
    const pendingP1 = pendingTasks.filter(t => t.priority === 1).length;
    const todayPoms = stats.today_pomodoros || 0;
    const velocityPct = Math.min(100, Math.round((todayPoms / 9) * 100));
    const gaugeOffset = 553 - (velocityPct / 100) * 553;

    if (isMobile()) {
        c.innerHTML = `
        <div class="anim-slide px-2">
            <div class="mb-8">
                <span class="label-overline">Mission Control</span>
                <h1 class="text-3xl font-bold tracking-tight">System Performance</h1>
            </div>

            <!-- Main Gauge Section -->
            <section class="mb-12 flex justify-center">
                <div class="relative w-64 h-64 flex items-center justify-center neumorphic-raised bg-surface-container-lowest rounded-full">
                    <!-- Physical Gauge Design -->
                    <svg class="w-56 h-56">
                        <circle class="text-surface-container-low" cx="112" cy="112" fill="transparent" r="100" stroke="currentColor" stroke-width="8"></circle>
                        <circle class="text-primary" cx="112" cy="112" fill="transparent" r="100" stroke="currentColor" stroke-linecap="round" stroke-width="12"
                                stroke-dasharray="628" stroke-dashoffset="${628 - (velocityPct / 100) * 628}"
                                style="transform: rotate(-90deg); transform-origin: 50% 50%; transition: stroke-dashoffset 1s ease;"></circle>
                    </svg>
                    <div class="absolute inset-0 flex flex-col items-center justify-center text-center">
                        <span class="text-4xl font-extrabold text-on-surface-variant tracking-tighter">${velocityPct}%</span>
                        <span class="text-[10px] uppercase tracking-widest font-bold text-outline">Efficiency</span>
                    </div>
                    <div class="absolute inset-4 rounded-full border border-white/40 pointer-events-none"></div>
                </div>
            </section>

            <!-- Tactile Stat Wells -->
            <section class="grid grid-cols-2 gap-4 mb-10">
                <div class="neumorphic-inset rounded-2xl p-5 bg-surface-container-low">
                    <div class="flex items-center gap-2 mb-3">
                        <span class="material-symbols-outlined text-sm text-primary">speed</span>
                        <span class="text-[10px] font-bold uppercase tracking-widest text-outline">Velocity</span>
                    </div>
                    <div class="flex items-baseline gap-1">
                        <span class="text-2xl font-bold tracking-tight text-on-surface">${todayPoms}</span>
                        <span class="text-[10px] text-primary-dim font-medium">poms</span>
                    </div>
                </div>
                <div class="neumorphic-inset rounded-2xl p-5 bg-surface-container-low">
                    <div class="flex items-center gap-2 mb-3">
                        <span class="material-symbols-outlined text-sm text-primary">priority_high</span>
                        <span class="text-[10px] font-bold uppercase tracking-widest text-outline">P1 Alerts</span>
                    </div>
                    <div class="flex items-baseline gap-1">
                        <span class="text-2xl font-bold tracking-tight text-on-surface">${pendingP1}</span>
                        <span class="text-[10px] text-primary-dim font-medium">active</span>
                    </div>
                </div>
                <div class="neumorphic-inset rounded-2xl p-5 bg-surface-container-low">
                    <div class="flex items-center gap-2 mb-3">
                        <span class="material-symbols-outlined text-sm text-primary">checklist</span>
                        <span class="text-[10px] font-bold uppercase tracking-widest text-outline">Objectives</span>
                    </div>
                    <div class="flex items-baseline gap-1">
                        <span class="text-2xl font-bold tracking-tight text-on-surface">${pendingTasks.length}</span>
                        <span class="text-[10px] text-primary-dim font-medium">pending</span>
                    </div>
                </div>
                <div class="neumorphic-inset rounded-2xl p-5 bg-surface-container-low">
                    <div class="flex items-center gap-2 mb-3">
                        <span class="material-symbols-outlined text-sm text-primary" style="font-variation-settings:'FILL' 1;">timer</span>
                        <span class="text-[10px] font-bold uppercase tracking-widest text-outline">Uptime</span>
                    </div>
                    <div class="flex items-baseline gap-1">
                        <span class="text-2xl font-bold tracking-tight text-on-surface">99.9</span>
                        <span class="text-[10px] text-primary-dim font-medium">%</span>
                    </div>
                </div>
            </section>

            <!-- Featured Card -->
            <section class="mb-6">
                <div class="relative overflow-hidden rounded-[32px] neumorphic-raised bg-primary p-8 text-on-primary">
                    <div class="absolute top-0 right-0 w-48 h-48 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/3 blur-3xl"></div>
                    <div class="relative z-10">
                        <span class="text-[10px] font-bold uppercase tracking-[0.2em] opacity-80">Executive Insight</span>
                        <h2 class="text-2xl font-bold mt-2 mb-4 leading-tight">Protocol: ${pendingTasks.length > 0 ? pendingTasks[0].title : 'All Systems Nominal'}</h2>
                        <p class="text-sm font-light leading-relaxed opacity-90 mb-6">Maintain focus on core objectives to sustain 1.2x velocity multiplier.</p>
                        <button class="bg-surface-container-lowest text-primary px-6 py-2 rounded-full text-xs font-bold uppercase tracking-widest" onclick="navigate('task-hub')">Access Matrix</button>
                    </div>
                </div>
            </section>
        </div>`;
        return;
    }

    c.innerHTML = `
    <div class="anim-slide px-4 md:px-0">
        <div class="view-header flex flex-col md:flex-row items-start md:items-center justify-between gap-6 mb-12">
            <div class="view-header-content">
                <span class="label-overline">Mission Control</span>
                <h1 class="text-3xl md:text-5xl font-black tracking-tighter text-primary">Command Center</h1>
            </div>
            <div class="view-header-actions w-full md:w-auto">
                <button class="btn-ghost w-full md:w-auto justify-center" onclick="showSectionGuide()">
                    <span class="material-symbols-outlined">help_outline</span> GUIDE
                </button>
            </div>
        </div>


        
        <!-- Hero Section -->

        <div class="card-elevated mb-8" style="display:flex;align-items:center;gap:3rem;flex-wrap:wrap;justify-content:center;">
            <!-- Live Velocity Gauge -->
            <div style="position:relative;width:200px;height:200px;flex-shrink:0;margin:0 auto;">
                <svg style="width:100%;height:100%;transform:rotate(-90deg);" viewBox="0 0 200 200">
                    <circle cx="100" cy="100" r="80" fill="none" stroke="var(--surface-container-high)" stroke-width="14"></circle>
                    <circle cx="100" cy="100" r="80" fill="none" stroke="var(--primary)" stroke-width="14"
                            stroke-dasharray="503" stroke-dashoffset="${503 - (velocityPct/100)*503}" stroke-linecap="round"
                            style="transition:stroke-dashoffset 1s ease;"></circle>
                </svg>
                <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;">
                    <span style="font-size:2.2rem;font-weight:800;color:#333;line-height:1;">${todayPoms}<span style="font-size:0.9rem;font-weight:400;color:var(--outline);">/9</span></span>
                    <span class="label-overline" style="display:block;margin-top:0.4rem;">Pomodoros</span>
                </div>
            </div>
            <!-- Initiative -->
            <div style="flex:1;min-width: ${isMobile() ? '100%' : '300px'}; text-align:center;">
                <span class="label-overline mb-2" style="display:block;">Primary Initiative</span>
                <h2 id="dash-pillar-1" style="font-size:2.2rem;letter-spacing:-0.04em;line-height:1.1;">
                    ${pendingTasks.length > 0 ? pendingTasks[0].title : 'Deep Work Protocol'}
                </h2>
                <p id="dash-pillar-2" style="color:var(--on-surface-variant);font-size:0.95rem;font-style:italic;margin-top:0.75rem;line-height:1.6;">
                    ${pendingTasks.length > 0 ? (pendingTasks[0].description || 'Integrating habit systems with real-time velocity tracking.') : 'Integrating habit systems with real-time velocity tracking for optimized executive output.'}
                </p>
                <div style="display:flex;gap:1rem;margin-top:1.5rem;justify-content:center;flex-wrap:wrap;">
                    <button class="btn-primary" onclick="${pendingTasks.length > 0 ? `linkTaskToPom(${pendingTasks[0].id}, '${pendingTasks[0].title.replace(/'/g, "\\'")}', 'task').then(() => navigate('pomodoro'))` : "navigate('pomodoro')" }">▶ Start Session</button>
                    <button class="btn-ghost" onclick="navigate('tasks')">View Tasks (${pendingTasks.length} pending)</button>
                </div>
            </div>
        </div>

        <!-- Stat Wells -->
        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(160px, 1fr));gap:1.5rem;" class="mb-8">
            <div class="stat-well" style="cursor:pointer;" onclick="navigate('pomodoro')">
                <div class="flex-between">
                    <span class="material-symbols-outlined" style="color:var(--primary);">timer</span>
                    <span class="pill pill-green">${velocityPct}%</span>
                </div>
                <span class="stat-value">${todayPoms}/9</span>
                <span class="stat-label">Sessions Today</span>
            </div>
            <div class="stat-well" style="cursor:pointer;" onclick="navigate('tracker')">
                <div class="flex-between">
                    <span class="material-symbols-outlined" style="color:var(--primary);">trending_up</span>
                    <span class="pill">This Week</span>
                </div>
                <span class="stat-value">${stats.week_hours || 0}h</span>
                <span class="stat-label">Focus Hours</span>
            </div>
            <div class="stat-well" style="cursor:pointer;" onclick="navigate('tasks')">
                <div class="flex-between">
                    <span class="material-symbols-outlined" style="color:var(--error);">priority_high</span>
                    <span class="pill pill-red">${pendingP1 > 0 ? 'Urgent' : 'Clear'}</span>
                </div>
                <span class="stat-value">${pendingTasks.length}</span>
                <span class="stat-label">Pending Tasks</span>
            </div>
            <div class="stat-well" style="cursor:pointer;" onclick="navigate('tasks')">
                <div class="flex-between">
                    <span class="material-symbols-outlined" style="color:#16a34a;">check_circle</span>
                    <span class="pill pill-green">Done</span>
                </div>
                <span class="stat-value">${completedTasks.length}</span>
                <span class="stat-label">Completed Tasks</span>
            </div>
        </div>

        <!-- Pending Tasks Preview + Active Block -->
        <div class="quadrant-grid" style="margin-bottom:2rem;">
            <!-- Pending Tasks Quick View -->
            <div class="card-elevated">
                <div class="flex-between mb-4">
                    <h3 style="font-size:1.1rem;">Pending Tasks</h3>
                    <button class="btn-ghost" style="font-size:0.7rem;padding:0.4rem 0.9rem;" onclick="navigate('tasks')">View All →</button>
                </div>
                ${pendingTasks.length === 0 
                    ? '<div style="text-align:center;padding:2rem;color:var(--outline);">✓ All caught up!</div>'
                    : pendingTasks.slice(0,5).map(t => `
                        <div style="display:flex;align-items:center;gap:0.75rem;padding:0.75rem 0;border-bottom:1px solid var(--surface-container-high);">
                            <div style="width:8px;height:8px;border-radius:50%;flex-shrink:0;background:${t.priority===1?'var(--error)':t.priority===2?'var(--primary)':'var(--outline)'};"></div>
                            <span style="flex:1;font-size:0.85rem;font-weight:600;color:#333;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHTML(t.title)}</span>
                            <span class="pill" style="font-size:0.55rem;flex-shrink:0;">P${t.priority}</span>
                        </div>
                    `).join('')
                }
            </div>
            <!-- Active Block -->
            <div class="card-elevated">
                <div class="flex-between mb-4">
                    <h3 style="font-size:1.1rem;">Active Protocol</h3>
                    <button class="btn-ghost" style="font-size:0.7rem;padding:0.4rem 0.9rem;" onclick="navigate('schedule')">Schedule →</button>
                </div>
                <div id="dash-active-block" style="text-align:center;padding:1.5rem 0;">
                    <div id="dash-block-title" style="font-size:1.3rem;font-weight:800;color:#333;">Scanning...</div>
                    <div class="progress-track mt-4" style="width:90%;margin:1rem auto 0;">
                        <div id="dash-block-prog" class="progress-fill" style="width:0%;"></div>
                    </div>
                    <div id="dash-block-meta" class="label-sm mt-4">Detecting current block...</div>
                </div>
            </div>
        </div>

        <!-- Bottom Row -->
        <div class="card-charcoal">
            <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:1rem;">
                <div>
                    <span class="label-sm" style="color:rgba(255,255,255,0.4);display:block;margin-bottom:0.5rem;">EXECUTIVE INSIGHT</span>
                    <p style="font-size:1.1rem;font-weight:300;line-height:1.6;">
                        ${todayPoms >= 6 ? '🔥 Outstanding day — you\'re in peak velocity mode.' : todayPoms >= 3 ? '✅ Good progress — keep the momentum going.' : '💡 Start your first Pomodoro to build momentum.'}
                    </p>
                </div>
                <div style="display:flex;gap:0.75rem;">
                    <button onclick="navigate('tracker')" style="background:none;border:1px solid rgba(255,255,255,0.2);padding:0.5rem 1rem;border-radius:var(--radius-sm);color:rgba(255,255,255,0.9);font-weight:700;font-size:0.75rem;cursor:pointer;font-family:var(--font-body);transition:all 0.2s;">View Reports →</button>
                    <button onclick="navigate('pomodoro')" style="background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.3);padding:0.5rem 1rem;border-radius:var(--radius-sm);color:white;font-weight:700;font-size:0.75rem;cursor:pointer;font-family:var(--font-body);transition:all 0.2s;">▶ Focus Now</button>
                </div>
            </div>
        </div>
    </div>`;

    updateDashActiveBlock();
    syncDashboardPillars();
    
    // Auto-refresh dashboard stats every 30 seconds
    if (dashTimer) clearInterval(dashTimer);
    dashTimer = setInterval(() => {
        if (currentPage === 'dashboard') {
            loadDashboard();
        } else {
            clearInterval(dashTimer);
            dashTimer = null;
        }
    }, 30000);
}

async function syncDashboardPillars() {
    const weekKey = getMonday(0);
    try {
        const r = await fetch(`/api/planner/${weekKey}`);
        const data = await r.json();
        if (data.goals && data.goals.g1) {
            document.getElementById('dash-pillar-1').textContent = data.goals.g1;
        }
        if (data.goals && data.goals.g2) {
            document.getElementById('dash-pillar-2').textContent = data.goals.g2;
        }
    } catch(e) {}
}

async function updateDashActiveBlock() {
    if (currentPage !== 'dashboard') return;
    if (!blocksCache.length) await fetchBlocks();
    const now = new Date();
    const curTime = now.getHours() * 60 + now.getMinutes();
    const current = blocksCache.find(b => {
        const isCorrectMode = b.day_type === currentScheduleMode || b.day_type === 'daily';
        return isCorrectMode && curTime >= timeToMin(b.start_time) && curTime < timeToMin(b.end_time);
    });

    const title = document.getElementById('dash-block-title');
    const prog = document.getElementById('dash-block-prog');
    const meta = document.getElementById('dash-block-meta');
    if (!title) return;

    if (current) {
        title.textContent = current.title;
        const s = timeToMin(current.start_time), e = timeToMin(current.end_time);
        const pct = ((curTime - s) / (e - s)) * 100;
        prog.style.width = pct + '%';
        meta.textContent = `${current.start_time} — ${current.end_time}  ·  ${Math.round(pct)}% Complete`;
    } else {
        title.textContent = 'Free Time';
        title.style.color = 'var(--outline)';
        prog.style.width = '0%';
        meta.textContent = 'No active block detected';
    }
}

// ═══════════════════════════════════════════════════════
// SCHEDULE — Daily Ops
// ═══════════════════════════════════════════════════════
const SCHED_CAT = {
    personal: { label: 'Personal', color: '#8b7fff', icon: 'person' },
    learning: { label: 'Learning', color: '#4d96ff', icon: 'auto_stories' },
    college:  { label: 'College', color: '#8b7fff', icon: 'school' },
    dt:       { label: 'DevTailored', color: '#00e5a0', icon: 'code' },
    shop:     { label: 'Shop', color: '#ff9f4a', icon: 'storefront' },
    free:     { label: 'Free Time', color: '#ffd166', icon: 'sports_esports' },
    sleep:    { label: 'Sleep', color: '#6c757d', icon: 'bedtime' },
    transit:  { label: 'Transit', color: '#ff9f4a', icon: 'directions_bus' },
    ai:       { label: 'AI/ML Lab', color: '#ffbe80', icon: 'psychology' },
    night:    { label: 'Night Grind', color: '#ff4f72', icon: 'dark_mode' },
    bonus:    { label: 'Bonus Time', color: '#5fffc8', icon: 'stars' }
};

const SCHEDULE_CHOICE_KEY = 'commandflow_schedule_choice';

let currentScheduleMode = null;

async function fetchScheduleModes() {
    try {
        const res = await fetch('/api/schedule/modes');
        if (res.ok) {
            scheduleModes = await res.json();
        }
    } catch (e) {
        console.error("Failed to fetch schedule modes", e);
    }
}

function initializeCurrentScheduleMode() {
    if (scheduleModes.length === 0) return;
    const saved = JSON.parse(localStorage.getItem(SCHEDULE_CHOICE_KEY) || 'null');
    const today = new Date().toISOString().split('T')[0];
    if (saved && saved.date === today && scheduleModes.find(m => m.slug === saved.mode)) {
        currentScheduleMode = saved.mode;
        return;
    }
    const dayOfWeek = new Date().getDay();
    const activeMode = scheduleModes.find(m => m.days_of_week && m.days_of_week.includes(dayOfWeek));
    if (activeMode) {
        currentScheduleMode = activeMode.slug;
    } else {
        currentScheduleMode = scheduleModes[0].slug;
    }
}

window.setScheduleMode = function(mode) {
    currentScheduleMode = mode;
    const today = new Date().toISOString().split('T')[0];
    localStorage.setItem(SCHEDULE_CHOICE_KEY, JSON.stringify({ mode, date: today }));
    // Refresh the current view to reflect changes
    renderPage(currentPage);
};

function checkMorningSchedulePrompt() {
    if (!currentUser) return;
    const saved = JSON.parse(localStorage.getItem(SCHEDULE_CHOICE_KEY) || 'null');
    const today = new Date().toISOString().split('T')[0];
    if (!saved || saved.date !== today) {
        showMorningPromptModal();
    }
}

function showMorningPromptModal() {
    const container = document.getElementById('modal-container');
    const greeting = getGreeting();
    container.innerHTML = `
        <div class="modal-overlay" onclick="window.closeModal(event)">
            <div class="modal-card anim-pop" style="max-width:560px; text-align:center; padding: 3rem 2rem;" onclick="event.stopPropagation()">
                <div style="width: 64px; height: 64px; background: var(--primary); color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 1.5rem;">
                    <span class="material-symbols-outlined" style="font-size: 32px;">wb_sunny</span>
                </div>
                <h2 style="font-size: 1.75rem; font-weight: 800; margin-bottom: 0.5rem;">${greeting}, ${currentUser.display_name}</h2>
                <p style="color: var(--outline); font-size: 0.9rem; margin-bottom: 2.5rem;">Initialize your daily operations pipeline. What protocol are we running today?</p>
                
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 1rem;">
                    ${scheduleModes.map(m => `
                    <button class="btn-ghost neumorphic-raised" style="padding: 1.5rem 1rem; flex-direction: column; height: auto; border: 1px solid var(--outline-variant); display: flex; align-items: center; justify-content: center; ${currentScheduleMode === m.slug ? 'background: var(--primary); color: white; border-color: var(--primary);' : ''}" onclick="window.setScheduleMode('${m.slug}'); window.closeModal();">
                        <span class="material-symbols-outlined" style="font-size: 24px; margin-bottom: 0.5rem;">${m.icon || 'event'}</span>
                        <span>${m.label}</span>
                    </button>
                    `).join('')}
                </div>
                
                <p style="margin-top: 2rem; font-size: 0.7rem; color: var(--outline-variant); font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em;">You can switch modes anytime from the Daily Ops view.</p>
            </div>
        </div>
    `;
}



async function loadSchedule() {
    await fetchBlocks();
    const c = document.getElementById('view-schedule');
    const scheduleQuickLinks = renderQuickAccessLinks([
        { view: 'tasks', icon: 'checklist', label: 'Tasks' },
        { view: 'pomodoro', icon: 'timer', label: 'Pomodoro' },
        { view: 'team-grid', icon: 'table_chart', label: 'Team Radar' }
    ]);
    c.innerHTML = `
    <div class="anim-slide">
        ${isMobile() ? `
        <div class="view-header">
            <div class="view-header-content">
                <span class="label-overline">Operations Pipeline</span>
                <h1 style="font-size:2rem;margin:0;">Daily Ops</h1>
            </div>
            <div class="view-header-actions flex-col">
                <div style="display:flex; gap:0.5rem; width: 100%;">
                    <button class="btn-ghost flex-1" onclick="showSectionGuide()">
                        <span class="material-symbols-outlined" style="font-size:1.2rem;">help_outline</span> GUIDE
                    </button>
                    <button class="btn-ghost" onclick="showManageModesModal()" title="Manage Modes" style="padding: 0 0.5rem;">
                        <span class="material-symbols-outlined" style="font-size:1.2rem;">settings</span>
                    </button>
                    <button class="btn-primary flex-1" onclick="showAddBlockModal()">
                        <span class="material-symbols-outlined">add</span> ADD
                    </button>
                </div>
                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(60px, 1fr)); gap:0.35rem; background:var(--surface-container); padding:0.35rem; border-radius:var(--radius-md); width: 100%;">
                    ${scheduleModes.map(m => `
                    <button class="btn-ghost ${currentScheduleMode === m.slug ? 'btn-primary' : ''}" style="font-size:0.7rem; padding:0.6rem 0.3rem;" onclick="setScheduleMode('${m.slug}')">${m.label}</button>
                    `).join('')}
                </div>
            </div>
        </div>
        ${scheduleQuickLinks}
        
        <div style="display:flex; gap:1.25rem; margin-top:1.5rem; overflow-x:auto; padding-bottom:1rem; scrollbar-width:none; -ms-overflow-style:none;" class="no-scrollbar">
            ${Object.entries(SCHED_CAT).map(([k,v], i) => `
                <div class="anim-slide-right" style="display:flex;align-items:center;gap:0.5rem;white-space:nowrap;flex-shrink:0;animation-delay:${i*0.05}s;">
                    <span style="width:10px;height:10px;border-radius:50%;background:${v.color};"></span>
                    <span class="label-sm" style="font-size:0.65rem;opacity:0.8;">${v.label}</span>
                </div>
            `).join('')}
        </div>
        ` : `
        <div class="view-header" style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:2rem;">
            <div>
                <span class="label-overline">Operations Pipeline</span>
                <h1 style="font-size:2.35rem;margin:0;">Daily Ops</h1>
            </div>
            <div class="view-header-actions" style="display:flex; gap:0.75rem; align-items:center;">
                <button class="btn-ghost" onclick="showManageModesModal()" title="Manage Custom Schedule Modes">
                    <span class="material-symbols-outlined" style="font-size:1.2rem;">settings</span> MODES
                </button>
                <button class="btn-ghost" onclick="showSectionGuide()">
                    <span class="material-symbols-outlined" style="font-size:1.2rem;">help_outline</span> GUIDE
                </button>
                <div style="display:flex; gap:0.5rem; background:var(--surface-container); padding:0.35rem; border-radius:var(--radius-md);">
                    ${scheduleModes.map(m => `
                    <button class="btn-ghost ${currentScheduleMode === m.slug ? 'btn-primary' : ''}" style="font-size:0.75rem; padding:0.5rem 1rem;" onclick="setScheduleMode('${m.slug}')">${m.label}</button>
                    `).join('')}
                </div>
            </div>
        </div>
        ${scheduleQuickLinks}
        <div style="display:flex;gap:1rem;margin-top:0.75rem;margin-bottom:1.5rem;flex-wrap:wrap;">
            ${Object.entries(SCHED_CAT).map(([k,v]) => `
                <div style="display:flex;align-items:center;gap:0.4rem;">
                    <span style="width:8px;height:8px;border-radius:50%;background:${v.color};"></span>
                    <span class="label-sm" style="font-size:0.6rem;opacity:0.7;">${v.label}</span>
                </div>
            `).join('')}
        </div>
        `}
        <div style="display:grid;grid-template-columns:${isMobile() ? '1fr' : 'minmax(0, 1.45fr) minmax(320px, 0.85fr)'};gap:${isMobile() ? '1.5rem' : '2rem'};align-items:start;">
            <div class="timeline-wrap" id="schedule-timeline" style="position:relative;padding-left:${isMobile() ? '0' : '4.25rem'};">
                <div class="timeline-axis"></div>
                <!-- Timeline content injected here -->
            </div>
            <div class="${isMobile() ? 'hidden' : ''}" id="schedule-form-container">
                <div class="card-recessed mb-6" style="padding:1.5rem;">
                    <h4 class="label-sm mb-4" style="font-size:0.8rem;font-weight:800;color:var(--primary);text-transform:uppercase;letter-spacing:0.1em;">Add New Block</h4>
                    <form onsubmit="handleSaveBlock(event)" style="display:flex;flex-direction:column;gap:1rem;">
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                            <div>
                                <label style="font-size:0.75rem;font-weight:700;color:var(--outline);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.4rem;display:block;">Block Title *</label>
                                <input class="input-recessed" style="width:100%;padding:0.75rem 1rem;border:1px solid var(--outline-variant);border-radius:var(--radius-sm);font-weight:600;" type="text" id="sb-title" placeholder="e.g. Deep Work Session" required>
                            </div>
                            <div>
                                <label style="font-size:0.75rem;font-weight:700;color:var(--outline);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.4rem;display:block;">Target Pomodoros</label>
                                <input class="input-recessed" style="width:100%;padding:0.75rem 1rem;border:1px solid var(--outline-variant);border-radius:var(--radius-sm);font-weight:600;" type="number" id="sb-poms" placeholder="Auto-calculated">
                            </div>
                        </div>
                        <div>
                            <label style="font-size:0.75rem;font-weight:700;color:var(--outline);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.4rem;display:block;">Sub-tasks (Dash-separated)</label>
                            <textarea class="input-recessed" style="width:100%;padding:0.75rem 1rem;border:1px solid var(--outline-variant);border-radius:var(--radius-sm);font-weight:600;resize:vertical;" id="sb-desc" placeholder="e.g. - Design DB Schema \n- Write API endpoints" rows="2"></textarea>
                        </div>
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                            <div>
                                <label style="font-size:0.75rem;font-weight:700;color:var(--outline);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.4rem;display:block;">Start Time *</label>
                                <input class="input-recessed" style="width:100%;padding:0.75rem 1rem;border:1px solid var(--outline-variant);border-radius:var(--radius-sm);font-weight:600;" type="time" id="sb-start" required>
                            </div>
                            <div>
                                <label style="font-size:0.75rem;font-weight:700;color:var(--outline);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.4rem;display:block;">End Time *</label>
                                <input class="input-recessed" style="width:100%;padding:0.75rem 1rem;border:1px solid var(--outline-variant);border-radius:var(--radius-sm);font-weight:600;" type="time" id="sb-end" required>
                            </div>
                        </div>
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                            <div>
                                <label style="font-size:0.75rem;font-weight:700;color:var(--outline);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.4rem;display:block;">Category</label>
                                <select class="input-recessed" style="width:100%;padding:0.75rem 1rem;border:1px solid var(--outline-variant);border-radius:var(--radius-sm);font-weight:600;" id="sb-cat">
                                    ${Object.entries(SCHED_CAT).map(([k,v]) => `<option value="${k}">${v.label}</option>`).join('')}
                                </select>
                            </div>
                            <div>
                                <label style="font-size:0.75rem;font-weight:700;color:var(--outline);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.4rem;display:block;">Day Type</label>
                                <select class="input-recessed" style="width:100%;padding:0.75rem 1rem;border:1px solid var(--outline-variant);border-radius:var(--radius-sm);font-weight:600;" id="sb-day-type">
                                    ${scheduleModes.map(m => `<option value="${m.slug}" ${currentScheduleMode===m.slug?'selected':''}>${m.label}</option>`).join('')}
                                    <option value="daily">📅 Every Day</option>
                                </select>
                            </div>
                        </div>
                        <button type="submit" class="btn-primary" style="width:100%;padding:0.8rem;margin-top:0.5rem;">Deploy Block</button>
                    </form>
                </div>
            </div>
        </div>
    </div>`;
    renderTimeline();
}

function renderTimeline() {
    const wrap = document.getElementById('schedule-timeline');
    if (!wrap) return;
    wrap.innerHTML = '<div class="timeline-axis"></div>';
    
    const filteredBlocks = blocksCache.filter(b => b.day_type === currentScheduleMode || b.day_type === 'daily');
    
    if (filteredBlocks.length === 0) {
        wrap.innerHTML += '<div style="padding:4rem;text-align:center;color:var(--outline);font-size:0.8rem;">No operations deployed for this mode.</div>';
        return;
    }

    const now = new Date();
    const curTime = now.getHours() * 60 + now.getMinutes();

    filteredBlocks.sort((a,b) => timeToMin(a.start_time) - timeToMin(b.start_time)).forEach(b => {
        const startMin = timeToMin(b.start_time);
        const endMin = timeToMin(b.end_time);
        const dur = endMin - startMin;
        const isActive = curTime >= startMin && curTime < endMin;
        const cat = SCHED_CAT[b.category] || SCHED_CAT.personal;

        const block = document.createElement('div');
        block.className = 'timeline-block anim-slide';
        
        if (isMobile()) {
            block.style.cssText = 'position:relative; padding-left:3rem; margin-bottom:1.5rem;';
            block.innerHTML = `
                <!-- Timeline Axis Connection -->
                <div class="absolute left-[1.25rem] top-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-white border-2 border-surface-container-highest z-10"></div>
                
                <div class="neumorphic-raised p-5 rounded-[1.5rem] bg-white border-l-4" style="border-color: ${cat.color};">
                    <div class="flex justify-between items-start mb-2">
                        <div class="flex flex-col">
                            <div class="flex items-center gap-2 mb-1.5">
                                <div class="px-2 py-0.5 rounded-md bg-surface-container-low flex items-center justify-center">
                                    <span class="text-[9px] font-black text-primary">${b.start_time}</span>
                                </div>
                                <span class="text-[9px] font-black uppercase tracking-wider text-outline-variant">${cat.label}</span>
                                ${isActive ? '<div class="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>' : ''}
                            </div>
                            <h3 class="text-sm font-extrabold text-on-surface tracking-tight">${b.title}</h3>
                        </div>
                        <div class="flex gap-2">
                            <button onclick="showEditBlockModal(${b.id})" class="w-9 h-9 rounded-xl bg-surface-container-low flex items-center justify-center text-outline-variant active:scale-95 transition-all">
                                <span class="material-symbols-outlined text-base">edit</span>
                            </button>
                            <button onclick="deleteBlock(${b.id})" class="w-9 h-9 rounded-xl bg-error/5 flex items-center justify-center text-error active:scale-95 transition-all">
                                <span class="material-symbols-outlined text-base">close</span>
                            </button>
                        </div>
                    </div>
                    
                    ${b.description ? `
                        <div class="text-[11px] leading-relaxed text-on-surface-variant/80 font-medium my-3">
                            ${b.description.replace(/\|poms:\d+/, '').trim().split('-').filter(l => l.trim()).map(l => `• ${l.trim()}`).join('<br>')}
                        </div>
                    ` : ''}

                    <div class="flex items-center justify-between pt-2 border-t border-surface-container-low">
                        <div class="flex -space-x-1.5">
                            ${(()=>{
                                const poms = Math.max(1, Math.round(dur / 30));
                                return Array(Math.min(poms, 5)).fill(0).map(() => `
                                    <div class="w-3 h-3 rounded-full bg-primary/5 border-2 border-white shadow-sm"></div>
                                `).join('');
                            })()}
                        </div>
                        <span class="text-[8px] font-black text-outline uppercase tracking-widest">${dur} MIN DURATION</span>
                    </div>
                </div>
            `;
        } else {
            block.style.cssText = 'display:flex;gap:1.35rem;align-items:flex-start;position:relative;margin-bottom:2rem;';
            const cleanDesc = (b.description || '').replace(/\|poms:\d+/, '').trim();
            const descLines = cleanDesc ? cleanDesc.split('-').filter(l => l.trim()) : [];
            block.innerHTML = `
                <div style="position:absolute;left:-5rem;top:0;text-align:right;width:3.7rem;">
                    <div style="font-size:0.78rem;font-weight:800;color:${isActive?'#333':'var(--outline)'};">${b.start_time}</div>
                    <div style="font-size:0.65rem;color:var(--outline-variant);">${dur}m</div>
                </div>
                <div class="${isActive?'card-elevated':'card-recessed'}" style="flex:1;border-left:4px solid ${cat.color};position:relative;padding:1.35rem 1.5rem;${isActive?`box-shadow:0 16px 40px rgba(0,0,0,0.09); background:linear-gradient(135deg, rgba(255,255,255,1), ${cat.color}14); border:1px solid ${cat.color}55; transform:translateY(-2px);`:''}">
                    <div class="flex-between mb-2">
                        <div style="display:flex;align-items:center;gap:0.75rem;">
                            <span class="material-symbols-outlined" style="font-size:1.05rem;color:${cat.color};">${cat.icon}</span>
                            <h3 style="font-size:1rem;font-weight:800;color:#333;">${b.title}</h3>
                            ${isActive ? '<span class="pill pill-green pulse-dot" style="font-size:0.55rem;padding:0.1rem 0.4rem;">NOW</span>' : ''}
                        </div>
                        <div style="display:flex;gap:0.5rem;">
                            <button onclick="showEditBlockModal(${b.id})" style="background:none;border:none;cursor:pointer;color:var(--outline-variant);">
                                <span class="material-symbols-outlined" style="font-size:18px;">edit</span>
                            </button>
                            <button onclick="deleteBlock(${b.id})" style="background:none;border:none;cursor:pointer;color:var(--outline-variant);">
                                <span class="material-symbols-outlined" style="font-size:18px;">close</span>
                            </button>
                        </div>
                    </div>
                    
                    ${descLines.length > 0 ? `
                        <ul style="margin:0.65rem 0;padding-left:1.2rem;color:var(--on-surface-variant);font-size:0.76rem;line-height:1.55;">
                            ${descLines.map(l => `<li>${l.trim()}</li>`).join('')}
                        </ul>
                    ` : ''}

                    <div class="flex-between mt-3" style="font-size:0.58rem;color:var(--outline);text-transform:uppercase;letter-spacing:0.05em;font-weight:700;">
                        <span>${cat.label} Protocol</span>
                        <span style="display:flex;align-items:center;gap:0.3rem;">
                            ${(()=>{
                                if (!['ai','dt','night','bonus','learning'].includes(b.category)) return 'No Pomodoro';
                                const descRaw = b.description || '';
                                const pomMatch = descRaw.match(/\|poms:(\d+)/);
                                const manualPoms = pomMatch ? parseInt(pomMatch[1]) : parseInt(descRaw);
                                const poms = (!isNaN(manualPoms) && manualPoms >= 0) ? manualPoms : Math.max(1, Math.round(dur / 30));
                                const dots = Array(Math.min(poms,8)).fill(0).map((_,i)=>{
                                    const done = (pomSessionsToday.filter(s=>s.mode==='work').length) > i;
                                    return `<span style="width:7px;height:7px;border-radius:50%;display:inline-block;background:${done?'#ff4d6d':'var(--outline-variant)'};"></span>`;
                                }).join('');
                                return `${dots} <span style="margin-left:0.25rem;">${poms} Pom${poms!==1?'s':''}</span>
                                    <button onclick="setManualPoms(${b.id}, ${poms})" title="Set Pomodoro Target" style="margin-left:0.5rem;background:none;border:none;color:var(--outline);cursor:pointer;font-size:0.8rem;transition:0.2s;" onmouseover="this.style.color='var(--primary)'" onmouseout="this.style.color='var(--outline)'">✎</button>`;
                            })()}
                        </span>
                    </div>
                </div>
            `;
        }
        wrap.appendChild(block);
    });
}

async function handleSaveBlock(e) {
    e.preventDefault();
    const poms = document.getElementById('sb-poms').value;
    const desc = document.getElementById('sb-desc').value;
    const finalDesc = poms ? `${desc} |poms:${poms}` : desc;
    
    await fetch('/api/schedule', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            title: document.getElementById('sb-title').value,
            description: finalDesc,
            start_time: document.getElementById('sb-start').value,
            end_time: document.getElementById('sb-end').value,
            category: document.getElementById('sb-cat').value,
            color: SCHED_CAT[document.getElementById('sb-cat').value].color,
            icon: SCHED_CAT[document.getElementById('sb-cat').value].icon,
            day_type: document.getElementById('sb-day-type').value
        })
    });
    showToast('Operation deployed');
    e.target.reset();
    loadSchedule();
}

async function deleteBlock(id) {
    if (!confirm('Abort this operation?')) return;
    await fetch(`/api/schedule/${id}`, { method: 'DELETE' });
    loadSchedule();
}

window.showEditBlockModal = function(id) {
    const block = blocksCache.find(b => b.id === id);
    if (!block) return;
    const container = document.getElementById('modal-container');
    const pomsMatch = (block.description || '').match(/\|poms:(\d+)/);
    const poms = pomsMatch ? pomsMatch[1] : '';
    const desc = (block.description || '').replace(/\|poms:\d+/, '').trim();
    
    container.innerHTML = `
        <div class="modal-overlay" onclick="if(event.target===this) closeModal()">
            <div class="modal-card anim-pop" style="max-width:500px;">
                <h3 class="mb-6">Optimize Operation Block</h3>
                <form onsubmit="handleUpdateBlock(event, ${block.id})">
                    <div class="mb-4">
                        <label class="label-sm">Block Title *</label>
                        <input type="text" id="edit-sb-title" class="input-well w-full" value="${block.title}" required>
                    </div>
                    <div class="mb-4">
                        <label class="label-sm">Sub-tasks (Dash-separated)</label>
                        <textarea id="edit-sb-desc" class="input-well w-full" style="height:80px;">${desc}</textarea>
                    </div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;" class="mb-4">
                        <div>
                            <label class="label-sm">Start Time</label>
                            <input type="time" id="edit-sb-start" class="input-well w-full" value="${block.start_time}" required>
                        </div>
                        <div>
                            <label class="label-sm">End Time</label>
                            <input type="time" id="edit-sb-end" class="input-well w-full" value="${block.end_time}" required>
                        </div>
                    </div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;" class="mb-4">
                        <div>
                            <label class="label-sm">Category</label>
                            <select id="edit-sb-cat" class="input-well w-full">
                                ${Object.entries(SCHED_CAT).map(([k,v]) => `<option value="${k}" ${block.category===k?'selected':''}>${v.label}</option>`).join('')}
                            </select>
                        </div>
                        <div>
                            <label class="label-sm">Day Type</label>
                            <select id="edit-sb-day-type" class="input-well w-full">
                                ${scheduleModes.map(m => `<option value="${m.slug}" ${block.day_type===m.slug?'selected':''}>${m.label}</option>`).join('')}
                                <option value="daily" ${block.day_type==='daily'?'selected':''}>📅 Every Day</option>
                            </select>
                        </div>
                    </div>
                    <div class="mb-6">
                        <label class="label-sm">Target Pomodoros</label>
                        <input type="number" id="edit-sb-poms" class="input-well w-full" value="${poms}" placeholder="Auto">
                    </div>
                    <div style="display:flex;gap:1rem;">
                        <button type="button" class="btn-ghost flex-1" onclick="closeModal()">Cancel</button>
                        <button type="submit" class="btn-primary flex-1">Apply Changes</button>
                    </div>
                </form>
            </div>
        </div>
    `;
}

async function handleUpdateBlock(e, id) {
    e.preventDefault();
    const poms = document.getElementById('edit-sb-poms').value;
    const desc = document.getElementById('edit-sb-desc').value;
    const finalDesc = poms ? `${desc} |poms:${poms}` : desc;
    
    const body = {
        title: document.getElementById('edit-sb-title').value,
        description: finalDesc,
        start_time: document.getElementById('edit-sb-start').value,
        end_time: document.getElementById('edit-sb-end').value,
        category: document.getElementById('edit-sb-cat').value,
        color: SCHED_CAT[document.getElementById('edit-sb-cat').value].color,
        icon: SCHED_CAT[document.getElementById('edit-sb-cat').value].icon,
        day_type: document.getElementById('edit-sb-day-type').value
    };

    await fetch(`/api/schedule/${id}`, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(body)
    });
    
    showToast('Operation optimized');
    closeModal();
    loadSchedule();
}


// ═══════════════════════════════════════════════════════
// POMODORO — Temporal Engine
// ═══════════════════════════════════════════════════════
let pomMode = 'work'; // work, short, long
let pomAutoCycle = true;
let pomTaskInput = '';
let pomSessionsToday = [];

async function loadPomodoro() {
    if (pomTimer) clearInterval(pomTimer);
    await fetchPomSessions();
    
    const completedWork = pomSessionsToday.filter(s => s.mode === 'work').length;
    const modeColor = pomMode === 'work' ? '#1a1a1a' : (pomMode === 'short' ? '#16a34a' : '#3182ce');
    const modeLabel = pomMode === 'work' ? '🔥 Focus Session' : (pomMode === 'short' ? '☕ Short Break' : '🌿 Long Break');
    const modeMins = pomMode === 'work' ? 25 : (pomMode === 'short' ? 5 : 15);
    const pomodoroQuickLinks = renderQuickAccessLinks([
        { view: 'tasks', icon: 'checklist', label: 'Tasks' },
        { view: 'schedule', icon: 'calendar_today', label: 'Schedule' },
        { view: 'team-grid', icon: 'table_chart', label: 'Team Radar' }
    ]);

    let taskProgressHtml = '';
    if (pomTaskId) {
        try {
            const isTask = typeof pomTaskId === 'string' && pomTaskId.startsWith('task_');
            if (isTask) {
                const idOnly = pomTaskId.replace('task_', '');
                const r = await fetch(`/api/tasks/${idOnly}`);
                if (r.ok) {
                    const t = await r.json();
                    taskProgressHtml = `<div style="font-size:0.75rem;margin-top:0.35rem;">Progress: <strong>${t.poms_done || 0}/${t.poms_target || 1}</strong> Sessions</div>`;
                }
            }
        } catch(e) {
            console.error("Failed to fetch task progress", e);
        }
    }

    const c = document.getElementById('view-pomodoro');
    if (isMobile()) {
        c.innerHTML = `
        <div class="anim-slide px-2 pb-24">
            <div class="mb-10 text-center">
                <span class="label-overline">Temporal Engine</span>
                <h1 class="text-3xl font-bold tracking-tight">Focus Laboratory</h1>
            </div>
            ${pomodoroQuickLinks}

            <!-- Neumorphic Dial -->
            <section class="flex justify-center mb-12">
                <div class="relative w-72 h-72 flex items-center justify-center neumorphic-raised bg-surface-container-lowest rounded-full">
                    <!-- Timer Progress Ring -->
                    <svg class="w-64 h-64">
                        <circle class="text-surface-container-low" cx="128" cy="128" fill="transparent" r="116" stroke="currentColor" stroke-width="6"></circle>
                        <circle cx="128" cy="128" fill="transparent" r="116" stroke="${modeColor}" stroke-linecap="round" stroke-width="10"
                                id="mobile-pom-ring"
                                style="transform: rotate(-90deg); transform-origin: 50% 50%; transition: stroke-dashoffset 1s linear;"></circle>
                    </svg>
                    
                    <!-- Time Display -->
                    <div class="absolute inset-0 flex flex-col items-center justify-center text-center">
                        <span class="text-[10px] font-bold uppercase tracking-[0.2em] text-outline mb-1">${modeLabel}</span>
                        <div id="pom-time" class="text-6xl font-extrabold tracking-tighter text-on-surface tabular-nums" style="color: ${modeColor}">${String(modeMins).padStart(2,'0')}:00</div>
                        <div class="mt-2 flex items-center gap-1.5">
                            <span class="w-1.5 h-1.5 rounded-full ${pomIsRunning ? 'bg-red-500 animate-pulse' : 'bg-outline-variant'}"></span>
                            <span class="text-[10px] font-bold text-outline-variant uppercase">${pomIsRunning ? 'Live' : 'Idle'}</span>
                        </div>
                    </div>
                </div>
            </section>

            <!-- Tactile Controls -->
            <section class="flex items-center justify-center gap-8 mb-12">
                <button onclick="resetPom()" class="w-14 h-14 rounded-full bg-surface-container-low neumorphic-raised flex items-center justify-center text-outline-variant active:scale-95 transition-all">
                    <span class="material-symbols-outlined">restart_alt</span>
                </button>
                <button id="pom-play-btn" onclick="togglePom()" class="w-20 h-20 rounded-full flex items-center justify-center text-white shadow-xl active:scale-95 transition-all" style="background: ${modeColor}">
                    <span class="material-symbols-outlined text-4xl">${pomIsRunning ? 'pause' : 'play_arrow'}</span>
                </button>
                <button onclick="showTaskPicker()" class="w-14 h-14 rounded-full bg-surface-container-low neumorphic-raised flex items-center justify-center text-outline-variant active:scale-95 transition-all">
                    <span class="material-symbols-outlined">link</span>
                </button>
            </section>

            <!-- Linked Task -->
            <div class="neumorphic-inset bg-surface-container-low p-4 rounded-2xl flex items-center gap-4 mb-6">
                <div class="w-10 h-10 rounded-xl bg-white/50 flex items-center justify-center text-primary">
                    <span class="material-symbols-outlined">target</span>
                </div>
                <div class="flex-1 overflow-hidden">
                    <span class="text-[9px] font-bold text-outline uppercase tracking-widest block mb-0.5">Active Target</span>
                    <div id="pom-linked-task" class="text-xs font-bold text-on-surface truncate">
                        ${pomTaskInput || 'Deploy a target objective...'}
                    </div>
                    ${taskProgressHtml}
                </div>
            </div>

            <!-- Stats Grid -->
            <div class="grid grid-cols-2 gap-4 mb-8">
                <div class="neumorphic-inset bg-surface-container-low p-4 rounded-2xl">
                    <span class="text-[9px] font-bold text-outline uppercase tracking-widest block mb-1">Completed</span>
                    <div class="text-2xl font-bold text-on-surface">${completedWork}</div>
                </div>
                <div class="neumorphic-inset bg-surface-container-low p-4 rounded-2xl">
                    <span class="text-[9px] font-bold text-outline uppercase tracking-widest block mb-1">Total Focus</span>
                    <div class="text-2xl font-bold text-on-surface">${completedWork * 25}m</div>
                </div>
            </div>

            <!-- Session Log -->
            <div class="neumorphic-raised bg-surface-container-lowest p-6 rounded-3xl">
                <h4 class="text-xs font-bold uppercase tracking-widest text-outline mb-4">Session Log</h4>
                <div id="pom-log-list" class="space-y-3"></div>
            </div>
        </div>`;
        updatePomDisplay();
        renderPomLog();
        return;
    }

    c.innerHTML = `
    <div class="anim-slide" style="max-width:1000px;margin:0 auto;">
        <div class="view-header">
            <div class="view-header-content">
                <span class="label-overline">Temporal Engine</span>
                <h1 style="font-size:3rem;margin:0;">Focus Mode</h1>
            </div>
            <div class="view-header-actions">
                <button class="btn-ghost" onclick="showSectionGuide()">
                    <span class="material-symbols-outlined" style="font-size:1.2rem;">help_outline</span> GUIDE
                </button>
            </div>
        </div>
        ${pomodoroQuickLinks}

        <!-- Mode Selector -->
        <div style="display:flex;justify-content:center;gap:0.75rem;margin-bottom:2.5rem;background:var(--surface-container);padding:0.4rem;border-radius:var(--radius-md);width:fit-content;margin-left:auto;margin-right:auto;box-shadow:var(--shadow-pressed);">
            <button class="pom-mode-btn ${pomMode==='work'?'active':''}" onclick="setPomMode('work', 25)" style="padding:0.6rem 1.4rem;font-size:0.8rem;">🔥 Work (25m)</button>
            <button class="pom-mode-btn ${pomMode==='short'?'active':''}" onclick="setPomMode('short', 5)" style="padding:0.6rem 1.4rem;font-size:0.8rem;">☕ Break (5m)</button>
            <button class="pom-mode-btn ${pomMode==='long'?'active':''}" onclick="setPomMode('long', 15)" style="padding:0.6rem 1.4rem;font-size:0.8rem;">🌿 Long (15m)</button>
        </div>

        <div style="display:grid;grid-template-columns:1fr 340px;gap:2rem;align-items:start;">
            <!-- Main Timer Card -->
            <div class="card-elevated" style="padding:2.5rem;display:flex;flex-direction:column;align-items:center;gap:1.5rem;">
                
                <!-- Task Input -->
                <div style="width:100%;">
                    <label style="font-size:0.65rem;font-weight:800;text-transform:uppercase;letter-spacing:0.1em;color:var(--outline);display:block;margin-bottom:0.5rem;">Focus Objective</label>
                    <div style="display:flex;gap:0.75rem;">
                        <div class="input-well" style="flex:1;">
                            <span class="material-symbols-outlined" style="color:${modeColor};">task_alt</span>
                            <input class="input-recessed" type="text" id="pom-task-field" placeholder="Enter objective or link →" value="${pomTaskInput}" oninput="pomTaskInput=this.value" style="font-weight:600;">
                        </div>
                        <button onclick="showTaskPicker()" class="btn-ghost" style="padding:0;width:48px;height:48px;border-radius:var(--radius-sm);display:flex;align-items:center;justify-content:center;box-shadow:var(--shadow-elevated);" title="Link from Schedule/Tasks">
                            <span class="material-symbols-outlined" style="color:var(--primary);">link</span>
                        </button>
                    </div>
                </div>

                <!-- Big Timer Ring -->
                <div style="position:relative;width:280px;height:280px;">
                    <svg style="width:100%;height:100%;transform:rotate(-90deg);" viewBox="0 0 280 280">
                        <circle cx="140" cy="140" r="120" fill="none" stroke="var(--surface-container-high)" stroke-width="12"></circle>
                        <circle id="pom-ring" cx="140" cy="140" r="120" fill="none" stroke="${modeColor}" stroke-width="12" 
                            stroke-dasharray="754" stroke-dashoffset="754" stroke-linecap="round"
                            style="transition:stroke-dashoffset 1s linear;filter:drop-shadow(0 0 6px ${modeColor}44);"></circle>
                    </svg>
                    <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0.25rem;">
                        <div style="font-size:0.6rem;font-weight:800;text-transform:uppercase;letter-spacing:0.15em;color:var(--outline);">${modeLabel}</div>
                        <div id="pom-time" style="font-size:4.5rem;font-weight:800;color:${modeColor};line-height:1;font-variant-numeric:tabular-nums;">${String(modeMins).padStart(2,'0')}:00</div>
                        <div id="pom-status-label" style="font-size:0.72rem;color:var(--outline);font-weight:600;">${pomIsRunning ? '● Running' : '○ Ready'}</div>
                    </div>
                </div>

                <!-- Control Buttons -->
                <div style="display:flex;align-items:center;gap:1.5rem;">
                    <button onclick="resetPom()" title="Reset" style="width:48px;height:48px;border-radius:50%;background:var(--surface-container);box-shadow:var(--shadow-elevated);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;color:var(--outline);transition:all 0.2s;" onmouseover="this.style.color='var(--primary)'" onmouseout="this.style.color='var(--outline)'">
                        <span class="material-symbols-outlined" style="font-size:1.4rem;">restart_alt</span>
                    </button>
                    <button id="pom-play-btn" onclick="togglePom()" style="width:72px;height:72px;border-radius:50%;background:${modeColor};color:white;box-shadow:0 8px 24px ${modeColor}55;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all 0.2s;" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
                        <span class="material-symbols-outlined" style="font-size:2.2rem;">${pomIsRunning?'pause':'play_arrow'}</span>
                    </button>
                    <button onclick="showTaskPicker()" title="Link Task" style="width:48px;height:48px;border-radius:50%;background:var(--surface-container);box-shadow:var(--shadow-elevated);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;color:var(--outline);transition:all 0.2s;" onmouseover="this.style.color='var(--primary)'" onmouseout="this.style.color='var(--outline)'">
                        <span class="material-symbols-outlined" style="font-size:1.4rem;">link</span>
                    </button>
                </div>

                <!-- Session Dots -->
                <div>
                    <div style="font-size:0.6rem;font-weight:800;text-transform:uppercase;letter-spacing:0.1em;color:var(--outline);text-align:center;margin-bottom:0.75rem;">Today's Sessions (${completedWork}/9)</div>
                    <div class="pom-dots" id="pom-dot-grid"></div>
                </div>

                <!-- Linked Task Display -->
                <div id="pom-linked-task" style="width:100%;padding:1rem 1.25rem;background:var(--surface-container-low);border-radius:var(--radius-md);border:1px dashed var(--outline-variant);color:var(--outline);font-size:0.82rem;text-align:center;">
                    ${pomTaskInput ? `<div style="color:var(--primary);font-weight:800;">${pomTaskInput}</div>${taskProgressHtml}` : 'No task linked — use the link button to connect a target'}
                </div>
            </div>

            <!-- Right Panel -->
            <div style="display:flex;flex-direction:column;gap:1.5rem;">
                <!-- Quick Stats -->
                <div class="card-recessed" style="padding:1.5rem;">
                    <div class="label-sm mb-4">Today's Stats</div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                        <div style="background:var(--surface-container-lowest);border-radius:var(--radius-sm);padding:1rem;box-shadow:var(--shadow-elevated);text-align:center;">
                            <div style="font-size:1.75rem;font-weight:800;color:#333;">${completedWork}</div>
                            <div style="font-size:0.6rem;color:var(--outline);font-weight:700;text-transform:uppercase;letter-spacing:0.08em;">Work Done</div>
                        </div>
                        <div style="background:var(--surface-container-lowest);border-radius:var(--radius-sm);padding:1rem;box-shadow:var(--shadow-elevated);text-align:center;">
                            <div style="font-size:1.75rem;font-weight:800;color:#333;">${completedWork * 25}m</div>
                            <div style="font-size:0.6rem;color:var(--outline);font-weight:700;text-transform:uppercase;letter-spacing:0.08em;">Focus Time</div>
                        </div>
                    </div>
                </div>

                <!-- Session Log -->
                <div class="card-recessed" style="padding:1.5rem;flex:1;min-height:300px;display:flex;flex-direction:column;">
                    <div class="label-sm mb-4">Session Log</div>
                    <div id="pom-log-list" style="flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:0.5rem;">
                    </div>
                </div>
            </div>
        </div>
    </div>`;
    updatePomDisplay();
    renderPomDots();
    renderPomLog();
}

let activeTasksCache = [];
async function showTaskPicker() {
    try {
        const r = await fetch(`/api/tasks?show=active&day_type=${currentScheduleMode || 'all'}`);
        activeTasksCache = await r.json();
    } catch(e) {}
    
    if (!blocksCache.length) await fetchBlocks();
    
    const now = new Date();
    const currentTimeStr = now.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit' });

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    
    const getPickerHTML = (filter = '') => {
        const query = filter.toLowerCase();
        const todayBlocks = blocksCache.filter(b => 
            (b.day_type === currentScheduleMode || b.day_type === 'daily') &&
            ['ai','dt','night','bonus','college','personal','learning','shop','free'].includes(b.category) &&
            (query === '' || b.title.toLowerCase().includes(query))
        );
        
        const tasks = activeTasksCache.filter(t => 
            query === '' || t.title.toLowerCase().includes(query) || (t.project || '').toLowerCase().includes(query)
        );

        return `
            <!-- Schedule Blocks -->

                <div style="display:flex;flex-direction:column;gap:0.75rem;">
                    <div style="font-size:0.65rem;font-weight:800;color:var(--outline);text-transform:uppercase;letter-spacing:0.1em;display:flex;align-items:center;gap:0.5rem;">
                        <span class="material-symbols-outlined" style="font-size:0.9rem;">calendar_today</span> Schedule Blocks
                    </div>
                    <div style="max-height:400px;overflow-y:auto;display:flex;flex-direction:column;gap:0.6rem;padding-right:0.5rem;">
                        ${todayBlocks.map(b => {
                            const isCurrent = currentTimeStr >= b.start_time && currentTimeStr <= b.end_time;
                            return `
                            <div class="card-recessed" style="cursor:pointer;padding:0.75rem;border:1px solid ${isCurrent ? 'var(--primary)' : 'var(--outline-variant)'};background:${isCurrent ? 'var(--surface-container-low)' : ''};" onclick="linkTaskToPom(${b.id}, '[Block] ${b.title.replace(/'/g, "\\'")}', 'block')">
                                <div style="display:flex;justify-content:space-between;align-items:start;">
                                    <div style="font-weight:700;font-size:0.82rem;color:#333;">${b.title}</div>
                                    ${isCurrent ? '<span class="pill" style="font-size:0.5rem;background:var(--primary);color:white;padding:0.1rem 0.4rem;">Live</span>' : ''}
                                </div>
                                <div style="font-size:0.65rem;color:var(--outline);margin-top:0.25rem;">${b.start_time} - ${b.end_time}</div>
                            </div>`;
                        }).join('')}
                        ${todayBlocks.length === 0 ? '<p style="text-align:center;padding:2rem;color:var(--outline);font-size:0.75rem;">No matching blocks.</p>' : ''}
                    </div>
                </div>

                <!-- Priority Tasks -->
                <div style="display:flex;flex-direction:column;gap:0.75rem;">
                    <div style="font-size:0.65rem;font-weight:800;color:var(--outline);text-transform:uppercase;letter-spacing:0.1em;display:flex;align-items:center;gap:0.5rem;">
                        <span class="material-symbols-outlined" style="font-size:0.9rem;">target</span> Priority Objectives
                    </div>
                    <div style="max-height:400px;overflow-y:auto;display:flex;flex-direction:column;gap:0.6rem;padding-right:0.5rem;">
                        ${tasks.map(t => `
                            <div class="task-card p${t.priority}" style="cursor:pointer;padding:0.75rem;" onclick="linkTaskToPom(${t.id}, '${t.title.replace(/'/g, "\\'")}', 'task')">
                                <div style="font-weight:700;font-size:0.82rem;color:#333;">${escapeHTML(t.title)}</div>
                                <div style="font-size:0.65rem;color:var(--outline);margin-top:0.25rem;">P${t.priority} · ${escapeHTML(t.project)}</div>
                            </div>
                        `).join('')}
                        ${tasks.length === 0 ? '<p style="text-align:center;padding:2rem;color:var(--outline);font-size:0.75rem;">No matching tasks found.</p>' : ''}
                    </div>
                </div>
        `;
    };


    overlay.innerHTML = `
        <div class="modal-card anim-pop w-[95%] max-w-[850px] p-6 md:p-12 overflow-y-auto max-h-[90vh]">
            <div class="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
                <div>
                    <h3 class="text-xl md:text-2xl font-bold mb-1">Link Session Target</h3>
                    <p class="text-xs md:text-sm text-outline">Select a block or objective to focus on.</p>
                </div>
                <button class="btn-icon self-end md:self-auto" onclick="this.closest('.modal-overlay').remove()">
                    <span class="material-symbols-outlined">close</span>
                </button>
            </div>

            <div class="search-bar w-full bg-surface-container p-3 md:p-4 rounded-xl border border-outline-variant flex items-center gap-3 mb-8">
                <span class="material-symbols-outlined text-outline">search</span>
                <input type="text" id="picker-search-input" placeholder="Search mission..." class="bg-transparent border-none w-full font-semibold text-sm focus:ring-0">
            </div>

            <div id="picker-results-container" class="grid grid-cols-1 md:grid-cols-2 gap-8">
                ${getPickerHTML()}
            </div>
            
            <div class="mt-10 pt-6 border-t border-surface-container-high flex justify-center">
                <button class="btn-ghost px-10 py-3 text-xs font-bold uppercase tracking-widest" onclick="this.closest('.modal-overlay').remove()">Close Picker</button>
            </div>
        </div>

    `;
    
    document.body.appendChild(overlay);
    
    const searchInput = overlay.querySelector('#picker-search-input');
    const resultsContainer = overlay.querySelector('#picker-results-container');
    
    searchInput.focus();
    searchInput.oninput = (e) => {
        resultsContainer.innerHTML = getPickerHTML(e.target.value);
    };
}

async function linkTaskToPom(id, title, type = 'task') {
    pomTaskId = `${type}_${id}`;
    pomTaskInput = title;
    
    let progressStr = '';
    try {
        const endpoint = type === 'task' ? `/api/tasks/${id}` : `/api/schedule/${id}`;
        const r = await fetch(endpoint);
        if (r.ok) {
            const t = await r.json();
            if (type === 'task') {
                progressStr = `<div style="font-size:0.7rem;color:var(--outline);margin-top:0.25rem;">Progress: ${t.poms_done || 0}/${t.poms_target || 1} Sessions</div>`;
            }
        }
    } catch(e) {}

    const linkedEl = document.getElementById('pom-linked-task');
    const taskField = document.getElementById('pom-task-field');
    if (linkedEl) linkedEl.innerHTML = `<div style="color:var(--primary);font-weight:800;">${title}</div>${progressStr}`;
    if (taskField) taskField.value = title;
    savePomodoroState();
    document.querySelector('.modal-overlay')?.remove();
}


function setPomMode(mode, mins) {
    pomMode = mode;
    const seconds = mins ? mins * 60 : getDefaultPomSeconds(mode);
    activePomDuration = seconds;
    pomTimeLeft = seconds;
    pomIsRunning = false;
    pomEndsAt = null;
    if (pomTimer) clearInterval(pomTimer);
    savePomodoroState();
    loadPomodoro();
}

async function fetchPomSessions() {
    try {
        const r = await fetch('/api/pomodoro/sessions');
        pomSessionsToday = await r.json();
    } catch(e) {}
}

function renderPomDots() {
    const grid = document.getElementById('pom-dot-grid');
    if (!grid) return;
    grid.innerHTML = '';
    const completedWork = pomSessionsToday.filter(s => s.mode === 'work').length;
    for (let i = 0; i < 9; i++) {
        const d = document.createElement('div');
        d.className = `pom-dot ${i < completedWork ? 'done' : ''}`;
        grid.appendChild(d);
    }
}

function renderPomLog() {
    const list = document.getElementById('pom-log-list');
    if (!list) return;
    if (pomSessionsToday.length === 0) {
        list.innerHTML = '<div style="color:var(--outline);font-size:0.75rem;padding:1rem;text-align:center;">No sessions logged today.</div>';
        return;
    }
    list.innerHTML = pomSessionsToday.map(s => `
        <div style="background:var(--surface);padding:0.75rem;border-radius:var(--radius-sm);margin-bottom:0.75rem;box-shadow:var(--shadow-elevated);display:flex;justify-content:space-between;align-items:center;">
            <div>
                <div style="font-size:0.8rem;font-weight:700;color:#333;">${s.task_name}</div>
                <div style="font-size:0.65rem;color:var(--outline);">${new Date(s.completed_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})} · ${s.duration}m</div>
            </div>
            <div class="pill ${s.mode==='work'?'':'pill-green'}" style="font-size:0.6rem;">${s.mode}</div>
        </div>
    `).join('');
}

function togglePom() {
    const btn = document.getElementById('pom-play-btn');
    if (!btn) return;
    if (pomIsRunning) {
        clearInterval(pomTimer);
        pomEndsAt = null;
        btn.querySelector('.material-symbols-outlined').textContent = 'play_arrow';
    } else {
        activePomDuration = getDefaultPomSeconds(pomMode);
        pomEndsAt = Date.now() + (pomTimeLeft * 1000);
        pomTimer = setInterval(() => {
            pomTimeLeft = Math.max(0, Math.round((pomEndsAt - Date.now()) / 1000));
            updatePomDisplay();
            savePomodoroState();
            if (pomTimeLeft <= 0) { clearInterval(pomTimer); completePom(); }
        }, 1000);
        btn.querySelector('.material-symbols-outlined').textContent = 'pause';
    }
    pomIsRunning = !pomIsRunning;
    savePomodoroState();
}

function updatePomDisplay() {
    if (pomIsRunning && pomEndsAt) {
        pomTimeLeft = Math.max(0, Math.round((pomEndsAt - Date.now()) / 1000));
    }
    const m = Math.floor(pomTimeLeft / 60), s = pomTimeLeft % 60;
    const el = document.getElementById('pom-time');
    if (el) el.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;

    const statusEl = document.getElementById('pom-status-label');
    if (statusEl) statusEl.textContent = pomIsRunning ? '● Running' : (pomTimeLeft === 0 ? '✓ Done' : '○ Ready');
    
    // Ring animation — circumference of r=120 is ~754
    const ring = document.getElementById('pom-ring');
    if (ring) {
        const total = activePomDuration || getDefaultPomSeconds(pomMode);
        const filled = ((total - pomTimeLeft) / total) * 754;
        ring.style.strokeDashoffset = 754 - filled;
    }
}

async function completePom() {
    pomIsRunning = false;
    pomEndsAt = null;
    pomTimeLeft = 0;
    clearPomodoroState();
    // Triple-beep alert so you know time is up
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const playBeep = (freq, startTime, duration) => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.frequency.value = freq;
            osc.type = 'sine';
            gain.gain.setValueAtTime(0.4, startTime);
            gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
            osc.start(startTime);
            osc.stop(startTime + duration);
        };
        const now = audioCtx.currentTime;
        if (pomMode === 'work') {
            // 3 ascending beeps for work completion — distinct and satisfying
            playBeep(523, now, 0.18);
            playBeep(659, now + 0.22, 0.18);
            playBeep(784, now + 0.44, 0.35);
        } else {
            // 2 lower beeps for break end
            playBeep(440, now, 0.2);
            playBeep(440, now + 0.3, 0.3);
        }
    } catch(e) {}

    playAlertChime(
        pomMode === 'work' ? [523, 659, 784, 880, 988] : [440, 440, 523],
        0.3
    );
    triggerDeviceVibration(pomMode === 'work' ? [350, 180, 350, 180, 500, 180, 650] : [250, 150, 250, 150, 380]);
    await sendBrowserNotification(
        pomMode === 'work' ? 'Focus session complete' : 'Break complete',
        {
            body: pomTaskInput
                ? `${pomTaskInput} finished. Ready for the next move.`
                : (pomMode === 'work' ? 'Your pomodoro timer finished.' : 'Time to get back into focus mode.'),
            tag: `pomodoro-${pomMode}`,
            vibrate: pomMode === 'work' ? [350, 180, 350, 180, 500, 180, 650] : [250, 150, 250, 150, 380]
        }
    );
    showToast(pomMode === 'work' ? 'Sprint Complete!' : 'Break Over!');
    // Log session to server
    try {
        let taskId = null;
        let isBlock = false;
        
        if (pomTaskId) {
            if (typeof pomTaskId === 'string' && pomTaskId.includes('_')) {
                const parts = pomTaskId.split('_');
                isBlock = parts[0] === 'block';
                taskId = parseInt(parts[1]);
            } else {
                // Fallback for old state
                taskId = parseInt(pomTaskId);
            }
        }

        const res = await fetch('/api/pomodoro/sessions', {
            method: 'POST', 
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ 
                mode: pomMode, 
                duration: pomMode === 'work' ? 25 : (pomMode === 'short' ? 5 : 15),
                task_name: pomTaskInput || (pomMode === 'work' ? 'Deep Work Session' : 'Executive Break'),
                task_id: taskId,
                is_block: isBlock
            })
        });
        
        if (!res.ok) {
            console.error("Failed to log session:", await res.text());
            showToast("Failed to sync session to cloud");
        }
    } catch (err) {
        console.error("Network error logging session:", err);
        showToast("Connection error — session saved locally only");
    }

    // Task completion check & cleanup
    if (pomMode === 'work' && pomTaskId && !pomTaskId.toString().startsWith('block_')) {
        try {
            const idOnly = pomTaskId.toString().replace('task_', '');
            const taskRes = await fetch(`/api/tasks/${idOnly}`);
            if (taskRes.ok) {
                const task = await taskRes.json();
                if (task.completed) {
                    showToast(`Mission Accomplished: ${pomTaskInput}`);
                    pomTaskId = null; 
                    pomTaskInput = '';
                } else {
                    showToast(`Session Logged: ${task.poms_done}/${task.poms_target} Pomodoros`);
                }
            }
        } catch (e) {}
    }
    
    // Refresh local session state
    await fetchPomSessions();

    // Auto-cycle logic
    if (pomAutoCycle) {
        const workCount = pomSessionsToday.filter(s => s.mode === 'work').length;
        if (pomMode === 'work') {
            if (workCount % 4 === 0) setPomMode('long', 15);
            else setPomMode('short', 5);
        } else {
            setPomMode('work', 25);
        }
    } else {
        resetPom();
    }
    
    // Global UI refresh
    if (currentPage === 'pomodoro') loadPomodoro();
    if (currentPage === 'dashboard') loadDashboard();
    if (currentPage === 'tasks') loadTasks();
    if (currentPage === 'task-hub') loadTaskHub();
    if (currentPage === 'team-grid') loadTeamGrid();
    if (currentPage === 'tracker') if (typeof loadTracker === 'function') loadTracker();
}

function resetPom() {
    clearInterval(pomTimer);
    activePomDuration = getDefaultPomSeconds(pomMode);
    pomTimeLeft = activePomDuration;
    pomIsRunning = false;
    pomEndsAt = null;
    clearPomodoroState();
    const btn = document.getElementById('pom-play-btn');
    if (btn) btn.querySelector('.material-symbols-outlined').textContent = 'play_arrow';
    updatePomDisplay();
}

// ═══════════════════════════════════════════════════════
// TASKS — Priority Mission Matrix
// ═══════════════════════════════════════════════════════
async function loadTasks() {
    const activeFilterMode = window.taskHubMode || currentScheduleMode || 'any';
    let tasks = [];
    try { 
        const r = await fetch(`/api/tasks?show=active&day_type=${activeFilterMode}`); 
        tasks = await r.json(); 
    } catch(e) {}
    
    const tasksQuickLinks = renderQuickAccessLinks([
        { view: 'team-grid', icon: 'table_chart', label: 'Team Radar' },
        { view: 'schedule', icon: 'calendar_today', label: 'Schedule' },
        { view: 'pomodoro', icon: 'timer', label: 'Pomodoro' }
    ]);

    const c = document.getElementById('view-tasks');
    c.innerHTML = `
    <div class="anim-slide">
<div class="view-header">
            <div class="view-header-content">
                <span class="label-overline">Executive Overview</span>
                <h1 style="font-size:3rem;margin:0;">Priorities</h1>
            </div>
            <div class="view-header-actions" style="display:flex; flex-direction: column; align-items: flex-end; gap: 0.5rem;">
                <div style="display:flex; gap:0.5rem; align-items: center;">
                    <button class="btn-ghost" onclick="showSectionGuide()">
                        <span class="material-symbols-outlined" style="font-size:1.2rem;">help_outline</span> GUIDE
                    </button>
                    ${isMobile() ? `
                        <button class="btn-primary" onclick="showAddTaskModal()">
                            <span class="material-symbols-outlined">add</span> NEW
                        </button>
                    ` : `
                        <div class="input-well" style="width:400px; display:flex; padding:0 0.5rem; gap: 0.5rem;">
                            <span class="material-symbols-outlined">add</span>
                            <input class="input-recessed" style="flex:1;" type="text" id="new-task-input" placeholder="New objective..." onkeydown="if(event.key==='Enter')addNewTask()">
                            <select id="new-task-day" style="background:none;border:none;font-family:var(--font-body);font-size:0.75rem;font-weight:700;color:var(--primary);outline:none;cursor:pointer; max-width: 80px;">
                                <option value="any">Any Day</option>
                                ${scheduleModes.map(m => `<option value="${m.slug}" ${activeFilterMode===m.slug?'selected':''}>${m.label}</option>`).join('')}
                            </select>
                            <select id="new-task-priority" style="background:none;border:none;font-family:var(--font-body);font-size:0.8rem;font-weight:700;color:var(--primary);outline:none;cursor:pointer;">
                                <option value="1">P1</option><option value="2">P2</option><option value="3">P3</option><option value="4" selected>P4</option>
                            </select>
                        </div>
                    `}
                </div>
                <div style="display:flex; gap:0.5rem; background:var(--surface-container); padding:0.35rem; border-radius:var(--radius-md); overflow-x: auto; width: 100%; max-width: 500px; justify-content: flex-end;">
                    <button class="btn-ghost ${activeFilterMode === 'all' ? 'btn-primary' : ''}" style="font-size:0.7rem; padding:0.4rem 0.8rem;" onclick="window.taskHubMode='all'; loadTasks()">All</button>
                    <button class="btn-ghost ${activeFilterMode === 'any' ? 'btn-primary' : ''}" style="font-size:0.7rem; padding:0.4rem 0.8rem;" onclick="window.taskHubMode='any'; loadTasks()">Any Day</button>
                    ${scheduleModes.map(m => `<button class="btn-ghost ${activeFilterMode === m.slug ? 'btn-primary' : ''}" style="font-size:0.7rem; padding:0.4rem 0.8rem;" onclick="window.taskHubMode='${m.slug}'; loadTasks()">${m.label}</button>`).join('')}
                </div>
            </div>
        </div>
        ${tasksQuickLinks}

        <div class="quadrant-grid" id="task-quadrants"></div>
    </div>`;

    const grid = document.getElementById('task-quadrants');
    const quadrants = [
        { p: 1, title: 'Critical / Immediate', cls: 'quadrant-1', dot: 'var(--error)', dotPulse: true },
        { p: 2, title: 'Strategic / Planning', cls: 'quadrant-2', dot: 'var(--primary)', dotPulse: false },
        { p: 3, title: 'Operational / Delegate', cls: 'quadrant-3', dot: 'var(--outline)', dotPulse: false },
        { p: 4, title: 'Backlog / Secondary', cls: 'quadrant-4', dot: 'var(--outline-variant)', dotPulse: false }
    ];

    quadrants.forEach(q => {
        const qTasks = tasks.filter(t => t.priority === q.p && !t.completed);
        const div = document.createElement('div');
        div.className = `quadrant-card ${q.cls}`;
        div.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
                <div style="display:flex;align-items:center;gap:0.75rem;">
                    <span style="width:10px;height:10px;border-radius:50%;background:${q.dot};${q.dotPulse ? 'animation:pulse-red 2s infinite;' : ''}"></span>
                    <h2 style="font-size:1.1rem;font-weight:800;color:var(--primary);text-transform:uppercase;letter-spacing:0.05em;">${q.title}</h2>
                </div>
                <span class="pill" style="font-size:0.65rem;background:var(--surface-container-high);">${qTasks.length}</span>
            </div>
            <div style="display:flex;flex-direction:column;gap:1rem;" id="q-tasks-${q.p}">
                ${qTasks.map(t => `
                    <div class="task-card p${q.p} anim-slide" onclick="showTaskDetailModal(${t.id})" style="cursor:pointer;padding:1.25rem;">
                        <div class="flex-between">
                            <div style="flex:1;">
                                <div style="display:flex;align-items:center;gap:0.5rem;">
                                    <h4 style="font-weight:800;color:#333;line-height:1.3;font-size:1rem;">${escapeHTML(t.title)}</h4>
                                    <span class="pill" style="font-size:0.55rem;padding:0.15rem 0.5rem;background:var(--surface-container-high);">${t.project || 'General'}</span>
                                </div>
                                <div style="font-size:0.7rem;color:var(--outline);margin-top:0.4rem;display:flex;align-items:center;gap:1.25rem;">
                                    <span style="display:flex;align-items:center;gap:0.35rem;"><span class="material-symbols-outlined" style="font-size:14px;">person</span> ${t.assignee || 'Me'}</span>
                                    <span style="display:flex;align-items:center;gap:0.35rem;"><span class="material-symbols-outlined" style="font-size:14px;color:var(--primary);">timer</span> ${t.poms_done || 0}/${t.poms_target || 1}</span>
                                    ${t.priority === 1 ? '<span style="color:var(--error);font-weight:700;">HIGH</span>' : ''}
                                </div>
                            </div>
                            <span class="material-symbols-outlined" style="color:var(--outline-variant);font-size:1.2rem;">chevron_right</span>
                        </div>
                    </div>
                `).join('')}
                ${qTasks.length === 0 ? '<div style="text-align:center;padding:3rem;color:var(--outline);font-size:0.8rem;border:1px dashed var(--outline-variant);border-radius:var(--radius-md);background:var(--surface-container-low);">Quadrant Clear</div>' : ''}
            </div>
        `;
        grid.appendChild(div);
    });
}

// ═══════════════════════════════════════════════════════
// TASK HUB — Universal List View
window.toggleChecklistItem = async function(btn, taskId, index) {
    // Optimistic UI Update
    if (btn) {
        const icon = btn.querySelector('.material-symbols-outlined');
        const text = btn.querySelector('span:last-child');
        if (icon && text) {
            const isDone = icon.textContent.includes('check_circle');
            if (isDone) {
                icon.textContent = 'radio_button_unchecked';
                icon.style.color = 'var(--outline-variant)';
                btn.style.borderColor = 'var(--outline-variant)';
                btn.style.opacity = '1';
                text.style.fontWeight = '600';
                text.style.textDecoration = 'none';
            } else {
                icon.textContent = 'check_circle';
                icon.style.color = 'var(--primary)';
                btn.style.borderColor = 'var(--primary)';
                btn.style.opacity = '0.6';
                text.style.fontWeight = '800';
                text.style.textDecoration = 'line-through';
            }
        }
    }

    try {
        const r = await fetch(`/api/tasks/${taskId}`);
        const task = await r.json();
        let checklist = [];
        try { 
            checklist = task.checklist ? JSON.parse(task.checklist) : []; 
        } catch(e) {}
        
        if (checklist[index]) {
            checklist[index].done = !checklist[index].done;
            await fetch(`/api/tasks/${taskId}`, {
                method: 'PUT',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ checklist: JSON.stringify(checklist) })
            });
            if (typeof loadTasks === 'function' && currentPage === 'tasks') loadTasks();
            if (typeof loadTaskHub === 'function' && currentPage === 'task-hub') loadTaskHub();
        }
    } catch (err) {
        console.error('Error saving checklist item', err);
    }
};

async function showTaskDetailModal(id) {
    const r = await fetch(`/api/tasks/${id}`);
    const t = await r.json();
    
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
        <div class="modal-card anim-pop" style="max-width:700px;padding:0;overflow:hidden;border:none;box-shadow:0 30px 90px rgba(0,0,0,0.2);">
            <div style="padding:2.5rem;background:linear-gradient(135deg, var(--surface-container-low), var(--surface));border-bottom:1px solid var(--surface-container-high);display:flex;justify-content:space-between;align-items:start;">
                <div>
                    <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:0.75rem;">
                        <span class="pill" style="background:var(--primary);color:white;font-size:0.65rem;font-weight:800;">P${t.priority}</span>
                        <span class="label-overline" style="margin:0;">${t.project || 'General Protocol'}</span>
                    </div>
                    <h2 style="font-size:2rem;letter-spacing:-0.03em;color:#1a1a1a;">${escapeHTML(t.title)}</h2>
                </div>
                <button class="btn-ghost" style="width:40px;height:40px;padding:0;display:flex;align-items:center;justify-content:center;border-radius:50%;" onclick="this.closest('.modal-overlay').remove()">
                    <span class="material-symbols-outlined">close</span>
                </button>
            </div>
            <div style="padding:2rem;">
                <div class="mb-8">
                    <label class="label-sm mb-2" style="display:block;">Mission Parameters</label>
                    <p style="font-size:0.9rem;line-height:1.6;color:#333;">${t.description || 'No detailed parameters defined for this objective.'}</p>
                </div>

                <div class="mb-8 p-4 neumorphic-inset rounded-2xl bg-surface-container-low flex items-center justify-between">
                    <div>
                        <label class="label-sm mb-1" style="display:block;">Pomodoro Progress</label>
                        <div class="flex items-center gap-2">
                            <span class="text-xl font-bold">${t.poms_done || 0} / ${t.poms_target || 1}</span>
                            <span class="text-[10px] uppercase tracking-widest text-outline">Sessions Finished</span>
                        </div>
                    </div>
                    <div class="flex gap-1">
                        ${Array.from({length: t.poms_target || 1}).map((_, i) => `
                            <span class="material-symbols-outlined" style="font-size:20px; color:${i < (t.poms_done || 0) ? 'var(--primary)' : 'var(--outline-variant)'};">
                                ${i < (t.poms_done || 0) ? 'timer' : 'timer_off'}
                            </span>
                        `).join('')}
                    </div>
                </div>
                
                <div class="mb-8">
                    <label class="label-sm mb-4" style="display:block;">Execution Checklist</label>
                    <div style="display:flex;flex-direction:column;gap:0.75rem;margin-bottom:1rem;">
                        ${(() => {
                            let items = [];
                            try { items = t.checklist ? JSON.parse(t.checklist) : []; } catch(e) {}
                            if (items.length === 0) return '<p style="color:var(--outline);font-size:0.8rem;">No checklist items defined.</p>';
                            return items.map((item, idx) => `
                                <div class="task-card" style="display:flex;align-items:center;gap:1.25rem;padding:1rem;border-radius:var(--radius-md);cursor:pointer;border:1px solid ${item.done ? 'var(--primary)' : 'var(--outline-variant)'}; opacity:${item.done ? 0.6 : 1}; transition: all 0.2s ease;" onclick="toggleChecklistItem(this, ${t.id}, ${idx})">
                                    <span class="material-symbols-outlined" style="color:${item.done?'var(--primary)':'var(--outline-variant)'}; font-size:1.5rem; transition: color 0.2s ease;">
                                        ${item.done?'check_circle':'radio_button_unchecked'}
                                    </span>
                                    <span style="font-size:0.9rem;font-weight:${item.done?800:600};text-decoration:${item.done?'line-through':'none'}; transition: all 0.2s ease;">${item.label}</span>
                                </div>
                            `).join('');
                        })()}
                    </div>
                    <div style="display:flex; gap:0.5rem;">
                        <input type="text" id="new-checklist-input-${t.id}" class="input-well" style="flex:1; padding:0.6rem; border:1px solid var(--outline-variant);" placeholder="Add new step..." onkeydown="if(event.key==='Enter') addChecklistItem(${t.id})">
                        <button class="btn-ghost" onclick="addChecklistItem(${t.id})" style="padding:0 1rem; border-radius:var(--radius-md); border:1px solid var(--outline-variant);"><span class="material-symbols-outlined">add</span></button>
                    </div>
                </div>

                <div style="display:flex;gap:1rem;">
                    <button class="btn-primary" style="flex:1;" onclick="startFocusSession(${t.id}, '${t.title.replace(/'/g, "\\'")}')">▶ START FOCUS</button>
                    <button class="btn-ghost" style="flex:1;" onclick="navigate('team-grid'); this.closest('.modal-overlay').remove();">REASSIGN</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
}

function showSectionGuide() {
    const guides = {
        'dashboard': {
            title: 'Dashboard Overview',
            steps: [
                { icon: 'speed', text: 'Monitor your real-time Pomodoro velocity.' },
                { icon: 'priority_high', text: 'View top P1 priorities needing immediate action.' },
                { icon: 'bolt', text: 'Track active protocol progress on the timeline.' }
            ]
        },
        'tasks': {
            title: 'Priority Mission Matrix',
            steps: [
                { icon: 'grid_view', text: 'Tasks are categorized by Eisenhower quadrants.' },
                { icon: 'clicker', text: 'Click any task card to view full parameters and checklist.' },
                { icon: 'play_circle', text: 'Launch focus sessions directly from the card.' }
            ]
        },
        'pomodoro': {
            title: 'Temporal Engine',
            steps: [
                { icon: 'link', text: 'Link a specific task to your focus session.' },
                { icon: 'timer', text: '25m work / 5m break cycle for peak mental performance.' },
                { icon: 'history', text: 'Review daily session logs in the right panel.' }
            ]
        },
        'schedule': {
            title: 'Daily Operations',
            steps: [
                { icon: 'event', text: 'Switch between 4 modes: College (Mon-Wed), Free (Thu-Fri), Saturday, Sunday.' },
                { icon: 'add_box', text: 'Deploy new time blocks to your timeline.' },
                { icon: 'edit', text: 'Click any block to edit, reschedule, or remove it.' },
                { icon: 'auto_stories', text: 'Categories: Learning, DevTailored, College, Shop, Personal, Free, Sleep.' }
            ]
        },
        'planner': {
            title: 'Weekly Planner',
            steps: [
                { icon: 'architecture', text: 'Set 3 Strategic Pillars — your top goals for the week.' },
                { icon: 'priority_high', text: 'Define P1/P2/P3 Priorities — your must-do, should-do, and maintenance tasks.' },
                { icon: 'check_circle', text: 'Track daily Habits — toggle each day to build streaks.' },
                { icon: 'rate_review', text: 'End-of-week Review — log wins, failures, and one pivot for next week.' }
            ]
        },
        'task-hub': {
            title: 'Universal Task Hub',
            steps: [
                { icon: 'search', text: 'Universal search across all workspace objectives.' },
                { icon: 'groups', text: 'Manage shared tasks and team assignments.' },
                { icon: 'visibility', text: 'Toggle between private and shared visibility.' }
            ]
        },
        'leads': {
            title: 'Business Growth Pipeline',
            steps: [
                { icon: 'person_add', text: 'Add new entities to your growth funnel.' },
                { icon: 'attach_money', text: 'Track valuation and pipeline stage.' },
                { icon: 'contact_page', text: 'Maintain deep internal notes on every lead.' }
            ]
        },
        'tracker': {
            title: 'Velocity Tracker',
            steps: [
                { icon: 'trending_up', text: 'Analyze daily and weekly focus output.' },
                { icon: 'bar_chart', text: 'Visualize task completion vs. temporal goals.' },
                { icon: 'psychology', text: 'Optimize deep work sessions based on data.' }
            ]
        }
    };

    const g = guides[currentPage] || guides['dashboard'];
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
        <div class="modal-card anim-pop" style="max-width:450px;">
            <div class="flex-between mb-8">
                <h3 style="font-size:1.5rem;">${g.title}</h3>
                <button class="btn-icon" onclick="this.closest('.modal-overlay').remove()"><span class="material-symbols-outlined">close</span></button>
            </div>
            <div style="display:flex;flex-direction:column;gap:1.5rem;">
                ${g.steps.map((s, i) => `
                    <div style="display:flex;gap:1.25rem;align-items:flex-start;">
                        <div style="width:40px;height:40px;border-radius:50%;background:var(--surface-container-high);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                            <span class="material-symbols-outlined" style="color:var(--primary);">${s.icon}</span>
                        </div>
                        <div>
                            <div style="font-size:0.65rem;font-weight:800;color:var(--outline);text-transform:uppercase;margin-bottom:0.25rem;">STEP 0${i+1}</div>
                            <div style="font-size:0.9rem;color:#333;font-weight:500;">${s.text}</div>
                        </div>
                    </div>
                `).join('')}
            </div>
            <button class="btn-primary" style="width:100%;margin-top:2rem;padding:1rem;" onclick="this.closest('.modal-overlay').remove()">UNDERSTOOD</button>
        </div>
    `;
    document.body.appendChild(overlay);
}

async function showNotifications() {
    await fetchNotifications();
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.onclick = (e) => e.target === overlay && overlay.remove();
    const permissionLabel = !('Notification' in window)
        ? 'Browser alerts unavailable'
        : (Notification.permission === 'granted' ? 'Alerts enabled' : 'Enable alerts');
    const notificationItems = notificationsCache.length
        ? notificationsCache.map(item => `
            <div style="padding:1rem;background:var(--surface-container-low);border-radius:var(--radius-sm);border-left:3px solid ${item.is_read ? 'var(--outline-variant)' : 'var(--primary)'};">
                <div style="font-weight:700;font-size:0.85rem;margin-bottom:0.25rem;display:flex;justify-content:space-between;gap:1rem;">
                    <span>${item.title}</span>
                    ${item.is_read ? '<span style="font-size:0.6rem;color:var(--outline);">READ</span>' : '<span class="pill pill-green" style="font-size:0.5rem;">NEW</span>'}
                </div>
                <p style="font-size:0.75rem;color:var(--outline);">${item.message}</p>
                <div style="font-size:0.6rem;color:var(--outline-variant);margin-top:0.5rem;">${formatTimeAgo(item.created_at)}</div>
            </div>
        `).join('')
        : `
            <div style="padding:1rem;background:var(--surface-container-low);border-radius:var(--radius-sm);">
                <div style="font-weight:700;font-size:0.85rem;margin-bottom:0.25rem;">All clear</div>
                <p style="font-size:0.75rem;color:var(--outline);">Timer completions and task assignments will appear here.</p>
            </div>
        `;
    overlay.innerHTML = `
        <div style="position:fixed;right:0;top:0;bottom:0;width:350px;background:var(--surface);box-shadow:var(--shadow-charcoal);padding:2rem;z-index:1000;" class="anim-slide-right">
            <div class="flex-between mb-8">
                <h3 style="font-size:1.2rem;">Notifications</h3>
                <button class="btn-icon" onclick="this.closest('.modal-overlay').remove()"><span class="material-symbols-outlined">close</span></button>
            </div>
            <div style="display:flex;gap:0.5rem;margin-bottom:1rem;flex-wrap:wrap;">
                <button class="btn-ghost" style="font-size:0.68rem;padding:0.55rem 0.9rem;" onclick="requestNotificationPermission()">${permissionLabel}</button>
                <button class="btn-ghost" style="font-size:0.68rem;padding:0.55rem 0.9rem;" onclick="fetchNotifications().then(() => { this.closest('.modal-overlay').remove(); showNotifications(); })">Refresh</button>
                <button class="btn-primary" style="font-size:0.68rem;padding:0.55rem 0.9rem;" onclick="this.closest('.modal-overlay').remove(); navigate('notifications');">View All</button>
            </div>
            <div style="display:flex;flex-direction:column;gap:1rem;">
                ${notificationItems}
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    markAllNotificationsRead();
}

// ═══════════════════════════════════════════════════════
async function loadTaskHub(searchTerm = '') {
    const container = document.getElementById('view-task-hub');
    if (!container) return;
    
    const activeFilterMode = window.taskHubMode || currentScheduleMode || 'any';
    let tasks = [];
    try { 
        const url = searchTerm ? `/api/tasks?show=hub` : `/api/tasks?show=hub&day_type=${activeFilterMode}`;
        const r = await fetch(url); 
        tasks = await r.json(); 
    } catch(e) {}

    if (searchTerm) {
        tasks = tasks.filter(t => t.title.toLowerCase().includes(searchTerm.toLowerCase()) || t.project.toLowerCase().includes(searchTerm.toLowerCase()));
    }

    container.innerHTML = `
    <div class="anim-slide">
        <div class="view-header" style="${isMobile() ? 'text-align:center; align-items:center;' : ''}">
            <div class="view-header-content" style="${isMobile() ? 'align-items:center; display:flex; flex-direction:column;' : ''}">
                <span class="label-overline">Universal Mission Control</span>
                <h1 style="font-size:3rem;margin:0;">Task Hub</h1>
            </div>
            <div class="view-header-actions" style="display:flex; flex-direction:column; align-items:flex-end; gap:0.5rem;">
                <div style="display:flex; gap:0.5rem; align-items:center;">
                    <div class="input-well" style="width:300px;">
                        <span class="material-symbols-outlined">search</span>
                        <input type="text" class="input-recessed" placeholder="Search objectives..." oninput="loadTaskHub(this.value)" value="${searchTerm}">
                    </div>
                    <button class="btn-ghost" onclick="showSectionGuide()">
                        <span class="material-symbols-outlined">help_outline</span>
                    </button>
                    <button class="btn-primary" onclick="showAddTaskModal()">
                        <span class="material-symbols-outlined">add</span> NEW TASK
                    </button>
                </div>
                <div style="display:flex; gap:0.5rem; background:var(--surface-container); padding:0.35rem; border-radius:var(--radius-md); overflow-x: auto; max-width: 500px;">
                    <button class="btn-ghost ${(!window.taskHubMode && !currentScheduleMode) || (window.taskHubMode || currentScheduleMode) === 'all' ? 'btn-primary' : ''}" style="font-size:0.7rem; padding:0.4rem 0.8rem;" onclick="window.taskHubMode='all'; loadTaskHub()">All</button>
                    <button class="btn-ghost ${(window.taskHubMode || currentScheduleMode) === 'any' ? 'btn-primary' : ''}" style="font-size:0.7rem; padding:0.4rem 0.8rem;" onclick="window.taskHubMode='any'; loadTaskHub()">Any Day</button>
                    ${scheduleModes.map(m => `<button class="btn-ghost ${(window.taskHubMode || currentScheduleMode) === m.slug ? 'btn-primary' : ''}" style="font-size:0.7rem; padding:0.4rem 0.8rem;" onclick="window.taskHubMode='${m.slug}'; loadTaskHub()">${m.label}</button>`).join('')}
                </div>
            </div>
        </div>

        <div class="team-table-wrapper">
            <table class="team-table" style="min-width: 800px;">
                <thead>
                    <tr>
                        <th style="width:50px;"></th>
                        <th style="min-width:250px;">Task Description</th>
                        <th style="width:120px;">Project</th>
                        <th style="width:80px;">🍅 Poms</th>
                        <th style="width:100px;">Priority</th>
                        <th style="width:120px;">Due Date</th>
                        <th style="width:100px;">Status</th>
                        <th style="width:60px;">Del</th>
                    </tr>
                </thead>
                <tbody>
                    ${tasks.map(t => `
                        <tr class="${t.completed?'row-done':''}">
                            <td style="text-align:center;">
                                <div class="toggle-switch ${t.completed?'on':''}" onclick="toggleTask(${t.id}, ${!t.completed})" style="transform:scale(0.7);">
                                    <div class="toggle-knob"></div>
                                </div>
                            </td>
                            <td style="font-weight:700;color:var(--primary);cursor:pointer;" onclick="toggleTaskDetails(${t.id})">
                                ${escapeHTML(t.title)}
                                <div id="details-${t.id}" class="hidden" style="font-size:0.75rem;font-weight:400;color:var(--outline);margin-top:0.5rem;padding:0.5rem;background:var(--surface-container-low);border-radius:var(--radius-sm);">
                                    ${t.description || 'No detailed mission parameters defined.'}
                                </div>
                            </td>
                            <td><span style="font-size:0.75rem;font-weight:800;color:var(--tertiary);">${escapeHTML(t.project)}</span></td>
                            <td style="font-size:0.7rem; font-weight:700;">${t.poms_done || 0}/${t.poms_target || 1}</td>
                            <td>
                                <span style="display:inline-block;padding:0.2rem 0.5rem;border-radius:99px;font-size:0.65rem;font-weight:800;background:var(--surface-container-highest);color:var(--primary);">
                                    P${t.priority}
                                </span>
                            </td>
                            <td style="font-size:0.75rem;font-weight:600;color:var(--outline);">${t.due_date || 'No Date'}</td>
                            <td>
                                <span style="font-size:0.65rem;font-weight:800;color:${t.completed?'#16a34a':'#2563eb'};">
                                    ${t.completed?'DONE':'ACTIVE'}
                                </span>
                            </td>
                            <td>
                                <button class="btn-icon" onclick="deleteTask(${t.id})" style="color:var(--error);"><span class="material-symbols-outlined" style="font-size:18px;">delete</span></button>
                            </td>
                        </tr>
                    `).join('')}
                    ${tasks.length === 0 ? '<tr><td colspan="7" style="text-align:center;padding:3rem;color:var(--outline);">No tasks found matching your criteria.</td></tr>' : ''}
                </tbody>
            </table>
        </div>
    </div>`;
}

async function deleteTask(id) {
    if (!confirm("Are you sure?")) return;
    const res = await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
    if (res.ok) {
        showToast("Task removed");
        loadTaskHub();
        loadTasks();
        if (document.getElementById('view-team-grid')) loadTeamGrid();
    }
}

async function addNewTask() {
    const input = document.getElementById('new-task-input');
    const priority = document.getElementById('new-task-priority');
    const dayType = document.getElementById('new-task-day');
    if (!input.value.trim()) return;
    await fetch('/api/tasks', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ 
            title: input.value.trim(), 
            priority: parseInt(priority.value), 
            project: 'General',
            day_type: dayType ? dayType.value : 'any'
        })
    });
    input.value = '';
    showToast('Objective deployed');
    loadTasks();
}

async function toggleTask(id, completed) {
    const body = { completed };
    // If manually marking done, ensure poms_done matches target for UI consistency
    if (completed) {
        try {
            const r = await fetch(`/api/tasks/${id}`);
            if (r.ok) {
                const t = await r.json();
                body.poms_done = t.poms_target || 1;
            }
        } catch(e) {}
    }
    await fetch(`/api/tasks/${id}`, { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body) });
    if (currentPage === 'tasks') loadTasks();
    if (currentPage === 'team-grid') loadTeamGrid();
    if (currentPage === 'task-hub') loadTaskHub();
}

function showAddBlockModal() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.onclick = (e) => e.target === overlay && overlay.remove();
    overlay.innerHTML = `
        <div class="modal-card anim-pop" style="max-width:500px;">
            <div class="flex-between mb-6">
                <h3 style="font-size:1.5rem;">New Operation Block</h3>
                <button class="btn-icon" onclick="this.closest('.modal-overlay').remove()"><span class="material-symbols-outlined">close</span></button>
            </div>
            <form onsubmit="handleSaveBlock(event); this.closest('.modal-overlay').remove();" style="display:flex;flex-direction:column;gap:1.5rem;">
                <div>
                    <label class="label-sm">Block Title *</label>
                    <input class="input-well w-full" type="text" id="sb-title" placeholder="e.g. Deep Work Session" required>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                    <div>
                        <label class="label-sm">Start Time *</label>
                        <input class="input-well w-full" type="time" id="sb-start" required>
                    </div>
                    <div>
                        <label class="label-sm">End Time *</label>
                        <input class="input-well w-full" type="time" id="sb-end" required>
                    </div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                    <div>
                        <label class="label-sm">Category</label>
                        <select class="input-well w-full" id="sb-cat">
                            ${Object.entries(SCHED_CAT).map(([k,v]) => `<option value="${k}">${v.label}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label class="label-sm">Day Type</label>
                        <select class="input-well w-full" id="sb-day-type">
                            <option value="college" ${currentScheduleMode==='college'?'selected':''}>📚 College (Mon-Wed)</option>
                            <option value="free" ${currentScheduleMode==='free'?'selected':''}>💻 Free (Thu-Fri)</option>
                            <option value="saturday" ${currentScheduleMode==='saturday'?'selected':''}>⚡ Saturday</option>
                            <option value="sunday" ${currentScheduleMode==='sunday'?'selected':''}>🔋 Sunday</option>
                            <option value="daily">📅 Every Day</option>
                        </select>
                    </div>
                </div>
                <div>
                    <label class="label-sm">Description</label>
                    <textarea class="input-well w-full" id="sb-desc" rows="2" placeholder="Optional notes..."></textarea>
                </div>
                <div>
                    <label class="label-sm">Target Pomodoros</label>
                    <input class="input-well w-full" type="number" id="sb-poms" placeholder="Auto-calculated from duration">
                </div>
                <button type="submit" class="btn-primary" style="padding:1rem;">Deploy Block</button>
            </form>
        </div>
    `;
    document.body.appendChild(overlay);
}

function showAddTaskModal() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.onclick = (e) => e.target === overlay && overlay.remove();
    overlay.innerHTML = `
        <div class="modal-card anim-pop" style="max-width:500px;">
            <div class="flex-between mb-6">
                <h3 style="font-size:1.5rem;">New Objective</h3>
                <button class="btn-icon" onclick="this.closest('.modal-overlay').remove()"><span class="material-symbols-outlined">close</span></button>
            </div>
            <form onsubmit="handleAddTaskSubmit(event)" style="display:flex;flex-direction:column;gap:1.5rem;">
                <div>
                    <label class="label-sm">Task Title *</label>
                    <input class="input-well w-full" type="text" id="nt-title" placeholder="What needs to be done?" required>
                </div>
                <div>
                    <label class="label-sm">Priority</label>
                    <select class="input-well w-full" id="nt-priority">
                        <option value="1">P1 - Critical</option>
                        <option value="2">P2 - Strategic</option>
                        <option value="3">P3 - Operational</option>
                        <option value="4" selected>P4 - Backlog</option>
                    </select>
                </div>
                <div>
                    <label class="label-sm">Project / Category</label>
                    <input class="input-well w-full" type="text" id="nt-project" placeholder="e.g. General, Dev, Admin" value="General">
                </div>
                <div>
                    <label class="label-sm">Day Type Sync</label>
                    <select class="input-well w-full" id="nt-day-type">
                        <option value="any">📅 Any Day (Universal)</option>
                        ${scheduleModes.map(m => `<option value="${m.slug}" ${(window.taskHubMode || currentScheduleMode) === m.slug ? 'selected' : ''}>${m.label}</option>`).join('')}
                    </select>
                </div>
                <button type="submit" class="btn-primary" style="padding:1rem;">Deploy Objective</button>
            </form>
        </div>
    `;
    document.body.appendChild(overlay);
}

async function handleAddTaskSubmit(e) {
    e.preventDefault();
    const title = document.getElementById('nt-title').value;
    const priority = document.getElementById('nt-priority').value;
    const project = document.getElementById('nt-project').value;
    const dayType = document.getElementById('nt-day-type').value;
    
    await fetch('/api/tasks', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ title, priority: parseInt(priority), project, day_type: dayType })
    });
    
    showToast('Objective deployed');
    e.target.closest('.modal-overlay').remove();
    if (currentPage === 'tasks') loadTasks();
    if (currentPage === 'task-hub') loadTaskHub();
}

function startFocusSession(taskId, taskTitle) {
    if (typeof window.startFocusSession === 'function') {
        window.startFocusSession(taskId, taskTitle);
    } else {
        pomTaskInput = taskTitle;
        pomTaskId = `task_${taskId}`;
        navigate('pomodoro');
        setTimeout(() => {
            const linkedEl = document.getElementById('pom-linked-task');
            if (linkedEl) linkedEl.innerHTML = `<div style="color:var(--primary);font-weight:800;">${taskTitle}</div>`;
            const taskField = document.getElementById('pom-task-field');
            if (taskField) taskField.value = taskTitle;
            if (!pomIsRunning) togglePom();
        }, 300);
    }
}

// ═══════════════════════════════════════════════════════
// TRACKER — Velocity KPIs
// ═══════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════
// TRACKER — Velocity KPIs
// ═══════════════════════════════════════════════════════
let trackerTab = 'daily';

async function loadTracker() {
    const c = document.getElementById('view-tracker');
    c.innerHTML = `
    <div class="anim-slide">
        <div class="mb-8">
            <span class="label-overline mb-2" style="display:block;">CommandFlow Executive Overview</span>
            <h1 style="font-size:3rem;">Velocity Tracker</h1>
        </div>

        <div class="tab-container">
            <button class="tab-btn ${trackerTab==='daily'?'active':''}" onclick="setTrackerTab('daily')">Daily Log</button>
            <button class="tab-btn ${trackerTab==='charts'?'active':''}" onclick="setTrackerTab('charts')">Performance Charts</button>
            <button class="tab-btn ${trackerTab==='aiml'?'active':''}" onclick="setTrackerTab('aiml')">AI/ML Lab</button>
            <button class="tab-btn ${trackerTab==='kpis'?'active':''}" onclick="setTrackerTab('kpis')">Business KPIs</button>
        </div>

        <div id="tracker-content"></div>
    </div>`;
    renderTrackerContent();
}

function setTrackerTab(tab) {
    trackerTab = tab;
    loadTracker();
}

async function renderTrackerContent() {
    const container = document.getElementById('tracker-content');
    if (!container) return;

    if (trackerTab === 'daily') {
        let logs = []; try { const r = await fetch('/api/tracker/daily'); logs = await r.json(); } catch(e) {}
        container.innerHTML = `
            <div class="grid grid-cols-1 lg:grid-cols-5 gap-8">
                <div class="lg:col-span-2 neumorphic-inset rounded-3xl p-6 lg:p-8 bg-surface-container-low h-fit">
                    <h4 class="label-sm mb-6 text-primary">Log Session</h4>
                    <form onsubmit="handleSaveDaily(event)" class="space-y-6">
                        <div>
                            <label class="label-sm opacity-70 mb-2 block">Date</label>
                            <input class="input-recessed w-full px-4 py-3 rounded-xl font-semibold border-none" type="date" id="tr-date" value="${new Date().toISOString().split('T')[0]}">
                        </div>
                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <label class="label-sm opacity-70 mb-2 block">DT Hours</label>
                                <input class="input-recessed w-full px-4 py-3 rounded-xl font-semibold border-none" type="number" id="tr-dt" step="0.5" value="0">
                            </div>
                            <div>
                                <label class="label-sm opacity-70 mb-2 block">AI Hours</label>
                                <input class="input-recessed w-full px-4 py-3 rounded-xl font-semibold border-none" type="number" id="tr-ai" step="0.5" value="0">
                            </div>
                        </div>
                        <div class="grid grid-cols-3 gap-4">
                            <div>
                                <label class="label-sm opacity-70 mb-2 block">Poms</label>
                                <input class="input-recessed w-full px-4 py-3 rounded-xl font-semibold border-none" type="number" id="tr-poms" value="0">
                            </div>
                            <div>
                                <label class="label-sm opacity-70 mb-2 block">Mood</label>
                                <input class="input-recessed w-full px-4 py-3 rounded-xl font-semibold border-none" type="number" id="tr-mood" value="7">
                            </div>
                            <div>
                                <label class="label-sm opacity-70 mb-2 block">Git</label>
                                <input class="input-recessed w-full px-4 py-3 rounded-xl font-semibold border-none" type="number" id="tr-commits" value="0">
                            </div>
                        </div>
                        <div>
                            <label class="label-sm opacity-70 mb-2 block">Top Win</label>
                            <input class="input-recessed w-full px-4 py-3 rounded-xl font-semibold border-none" type="text" id="tr-win" placeholder="e.g. Deployed MVP">
                        </div>
                        <div>
                            <label class="label-sm opacity-70 mb-2 block">Blocker</label>
                            <input class="input-recessed w-full px-4 py-3 rounded-xl font-semibold border-none" type="text" id="tr-blocker" placeholder="e.g. AWS Permissions">
                        </div>
                        <button type="submit" class="btn-primary w-full py-4 mt-2 font-bold uppercase tracking-widest text-xs">Commit Log</button>
                    </form>
                </div>
                <div class="lg:col-span-3 neumorphic-raised rounded-3xl p-6 lg:p-8 bg-white overflow-hidden">
                    <h4 class="label-sm mb-6">Recent History</h4>
                    <div class="overflow-x-auto -mx-6 lg:-mx-8 px-6 lg:px-8">
                        <table class="w-full text-[11px] lg:text-xs border-collapse">
                            <thead>
                                <tr class="text-left text-outline border-bottom border-surface-container">
                                    <th class="py-3 px-2">Date</th>
                                    <th class="py-3 px-2">DT</th>
                                    <th class="py-3 px-2">AI</th>
                                    <th class="py-3 px-2">Poms</th>
                                    <th class="py-3 px-2">Mood</th>
                                    <th class="py-3 px-2">Action</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-surface-container-low">
                                ${logs.slice(0,10).map(l => `
                                    <tr>
                                        <td class="py-4 px-2 font-bold">${l.date.substring(5)}</td>
                                        <td class="py-4 px-2">${l.dt_hours}h</td>
                                        <td class="py-4 px-2">${l.ai_hours}h</td>
                                        <td class="py-4 px-2">${l.pomodoros}</td>
                                        <td class="py-4 px-2"><span class="mood-pill" style="background:${l.mood>=8?'#d1fae5':(l.mood>=6?'#fef3c7':'#fee2e2')}">${l.mood}</span></td>
                                        <td class="py-4 px-2"><button onclick="deleteDailyLog(${l.id})" class="text-error font-bold uppercase text-[9px] hover:underline">Delete</button></td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
`;
    } else if (trackerTab === 'charts') {
        let logs = []; try { const r = await fetch('/api/tracker/daily'); logs = await r.json(); } catch(e) {}
        const recent = logs.slice(0, 7).reverse();
        container.innerHTML = `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div class="neumorphic-raised rounded-3xl p-6 bg-white">
                    <h4 class="label-sm mb-6">Daily Hours (DT vs AI)</h4>
                    <div class="chart-bar-container h-48 flex items-end gap-2 px-4">
                        ${recent.map(l => `
                            <div class="flex-1 flex flex-col justify-end gap-1 h-full">
                                <div class="w-full rounded-t-lg bg-primary" style="height:${(l.dt_hours/12)*100}%;"></div>
                                <div class="w-full rounded-t-lg bg-tertiary" style="height:${(l.ai_hours/12)*100}%;"></div>
                                <span class="text-[8px] font-bold text-outline text-center mt-2">${l.date.substring(8)}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
                <div class="neumorphic-raised rounded-3xl p-6 bg-white">
                    <h4 class="label-sm mb-6">Pomodoro Consistency</h4>
                    <div class="chart-bar-container h-48 flex items-end gap-4 px-4">
                        ${recent.map(l => `
                            <div class="flex-1 flex flex-col justify-end h-full">
                                <div class="w-full rounded-t-lg bg-[#ff4d6d]" style="height:${(l.pomodoros/12)*100}%;"></div>
                                <span class="text-[8px] font-bold text-outline text-center mt-2">${l.date.substring(8)}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
`;
    } else if (trackerTab === 'aiml') {
        let logs = []; try { const r = await fetch('/api/tracker/aiml'); logs = await r.json(); } catch(e) {}
        container.innerHTML = `
            <div style="display:grid;grid-template-columns:1fr 2fr;gap:2rem;">
                <div class="card-recessed" style="padding:2rem;">
                    <h4 class="label-sm mb-6" style="font-size:0.85rem;font-weight:800;color:var(--primary);text-transform:uppercase;letter-spacing:0.1em;">Research Entry</h4>
                    <form onsubmit="handleSaveAIML(event)" style="display:flex;flex-direction:column;gap:1.5rem;">
                        <div>
                            <label style="font-size:0.75rem;font-weight:700;color:var(--outline);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.4rem;display:block;">Research Topic *</label>
                            <input class="input-recessed" style="width:100%;padding:0.75rem 1rem;border:1px solid var(--outline-variant);border-radius:var(--radius-sm);font-weight:600;" type="text" id="ai-topic" placeholder="e.g. DeepSeek RL" required>
                        </div>
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                            <div>
                                <label style="font-size:0.75rem;font-weight:700;color:var(--outline);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.4rem;display:block;">Source</label>
                                <input class="input-recessed" style="width:100%;padding:0.75rem 1rem;border:1px solid var(--outline-variant);border-radius:var(--radius-sm);font-weight:600;" type="text" id="ai-source" placeholder="Paper / Doc">
                            </div>
                            <div>
                                <label style="font-size:0.75rem;font-weight:700;color:var(--outline);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.4rem;display:block;">Applied to DT?</label>
                                <select class="input-recessed" style="width:100%;padding:0.75rem 1rem;border:1px solid var(--outline-variant);border-radius:var(--radius-sm);font-weight:600;" id="ai-applied">
                                    <option value="No">No</option>
                                    <option value="Yes">Yes</option>
                                </select>
                            </div>
                        </div>
                        <div>
                            <label style="font-size:0.75rem;font-weight:700;color:var(--outline);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.4rem;display:block;">Key Takeaways</label>
                            <textarea class="input-recessed" style="width:100%;padding:0.75rem 1rem;border:1px solid var(--outline-variant);border-radius:var(--radius-sm);font-weight:600;resize:vertical;" id="ai-notes" placeholder="Detailed notes..." rows="4"></textarea>
                        </div>
                        <button type="submit" class="btn-primary" style="width:100%;padding:0.8rem;margin-top:0.5rem;">Log Research</button>
                    </form>
                </div>
                <div class="card-elevated">
                    <h4 class="label-sm mb-4">Research Vault</h4>
                    ${logs.map(l => `
                        <div style="padding:1rem;border-bottom:1px solid var(--surface-container);margin-bottom:0.5rem;">
                            <div class="flex-between">
                                <h5 style="font-weight:800;">${l.topic}</h5>
                                <span class="pill" style="font-size:0.6rem;">${l.date}</span>
                            </div>
                            <p style="font-size:0.75rem;color:var(--on-surface-variant);margin-top:0.5rem;">${escapeHTML(l.notes)}</p>
                            <div style="font-size:0.65rem;color:var(--outline);margin-top:0.5rem;">Source: ${escapeHTML(l.source)} · Applied: ${l.applied_to}</div>
                        </div>
                    `).join('')}
                </div>
            </div>`;
    } else if (trackerTab === 'kpis') {
        let logs = []; try { const r = await fetch('/api/tracker/kpis'); logs = await r.json(); } catch(e) {}
        container.innerHTML = `
            <div class="card-elevated">
                <h4 class="label-sm mb-6" style="font-size:0.85rem;font-weight:800;color:var(--primary);text-transform:uppercase;letter-spacing:0.1em;">Business KPI Scorecard</h4>
                <form onsubmit="handleSaveKPI(event)" style="display:flex;flex-direction:column;gap:1.5rem;margin-bottom:2rem;">
                    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1.25rem;">
                        <div>
                            <label style="font-size:0.65rem;font-weight:700;color:var(--outline);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.4rem;display:block;">Leads</label>
                            <input class="input-recessed" style="width:100%;padding:0.75rem;border:1px solid var(--outline-variant);border-radius:var(--radius-sm);font-weight:600;" type="number" id="kp-leads" placeholder="0">
                        </div>
                        <div>
                            <label style="font-size:0.65rem;font-weight:700;color:var(--outline);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.4rem;display:block;">Clients</label>
                            <input class="input-recessed" style="width:100%;padding:0.75rem;border:1px solid var(--outline-variant);border-radius:var(--radius-sm);font-weight:600;" type="number" id="kp-clients" placeholder="0">
                        </div>
                        <div>
                            <label style="font-size:0.65rem;font-weight:700;color:var(--outline);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.4rem;display:block;">Revenue ($)</label>
                            <input class="input-recessed" style="width:100%;padding:0.75rem;border:1px solid var(--outline-variant);border-radius:var(--radius-sm);font-weight:600;" type="number" id="kp-revenue" placeholder="0">
                        </div>
                    </div>
                    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1.25rem;">
                        <div>
                            <label style="font-size:0.65rem;font-weight:700;color:var(--outline);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.4rem;display:block;">Commits</label>
                            <input class="input-recessed" style="width:100%;padding:0.75rem;border:1px solid var(--outline-variant);border-radius:var(--radius-sm);font-weight:600;" type="number" id="kp-commits" placeholder="0">
                        </div>
                        <div>
                            <label style="font-size:0.65rem;font-weight:700;color:var(--outline);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.4rem;display:block;">Blogs</label>
                            <input class="input-recessed" style="width:100%;padding:0.75rem;border:1px solid var(--outline-variant);border-radius:var(--radius-sm);font-weight:600;" type="number" id="kp-blogs" placeholder="0">
                        </div>
                        <div>
                            <label style="font-size:0.65rem;font-weight:700;color:var(--outline);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.4rem;display:block;">Stars</label>
                            <input class="input-recessed" style="width:100%;padding:0.75rem;border:1px solid var(--outline-variant);border-radius:var(--radius-sm);font-weight:600;" type="number" id="kp-stars" placeholder="0">
                        </div>
                    </div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.25rem;">
                        <div>
                            <label style="font-size:0.65rem;font-weight:700;color:var(--outline);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.4rem;display:block;">Big Win of the Week</label>
                            <input class="input-recessed" style="width:100%;padding:0.75rem;border:1px solid var(--outline-variant);border-radius:var(--radius-sm);font-weight:600;" type="text" id="kp-win" placeholder="e.g. Closed $50k deal">
                        </div>
                        <div>
                            <label style="font-size:0.65rem;font-weight:700;color:var(--outline);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.4rem;display:block;">Next Strategic Goal</label>
                            <input class="input-recessed" style="width:100%;padding:0.75rem;border:1px solid var(--outline-variant);border-radius:var(--radius-sm);font-weight:600;" type="text" id="kp-goal" placeholder="e.g. Scale to 100 users">
                        </div>
                    </div>
                    <button type="submit" class="btn-primary" style="width:100%;padding:0.8rem;">Commit Strategy</button>
                </form>
                <table style="width:100%;font-size:0.75rem;border-collapse:collapse;">
                    <thead><tr style="text-align:left;color:var(--outline);border-bottom:1px solid var(--surface-container);">
                        <th style="padding:0.5rem;">Week</th><th>Leads</th><th>Clients</th><th>Revenue</th><th>Commits</th><th>Blogs</th>
                    </tr></thead>
                    <tbody>
                        ${logs.map(l => `
                            <tr style="border-bottom:1px solid var(--surface-container-low);">
                                <td style="padding:0.75rem 0.5rem;font-weight:700;">${l.week_date}</td>
                                <td>${l.leads}</td><td>${l.clients}</td><td>$${l.revenue}</td><td>${l.commits}</td><td>${l.blogs}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>`;
    }
}

async function handleSaveDaily(e) {
    e.preventDefault();
    const data = {
        date: document.getElementById('tr-date').value,
        dt_hours: parseFloat(document.getElementById('tr-dt').value),
        ai_hours: parseFloat(document.getElementById('tr-ai').value),
        pomodoros: parseInt(document.getElementById('tr-poms').value),
        mood: parseInt(document.getElementById('tr-mood').value),
        commits: parseInt(document.getElementById('tr-commits').value || 0),
        top_win: document.getElementById('tr-win').value,
        blocker: document.getElementById('tr-blocker').value
    };
    await fetch('/api/tracker/daily', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) });
    showToast('Velocity committed');
    loadTracker();
}

async function deleteDailyLog(id) {
    if(!confirm('Delete this entry?')) return;
    await fetch(`/api/tracker/daily/${id}`, { method: 'DELETE' });
    loadTracker();
}

async function handleSaveAIML(e) {
    e.preventDefault();
    const data = {
        date: new Date().toISOString().split('T')[0],
        topic: document.getElementById('ai-topic').value,
        source: document.getElementById('ai-source').value || '',
        applied_to: document.getElementById('ai-applied').value,
        notes: document.getElementById('ai-notes').value || ''
    };
    await fetch('/api/tracker/aiml', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) });
    showToast('Research logged');
    loadTracker();
}

async function handleSaveKPI(e) {
    e.preventDefault();
    const data = {
        week_date: getMonday(0),
        leads: parseInt(document.getElementById('kp-leads').value || 0),
        clients: parseInt(document.getElementById('kp-clients').value || 0),
        revenue: parseFloat(document.getElementById('kp-revenue').value || 0),
        commits: parseInt(document.getElementById('kp-commits').value || 0),
        blogs: parseInt(document.getElementById('kp-blogs').value || 0),
        stars: parseInt(document.getElementById('kp-stars').value || 0),
        big_win: document.getElementById('kp-win').value,
        next_goal: document.getElementById('kp-goal').value
    };
    await fetch('/api/tracker/kpis', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) });
    showToast('KPIs updated');
    loadTracker();
}

// ═══════════════════════════════════════════════════════
// PLANNER — Habit Continuity Matrix
// ═══════════════════════════════════════════════════════
async function loadPlanner() {
    const weekKey = getMonday(currentWeekOffset);
    let data = { goals: {}, priorities: {}, review: {}, reflection: '', numbers: {}, habits: {} };
    try { const r = await fetch(`/api/planner/${weekKey}`); data = await r.json(); } catch(e) {}
    habitState = data.habits || {};

    const c = document.getElementById('view-planner');
    if (isMobile()) {
        const days = ['M','T','W','T','F','S','S'];
        const habitsList = [
            { id: 'focus', icon: 'local_cafe', color: '#ff4d6d', label: 'Deep Focus' },
            { id: 'ai', icon: 'psychology', color: '#4d96ff', label: 'AI/ML Lab' },
            { id: 'phys', icon: 'fitness_center', color: '#6bc47d', label: 'Physical' },
            { id: 'code', icon: 'code', color: '#ffd93d', label: 'Git Commit' }
        ];

        c.innerHTML = `
        <div class="anim-slide px-2 pb-24">
            <div class="mb-8">
                <span class="label-overline">Weekly Strategy</span>
                <h1 class="text-3xl font-bold tracking-tight text-on-surface">Weekly Planner</h1>
                <p class="text-xs text-outline mt-1">Set goals, track habits, and review your week</p>
            </div>

            <!-- Date Selector -->
            <div class="flex items-center justify-between neumorphic-inset bg-surface-container-low p-3 rounded-2xl mb-10">
                <button onclick="moveWeek(-1)" class="w-10 h-10 flex items-center justify-center text-outline-variant active:scale-90 transition-all">
                    <span class="material-symbols-outlined">chevron_left</span>
                </button>
                <div class="text-center">
                    <span class="text-[10px] font-bold uppercase tracking-widest text-outline block">Week Of</span>
                    <span class="text-xs font-extrabold text-on-surface">${new Date(weekKey).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                </div>
                <button onclick="moveWeek(1)" class="w-10 h-10 flex items-center justify-center text-outline-variant active:scale-90 transition-all">
                    <span class="material-symbols-outlined">chevron_right</span>
                </button>
            </div>

            <!-- Strategic Pillars (Mobile) -->
            <section class="space-y-4 mb-10">
                <div class="neumorphic-raised bg-surface-container-lowest p-6 rounded-3xl">
                    <div class="flex items-center gap-3 mb-6">
                        <div class="w-8 h-8 rounded-full bg-primary/5 flex items-center justify-center text-primary">
                            <span class="material-symbols-outlined text-base">architecture</span>
                        </div>
                        <h3 class="text-sm font-extrabold uppercase tracking-widest text-on-surface">Pillars</h3>
                    </div>
                    
                    <div class="space-y-4">
                        <div class="neumorphic-inset bg-surface-container-low p-4 rounded-2xl">
                            <label class="text-[9px] font-bold text-outline uppercase tracking-[0.2em] block mb-1.5">Action</label>
                            <input class="w-full bg-transparent border-none p-0 text-sm font-bold text-on-surface focus:ring-0 placeholder:opacity-30" 
                                   type="text" id="pl-goal-1" placeholder="Define mission..." value="${data.goals.g1||''}"
                                   onchange="saveFullPlanner()">
                        </div>
                        <div class="neumorphic-inset bg-surface-container-low p-4 rounded-2xl">
                            <label class="text-[9px] font-bold text-outline uppercase tracking-[0.2em] block mb-1.5">Technical</label>
                            <input class="w-full bg-transparent border-none p-0 text-sm font-bold text-on-surface focus:ring-0 placeholder:opacity-30" 
                                   type="text" id="pl-goal-2" placeholder="Skills..." value="${data.goals.g2||''}"
                                   onchange="saveFullPlanner()">
                        </div>
                    </div>
                </div>
            </section>

            <!-- Weekly Habits (Mobile) -->
            <section class="mb-10">
                <div class="flex items-center justify-between mb-6 px-2">
                    <h3 class="text-sm font-extrabold uppercase tracking-widest text-on-surface">Habits</h3>
                </div>

                <div class="grid grid-cols-8 gap-2 mb-8 overflow-x-auto pb-4 no-scrollbar">
                    <div class="flex items-center justify-center p-2"></div>
                    ${days.map(d => `<div class="text-[10px] font-extrabold text-outline text-center py-2">${d}</div>`).join('')}

                    ${habitsList.map(h => `
                        <div class="contents">
                            <div class="flex items-center justify-center p-2">
                                <span class="material-symbols-outlined text-outline text-lg">${h.icon}</span>
                            </div>
                            ${[0,1,2,3,4,5,6].map(dayIdx => {
                                const active = habitState[h.id] && habitState[h.id][dayIdx];
                                return `
                                    <button onclick="toggleHabitMobile('${h.id}', ${dayIdx})" 
                                            class="w-10 h-10 rounded-xl flex items-center justify-center active:scale-90 transition-all"
                                            style="background: ${active ? h.color : 'var(--surface-container-high)'}; 
                                                   box-shadow: ${active ? `inset -2px -2px 4px rgba(0,0,0,0.2), inset 2px 2px 4px rgba(255,255,255,0.3)` : `var(--neumorphic-shadow-raised)`};
                                                   border: 1px solid ${active ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.8)'};">
                                        ${active ? '<span class="material-symbols-outlined text-white text-base">check</span>' : ''}
                                    </button>
                                `;
                            }).join('')}
                        </div>
                    `).join('')}
                </div>
            </section>
        </div>`;
        return;
    }

    c.innerHTML = `
    <div class="anim-slide">
        <div class="flex-between mb-8">
            <div>
                <span class="label-overline mb-2" style="display:block;">Weekly Strategy</span>
                <h1 style="font-size:3rem;">Weekly Planner</h1>
                <p style="font-size:0.82rem;color:var(--outline);margin-top:0.25rem;">Set weekly goals • Track daily habits • Review & reflect</p>
            </div>
            <div style="display:flex;gap:0.5rem;align-items:center;">
                <button class="btn-ghost" onclick="moveWeek(-1)">←</button>
                <span class="pill">Week of ${new Date(weekKey).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                <button class="btn-ghost" onclick="moveWeek(1)">→</button>
            </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:2rem;" class="mb-8">
            <!-- Strategic Pillars -->
            <div class="card-recessed" style="padding:2rem;">
                <h4 class="label-sm mb-6" style="font-size:0.85rem;font-weight:800;color:var(--primary);text-transform:uppercase;letter-spacing:0.1em;">Strategic Pillars</h4>
                <div style="display:flex;flex-direction:column;gap:1.25rem;">
                    <div>
                        <label style="font-size:0.7rem;font-weight:700;color:var(--outline);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.3rem;display:block;">Pillar 1: Massive Action</label>
                        <input class="input-recessed" style="width:100%;padding:0.75rem 1rem;border:1px solid var(--outline-variant);border-radius:var(--radius-sm);font-weight:600;" type="text" id="pl-goal-1" placeholder="Define mission..." value="${data.goals.g1||''}" oninput="debouncedSavePlanner()">
                    </div>
                    <div>
                        <label style="font-size:0.7rem;font-weight:700;color:var(--outline);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.3rem;display:block;">Pillar 2: Technical Depth</label>
                        <input class="input-recessed" style="width:100%;padding:0.75rem 1rem;border:1px solid var(--outline-variant);border-radius:var(--radius-sm);font-weight:600;" type="text" id="pl-goal-2" placeholder="Skills to master..." value="${data.goals.g2||''}" oninput="debouncedSavePlanner()">
                    </div>
                    <div>
                        <label style="font-size:0.7rem;font-weight:700;color:var(--outline);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.3rem;display:block;">Pillar 3: Market Presence</label>
                        <input class="input-recessed" style="width:100%;padding:0.75rem 1rem;border:1px solid var(--outline-variant);border-radius:var(--radius-sm);font-weight:600;" type="text" id="pl-goal-3" placeholder="Visibility goals..." value="${data.goals.g3||''}" oninput="debouncedSavePlanner()">
                    </div>
                    <div style="margin-top:0.5rem;padding-top:1.5rem;border-top:1px solid var(--surface-container-highest);">
                        <label style="font-size:0.7rem;font-weight:700;color:var(--tertiary);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.3rem;display:block;">AI/ML core Research Milestone</label>
                        <input class="input-recessed" style="width:100%;padding:0.75rem 1rem;border:1px solid var(--outline-variant);border-radius:var(--radius-sm);font-weight:600;" type="text" id="pl-ai-goal" placeholder="e.g. Master Transformers" value="${data.goals.ai||''}" oninput="debouncedSavePlanner()">
                    </div>
                </div>
            </div>

            <!-- Priority Matrix -->
            <div class="card-elevated" style="padding:2rem;">
                <h4 class="label-sm mb-6" style="font-size:0.85rem;font-weight:800;color:var(--primary);text-transform:uppercase;letter-spacing:0.1em;">Tactile Priorities</h4>
                <div style="display:flex;flex-direction:column;gap:1.5rem;">
                    <div>
                        <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:0.4rem;">
                            <span class="pill pill-red" style="font-size:0.6rem;padding:0.1rem 0.6rem;">P1</span>
                            <label style="font-size:0.7rem;font-weight:700;color:var(--outline);text-transform:uppercase;letter-spacing:0.05em;">Non-negotiable Mission</label>
                        </div>
                        <input class="input-recessed" style="width:100%;padding:0.75rem 1rem;border:1px solid var(--outline-variant);border-radius:var(--radius-sm);font-weight:600;" type="text" id="pl-p1" placeholder="Must complete..." value="${data.priorities.p1||''}" oninput="debouncedSavePlanner()">
                    </div>
                    <div>
                        <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:0.4rem;">
                            <span class="pill pill-green" style="font-size:0.6rem;padding:0.1rem 0.6rem;">P2</span>
                            <label style="font-size:0.7rem;font-weight:700;color:var(--outline);text-transform:uppercase;letter-spacing:0.05em;">Strategic Objective</label>
                        </div>
                        <input class="input-recessed" style="width:100%;padding:0.75rem 1rem;border:1px solid var(--outline-variant);border-radius:var(--radius-sm);font-weight:600;" type="text" id="pl-p2" placeholder="Should complete..." value="${data.priorities.p2||''}" oninput="debouncedSavePlanner()">
                    </div>
                    <div>
                        <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:0.4rem;">
                            <span class="pill" style="font-size:0.6rem;padding:0.1rem 0.6rem;background:var(--surface-container-highest);">P3</span>
                            <label style="font-size:0.7rem;font-weight:700;color:var(--outline);text-transform:uppercase;letter-spacing:0.05em;">Operational Task</label>
                        </div>
                        <input class="input-recessed" style="width:100%;padding:0.75rem 1rem;border:1px solid var(--outline-variant);border-radius:var(--radius-sm);font-weight:600;" type="text" id="pl-p3" placeholder="Maintenance..." value="${data.priorities.p3||''}" oninput="debouncedSavePlanner()">
                    </div>
                </div>
            </div>
        </div>

        <!-- Habit Matrix -->
        <div class="card-elevated mb-8">
            <h4 class="label-sm mb-6">Continuity Matrix (Habit Overlap)</h4>
            <div class="habit-matrix-wrapper">
                <div class="habit-matrix-grid" id="habit-matrix" style="grid-template-columns: 200px repeat(7, 1fr) 80px;">
                <div></div>
                <div class="label-sm" style="text-align:center;">M</div><div class="label-sm" style="text-align:center;">T</div>
                <div class="label-sm" style="text-align:center;">W</div><div class="label-sm" style="text-align:center;">T</div>
                <div class="label-sm" style="text-align:center;">F</div><div class="label-sm" style="text-align:center;">S</div>
                <div class="label-sm" style="text-align:center;">S</div>
                <div class="label-sm" style="text-align:center;">Score</div>
                </div>
            </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:2rem;" class="mb-8">
            <!-- Weekly Reflection -->
            <div class="card-recessed" style="padding:2rem;">
                <h4 class="label-sm mb-6" style="font-size:0.85rem;font-weight:800;color:var(--primary);text-transform:uppercase;letter-spacing:0.1em;">Weekly Reflection</h4>
                <div>
                    <label style="font-size:0.7rem;font-weight:700;color:var(--outline);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.4rem;display:block;">Data Synthesis & Notes</label>
                    <textarea class="input-recessed" style="width:100%;padding:1rem;border:1px solid var(--outline-variant);border-radius:var(--radius-sm);font-weight:600;resize:vertical;" id="pl-reflection" rows="6" placeholder="Synthesis of this week's data points..." oninput="debouncedSavePlanner()">${data.reflection || ''}</textarea>
                </div>
            </div>
            <!-- Last Week Review -->
            <div class="card-elevated" style="padding:2rem;">
                <h4 class="label-sm mb-6" style="font-size:0.85rem;font-weight:800;color:var(--primary);text-transform:uppercase;letter-spacing:0.1em;">Retroactive Review</h4>
                <div style="display:flex;flex-direction:column;gap:1.25rem;">
                    <div>
                        <label style="font-size:0.7rem;font-weight:700;color:var(--outline);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.3rem;display:block;">Biggest Weekly Win</label>
                        <input class="input-recessed" style="width:100%;padding:0.75rem 1rem;border:1px solid var(--outline-variant);border-radius:var(--radius-sm);font-weight:600;" type="text" id="pl-win" placeholder="e.g. Major deployment" value="${data.review.win||''}" oninput="debouncedSavePlanner()">
                    </div>
                    <div>
                        <label style="font-size:0.7rem;font-weight:700;color:var(--outline);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.3rem;display:block;">Growth Opportunity (Failures)</label>
                        <input class="input-recessed" style="width:100%;padding:0.75rem 1rem;border:1px solid var(--outline-variant);border-radius:var(--radius-sm);font-weight:600;" type="text" id="pl-fail" placeholder="What didn't work?" value="${data.review.fail||''}" oninput="debouncedSavePlanner()">
                    </div>
                    <div>
                        <label style="font-size:0.7rem;font-weight:700;color:var(--outline);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.3rem;display:block;">One Pivot for Next Week</label>
                        <input class="input-recessed" style="width:100%;padding:0.75rem 1rem;border:1px solid var(--outline-variant);border-radius:var(--radius-sm);font-weight:600;" type="text" id="pl-change" placeholder="e.g. Earlier wake up" value="${data.review.change||''}" oninput="debouncedSavePlanner()">
                    </div>
                    
                    <div id="planner-save-status" style="text-align:center; font-size:0.75rem; color:var(--outline); margin-top:0.5rem; height: 1.2rem; display: flex; align-items: center; justify-content: center; opacity: 0.7;">
                        <span class="material-symbols-outlined" style="font-size: 14px; margin-right: 4px;">cloud_done</span> All changes saved
                    </div>
                </div>
            </div>
        </div>
    </div>`;

    renderHabitGrid();
}

function renderHabitGrid() {
    const matrix = document.getElementById('habit-matrix');
    if (!matrix) return;
    const HABITS = [
        { id: 'focus', label: 'Deep Focus (2h+)' },
        { id: 'ai',    label: 'AI/ML Lab Time' },
        { id: 'phys',  label: 'Physical Vitals' },
        { id: 'code',  label: 'Git Commit' },
        { id: 'read',  label: 'Strategic Reading' }
    ];

    HABITS.forEach(h => {
        const label = document.createElement('div');
        label.style.cssText = 'font-size:0.8rem;font-weight:700;color:var(--on-surface-variant);padding:0.75rem 0;';
        label.textContent = h.label;
        matrix.appendChild(label);

        let score = 0;
        for (let i = 0; i < 7; i++) {
            const isDone = habitState[h.id] && habitState[h.id][i];
            if (isDone) score++;
            const tile = document.createElement('div');
            tile.className = `habit-tile ${isDone ? 'on' : 'off'}`;
            tile.onclick = () => {
                if (!habitState[h.id]) habitState[h.id] = Array(7).fill(false);
                habitState[h.id][i] = !habitState[h.id][i];
                saveFullPlanner();
            };
            matrix.appendChild(tile);
        }
        const scoreEl = document.createElement('div');
        scoreEl.style.cssText = 'text-align:center;font-weight:800;color:#333;align-self:center;';
        scoreEl.textContent = `${Math.round((score/7)*100)}%`;
        matrix.appendChild(scoreEl);
    });
}

function debouncedSavePlanner() {
    const status = document.getElementById('planner-save-status');
    if (status) {
        status.innerHTML = '<span class="material-symbols-outlined" style="font-size: 14px; margin-right: 4px; animation: spin 1s linear infinite;">sync</span> Saving...';
    }
    clearTimeout(plannerSaveTimer);
    plannerSaveTimer = setTimeout(() => saveFullPlanner(), 1000);
}

async function saveFullPlanner() {
    const weekKey = getMonday(currentWeekOffset);
    const data = {
        goals: {
            g1: document.getElementById('pl-goal-1')?.value || '',
            g2: document.getElementById('pl-goal-2')?.value || '',
            g3: document.getElementById('pl-goal-3')?.value || '',
            ai: document.getElementById('pl-ai-goal')?.value || ''
        },
        priorities: {
            p1: document.getElementById('pl-p1')?.value || '',
            p2: document.getElementById('pl-p2')?.value || '',
            p3: document.getElementById('pl-p3')?.value || ''
        },
        review: {
            win: document.getElementById('pl-win')?.value || '',
            fail: document.getElementById('pl-fail')?.value || '',
            change: document.getElementById('pl-change')?.value || ''
        },
        reflection: document.getElementById('pl-reflection')?.value || '',
        habits: habitState
    };
    await fetch(`/api/planner/${weekKey}`, {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(data)
    });
    
    const status = document.getElementById('planner-save-status');
    if (status) {
        status.innerHTML = '<span class="material-symbols-outlined" style="font-size: 14px; margin-right: 4px; color: var(--green);">cloud_done</span> Saved';
        setTimeout(() => {
            if (status.innerHTML.includes('Saved')) {
                status.innerHTML = '<span class="material-symbols-outlined" style="font-size: 14px; margin-right: 4px;">cloud_done</span> All changes saved';
            }
        }, 3000);
    }
}

async function toggleHabitMobile(habitId, dayIdx) {
    if (!habitState[habitId]) habitState[habitId] = Array(7).fill(false);
    habitState[habitId][dayIdx] = !habitState[habitId][dayIdx];
    await saveFullPlanner();
    loadPlanner(); // Re-render to show checkmark
}


function moveWeek(delta) { currentWeekOffset += delta; loadPlanner(); }

function getMonday(offset) {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1) + (offset * 7);
    return new Date(new Date().setDate(diff)).toISOString().split('T')[0];
}

// ═══════════════════════════════════════════════════════
// GUIDES — Todoist & Automation
// ═══════════════════════════════════════════════════════
function loadTodoistGuide() {
    const c = document.getElementById('view-todoist');
    c.innerHTML = `
    <div class="anim-slide" style="max-width:900px;margin:0 auto;">
        <div class="mb-12">
            <span class="label-overline mb-2" style="display:block;">Integration Protocol</span>
            <h1 style="font-size:3rem;">Todoist Setup</h1>
        </div>
        
        <div class="card-elevated" style="padding:3rem;">
            <div style="display:grid;grid-template-columns:1.5fr 1fr;gap:4rem;">
                <div>
                    <h3 class="label-sm mb-6">Setup Checklist</h3>
                    <div style="display:flex;flex-direction:column;gap:1.5rem;">
                        <div style="display:flex;gap:1.5rem;align-items:flex-start;">
                            <div class="pill pill-green" style="width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;">1</div>
                            <div>
                                <h4 style="font-weight:800;margin-bottom:0.25rem;">Label Migration</h4>
                                <p style="font-size:0.8rem;color:var(--outline);">Create labels: @P1, @P2, @P3, @Waiting, @BrainDump</p>
                            </div>
                        </div>
                        <div style="display:flex;gap:1.5rem;align-items:flex-start;">
                            <div class="pill" style="width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;">2</div>
                            <div>
                                <h4 style="font-weight:800;margin-bottom:0.25rem;">Project Hierarchy</h4>
                                <p style="font-size:0.8rem;color:var(--outline);">Structure: Work / Personal / AI-Lab / Side-Quests</p>
                            </div>
                        </div>
                        <div style="display:flex;gap:1.5rem;align-items:flex-start;">
                            <div class="pill" style="width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;">3</div>
                            <div>
                                <h4 style="font-weight:800;margin-bottom:0.25rem;">API Integration</h4>
                                <p style="font-size:0.8rem;color:var(--outline);">Hook Todoist into this Hub via the Automation guide.</p>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="card-recessed" style="padding:2rem;background:var(--surface-container-low);">
                    <span class="label-sm" style="display:block;margin-bottom:1rem;">Strategic Value</span>
                    <p style="font-size:0.875rem;line-height:1.6;color:var(--on-surface-variant);">Todoist serves as the <span style="font-weight:800;color:#333;">external memory</span> of this system.</p>
                </div>
            </div>
        </div>
    </div>`;
}

function loadAutomationGuide() {
    const c = document.getElementById('view-automation');

    c.innerHTML = `
    <div class="anim-slide px-4 md:px-0 pb-24">
        <div class="mb-10 md:mb-12">
            <span class="label-overline">Infrastructure Protocol</span>
            <h1 class="text-3xl md:text-5xl font-black tracking-tighter text-primary">Automation</h1>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div class="neumorphic-raised bg-white p-8 rounded-3xl">
                <div class="flex items-center gap-4 mb-6">
                    <span class="material-symbols-outlined text-primary text-3xl">hub</span>
                    <h3 class="text-lg font-black text-on-surface">Make.com Logic</h3>
                </div>
                <p class="text-xs text-outline leading-relaxed mb-6 font-medium">Use Make.com to sync Todoist tasks to this hub's SQLite database via the provided API endpoints. This ensures a seamless flow of data across your productivity stack.</p>
                <div class="pill pill-green inline-block text-[9px] font-black tracking-widest">ENDPOINT READY</div>
            </div>
            <div class="neumorphic-raised bg-white p-8 rounded-3xl">
                <div class="flex items-center gap-4 mb-6">
                    <span class="material-symbols-outlined text-primary text-3xl">robot_2</span>
                    <h3 class="text-lg font-black text-on-surface">WhatsApp AI</h3>
                </div>
                <p class="text-xs text-outline leading-relaxed mb-6 font-medium">Bridge WhatsApp to OpenAI to Todoist. Capture voice notes as tasks automatically using the built-in transcription engine.</p>
                <div class="pill inline-block text-[9px] font-black tracking-widest">DOCS PENDING</div>
            </div>
        </div>
    </div>`;
}




// ═══════════════════════════════════════════════════════
// LEADS — CRM Pipeline (Tabular)
// ═══════════════════════════════════════════════════════
async function loadLeads() {
    let leads = [];
    try { const r = await fetch('/api/leads'); leads = await r.json(); } catch(e) {}
    const leadsQuickLinks = renderQuickAccessLinks([
        { view: 'tasks', icon: 'checklist', label: 'Tasks' },
        { view: 'schedule', icon: 'calendar_today', label: 'Schedule' },
        { view: 'team-grid', icon: 'table_chart', label: 'Team Radar' }
    ]);
    
    const SC = {
        'New': { color: '#3182ce', label: 'LEAD IDENTIFIED' },
        'Contacted': { color: '#d97706', label: 'ENGAGED' },
        'Qualified': { color: '#7c3aed', label: 'QUALIFIED' },
        'Proposal': { color: '#0891b2', label: 'PROPOSAL SENT' },
        'Won': { color: '#16a34a', label: 'WON' },
        'Lost': { color: '#dc2626', label: 'LOST' }
    };
    
    const totalValue = leads.reduce((s,l)=>s+(l.value||0),0);
    const c = document.getElementById('view-leads');
    
    if (isMobile()) {
        const leadCards = leads.length === 0
            ? `<div class="card-recessed p-8 text-center color-outline">No leads yet — click <strong>+ New Lead</strong></div>`
            : leads.map(l => {
                const conf = SC[l.status] || { color: '#888', label: l.status.toUpperCase() };
                const safeN = (l.name || '').replace(/'/g, "\\'");
                const safeC = (l.company || '').replace(/'/g, "\\'");
                return `
                <div class="card-elevated mb-4" style="border-left: 4px solid ${conf.color}; padding: 1.25rem;">
                    <div class="flex-between mb-2">
                        <div style="font-weight:800; font-size:1.1rem; color:#333;">${escapeHTML(l.name)}</div>
                        <span class="pill" style="background:${conf.color}15; color:${conf.color}; font-size:0.55rem;">${conf.label}</span>
                    </div>
                    <div style="font-size:0.8rem; color:var(--outline); margin-bottom:0.75rem;">${l.company || 'Private Entity'}</div>
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-bottom:1rem;">
                        <div>
                            <span class="label-overline" style="font-size:0.5rem; opacity:0.6;">Category</span>
                            <div style="font-size:0.75rem; font-weight:700;">${l.category || 'General'}</div>
                        </div>
                        <div>
                            <span class="label-overline" style="font-size:0.5rem; opacity:0.6;">Identified By</span>
                            <div style="font-size:0.75rem; font-weight:700;">${l.identified_by || 'Unknown'}</div>
                        </div>
                    </div>
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-bottom:1rem;">
                        <div>
                            <span class="label-overline" style="font-size:0.5rem; opacity:0.6;">Valuation</span>
                            <div style="font-weight:800; color:var(--primary);">₹${(l.value || 0).toLocaleString()}</div>
                        </div>
                        <div>
                            <span class="label-overline" style="font-size:0.5rem; opacity:0.6;">Contact</span>
                            <div style="font-size:0.75rem;">${l.phone || l.email || '—'}</div>
                        </div>
                    </div>
                    <div style="display:flex; gap:0.5rem;">
                        <button class="btn-primary" style="flex:1; font-size:0.65rem; padding:0.5rem;" onclick="convertLeadToTask('${l.id}','${safeN}','${safeC}')">TO TASK</button>
                        <button class="btn-ghost" style="flex:1; font-size:0.65rem; padding:0.5rem;" onclick="showLeadEditModal('${l.id}')">EDIT</button>
                        <button class="btn-icon" style="color:var(--error);" onclick="deleteLead('${l.id}')"><span class="material-symbols-outlined" style="font-size:18px;">delete</span></button>
                    </div>
                </div>`;
            }).join('');

        c.innerHTML = `
        <div class="anim-slide">
            <div class="view-header" style="margin-bottom:2rem;">
                <div class="view-header-content">
                    <span class="label-overline">Pipeline</span>
                    <h1 style="font-size:2.2rem; margin:0;">Leads CRM</h1>
                    <p style="font-size:0.75rem; color:var(--outline);">Total: ₹${totalValue.toLocaleString()}</p>
                </div>
                <button class="btn-primary" onclick="showLeadForm()">+ NEW</button>
            </div>
            ${leadsQuickLinks}
            <div id="leads-container">${leadCards}</div>
        </div>`;
    } else {
        const rows = leads.length === 0
            ? `<tr><td colspan="9" style="text-align:center;padding:3rem;color:var(--outline);">No leads yet — click <strong>+ New Lead</strong></td></tr>`
            : leads.map((l,i)=>{
                const conf = SC[l.status] || { color: '#888', label: l.status.toUpperCase() };
                const safeN=(l.name||'').replace(/'/g,"\\'");
                const safeC=(l.company||'').replace(/'/g,"\\'");
                const statusOpts=Object.keys(SC).map(s=>`<option value="${s}"${l.status===s?' selected':''}>${s}</option>`).join('');
                return `
                <tr onmouseover="this.style.background='var(--surface-container-low)'" onmouseout="this.style.background=''">
                    <td style="padding:0.7rem 0.6rem;color:var(--outline);font-size:0.68rem;font-weight:700;text-align:center;">${i+1}</td>
                    <td style="padding:0.7rem 0.4rem;"><div style="font-weight:800;color:#333;">${escapeHTML(l.name) || ''}</div>${l.email?`<div style="font-size:0.62rem;color:var(--outline);">${l.email}</div>`:''}</td>
                    <td style="padding:0.7rem 0.4rem;color:var(--on-surface-variant);">${l.company||'—'}</td>
                    <td style="padding:0.7rem 0.4rem;color:var(--outline);font-size:0.75rem;">${l.category||'—'}</td>
                    <td style="padding:0.7rem 0.4rem;color:var(--outline);font-size:0.75rem;">${l.identified_by||'—'}</td>
                    <td style="padding:0.7rem 0.4rem;"><select class="inline-select" style="background:${conf.color}18;color:${conf.color};border:1px solid ${conf.color}55;border-radius:99px;padding:0.22rem 0.55rem;font-size:0.63rem;font-weight:800;" onchange="updateLeadStatus('${l.id}',this.value)">${statusOpts}</select></td>
                    <td style="padding:0.7rem 0.4rem;font-weight:800;color:var(--primary);">₹${(l.value||0).toLocaleString()}</td>
                    <td style="padding:0.7rem 0.4rem;max-width:160px;"><div style="font-size:0.7rem;color:var(--outline);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${escapeHTML(l.notes) || ''}">${l.notes||'—'}</div></td>
                    <td style="padding:0.7rem 0.4rem;"><div style="display:flex;gap:0.3rem;">
                        <button onclick="convertLeadToTask('${l.id}','${safeN}','${safeC}')" style="font-size:0.6rem;padding:0.25rem 0.5rem;border-radius:5px;border:1px solid var(--outline-variant);background:none;cursor:pointer;color:var(--primary);font-family:inherit;font-weight:700;">→ Task</button>
                        <button onclick="deleteLead('${l.id}')" style="font-size:0.6rem;padding:0.25rem 0.5rem;border-radius:5px;border:1px solid var(--error-container);background:none;cursor:pointer;color:var(--error);font-family:inherit;font-weight:700;">✕</button>
                    </div></td>
                </tr>`;
            }).join('');

        c.innerHTML = `<div class="anim-slide">
            <div class="view-header">
                <div class="view-header-content">
                    <span class="label-overline">Business Pipeline</span>
                    <h1 style="font-size:3rem;margin:0;">Leads CRM</h1>
                    <p style="color:var(--outline);font-size:0.82rem;margin-top:0.25rem;">${leads.length} contacts &nbsp;·&nbsp; ₹${totalValue.toLocaleString()} total</p>
                </div>
                <div class="view-header-actions">
                    <button class="btn-ghost" onclick="loadLeads()">↻ Refresh</button>
                    <button class="btn-primary" onclick="showLeadForm()">+ New Lead</button>
                </div>
            </div>
            ${leadsQuickLinks}
            <div class="card-elevated" style="padding:0; overflow:hidden;">
                <table class="team-table" style="font-size:0.82rem;"><thead><tr>
                    <th style="width:34px;">#</th><th style="min-width:140px;">Name</th>
                    <th>Company</th><th>Category</th><th>Identified By</th><th style="min-width:110px;">Stage</th>
                    <th>Value</th><th style="min-width:150px;">Notes</th><th style="width:120px;">Actions</th>
                </tr></thead><tbody>${rows}
                    <tr style="background:var(--surface-container-low);">
                        <td style="text-align:center;color:var(--outline);padding:0.5rem;">+</td>
                        <td colspan="8" style="padding:0.4rem;"><input class="inline-edit" placeholder="Quick-add — type name and press Enter..." style="width:100%;font-weight:700;" onkeydown="if(event.key==='Enter')quickAddLead(this)"></td>
                    </tr>
                </tbody></table>
            </div>
        </div>`;
    }
}

async function deleteLead(id) {
    if (!confirm('Abort this lead entity?')) return;
    const res = await fetch(`/api/leads/${id}`, { method: 'DELETE' });
    if (res.ok) {
        showToast('Lead purged from pipeline');
        loadLeads();
    }
}

async function convertLeadToTask(leadId, name, company) {
    const title = `Follow up with ${name} (${company || 'Lead'})`;
    const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            title: title,
            priority: 2,
            project: 'Growth',
            description: `Auto-generated follow-up for lead ID: ${leadId}`
        })
    });
    if (res.ok) {
        showToast('Lead converted to priority mission');
        navigate('tasks');
    }
}

async function showLeadEditModal(id) {
    // Fetch lead details first
    const r = await fetch('/api/leads');
    const leads = await r.json();
    const l = leads.find(item => item.id === id);
    if (!l) return;

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.onclick = (e) => e.target === overlay && overlay.remove();
    overlay.innerHTML = `
        <div class="modal-card anim-pop" style="max-width:500px;">
            <h3 class="mb-6">Refine Lead Intel</h3>
            <form onsubmit="handleLeadUpdate(event, '${id}')">
                <div class="mb-4">
                    <label class="label-sm">Name / Entity</label>
                    <input type="text" id="el-name" class="input-well w-full" value="${escapeHTML(l.name) || ''}" required>
                </div>
                <div class="mb-4">
                    <label class="label-sm">Organization</label>
                    <input type="text" id="el-company" class="input-well w-full" value="${escapeHTML(l.company) || ''}">
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;" class="mb-4">
                    <div>
                        <label class="label-sm">Valuation (₹)</label>
                        <input type="number" id="el-value" class="input-well w-full" value="${l.value || 0}">
                    </div>
                    <div>
                        <label class="label-sm">Pipeline Status</label>
                        <select id="el-status" class="input-well w-full">
                            <option value="New" ${l.status==='New'?'selected':''}>Lead Identified</option>
                            <option value="Contacted" ${l.status==='Contacted'?'selected':''}>Engaged</option>
                            <option value="Qualified" ${l.status==='Qualified'?'selected':''}>Qualified</option>
                            <option value="Proposal" ${l.status==='Proposal'?'selected':''}>Proposal Sent</option>
                            <option value="Won" ${l.status==='Won'?'selected':''}>Won</option>
                            <option value="Lost" ${l.status==='Lost'?'selected':''}>Lost</option>
                        </select>
                    </div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;" class="mb-4">
                    <div>
                        <label class="label-sm">Category</label>
                        <input type="text" id="el-category" class="input-well w-full" value="${escapeHTML(l.category) || ''}" placeholder="e.g. Real Estate">
                    </div>
                    <div>
                        <label class="label-sm">Source Link</label>
                        <input type="url" id="el-source-link" class="input-well w-full" value="${escapeHTML(l.source_link) || ''}" placeholder="https://...">
                    </div>
                </div>
                <div class="mb-4" style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                    <div>
                        <label class="label-sm">Source</label>
                        <select id="el-source" class="input-well w-full">
                            <option value="Direct" ${l.source==='Direct'?'selected':''}>Direct</option>
                            <option value="Referral" ${l.source==='Referral'?'selected':''}>Referral</option>
                            <option value="Website" ${l.source==='Website'?'selected':''}>Website</option>
                            <option value="Social Media" ${l.source==='Social Media'?'selected':''}>Social Media</option>
                            <option value="Event" ${l.source==='Event'?'selected':''}>Event</option>
                        </select>
                    </div>
                    <div>
                        <label class="label-sm">Identified By</label>
                        <select id="el-identified-by" class="input-well w-full">
                            <option value="">Unknown</option>
                            ${collaboratorsList.map(m=>`<option value="${escapeHTML(m)}"${l.identified_by===m?' selected':''}>${escapeHTML(m)}</option>`).join('')}
                        </select>
                    </div>
                </div>
                <div class="mb-6">
                    <label class="label-sm">Internal Notes</label>
                    <textarea id="el-notes" class="input-well w-full" style="height:80px;">${escapeHTML(l.notes) || ''}</textarea>
                </div>
                <div style="display:flex;gap:1rem;">
                    <button type="submit" class="btn-primary" style="flex:2;">Update Intel</button>
                    <button type="button" class="btn-ghost" style="flex:1;" onclick="this.closest('.modal-overlay').remove()">Dismiss</button>
                </div>
            </form>
        </div>
    `;
    document.body.appendChild(overlay);
}

async function handleLeadUpdate(e, id) {
    e.preventDefault();
    const data = {
        name: document.getElementById('el-name').value,
        company: document.getElementById('el-company').value,
        value: parseFloat(document.getElementById('el-value').value),
        status: document.getElementById('el-status').value,
        category: document.getElementById('el-category').value,
        source: document.getElementById('el-source').value,
        source_link: document.getElementById('el-source-link').value,
        identified_by: document.getElementById('el-identified-by').value,
        notes: document.getElementById('el-notes').value
    };
    const res = await fetch(`/api/leads/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    if (res.ok) {
        showToast('Lead protocol updated');
        document.querySelector('.modal-overlay').remove();
        loadLeads();
    }
}

async function updateLeadStatus(id, status) {
    await fetch(`/api/leads/${id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({status}) });
    showToast(`Stage updated to ${status}`);
}

async function quickAddLead(input) {
    if (!input.value.trim()) return;
    const res = await fetch('/api/leads', { method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ name:input.value.trim(), company:'', status:'New', value:0 }) });
    if (res.ok) { showToast('Lead added'); loadLeads(); } else input.focus();
}

// ═══════════════════════════════════════════════════════
// TEAM RADAR — Notion-style Grid with Assignee
// ═══════════════════════════════════════════════════════
const WORK_LABELS = ['Deep Work', 'Admin', 'Meeting', 'Planning', 'Review', 'Client'];
let currentTeamFilter = '';
let currentTeamSearch = '';

async function loadTeamGrid(searchTerm = '') {
    currentTeamSearch = searchTerm;
    let tasks = [];
    try { const r = await fetch(`/api/tasks?show=all&day_type=${currentScheduleMode || 'all'}`); tasks = await r.json(); } catch(e) {}

    const c = document.getElementById('view-team-grid');
    if (!c) return;

    const filterEl = document.getElementById('tg-filter-member');
    if (filterEl) currentTeamFilter = filterEl.value;

    let filteredTasks = tasks.filter(t => currentTeamFilter === '' || (t.assignee || 'Unassigned') === currentTeamFilter);
    if (currentTeamSearch) {
        filteredTasks = filteredTasks.filter(t => t.title.toLowerCase().includes(currentTeamSearch.toLowerCase()) || (t.project || '').toLowerCase().includes(currentTeamSearch.toLowerCase()));
    }
    
    const pending = filteredTasks.filter(t=>!t.completed);
    const done = filteredTasks.filter(t=>t.completed);
    const P_COLORS = {1:'#dc2626',2:'#2563eb',3:'#d97706',4:'#a0aec0'};
    const teamQuickLinks = renderQuickAccessLinks([
        { view: 'tasks', icon: 'checklist', label: 'Tasks' },
        { view: 'schedule', icon: 'calendar_today', label: 'Schedule' },
        { view: 'leads', icon: 'person_add', label: 'Leads' }
    ]);

    const makeRow = t => {
        const pc = P_COLORS[t.priority]||'#888';
        const assignee = t.assignee || 'Unassigned';
        const description = t.description || "No description provided for this objective.";
        
        // Use checklist from task data or default
        let workLog = [];
        try {
            workLog = t.checklist ? JSON.parse(t.checklist) : [
                { label: "Initialize Protocol", done: true },
                { label: "Define Parameters", done: t.completed },
                { label: "Final Validation", done: false }
            ];
        } catch(e) {
            workLog = [{ label: "Error parsing checklist", done: false }];
        }

        return `
        <tr class="${t.completed?'row-done':''}" onmouseover="this.style.background='var(--surface-container-low)'" onmouseout="this.style.background=''">
            <td style="text-align:center; width:60px;">
                <div class="toggle-switch ${t.completed?'on':''}" style="transform:scale(0.7); margin:0 auto;" onclick="toggleTask(${t.id},${!t.completed}).then(loadTeamGrid)">
                    <div class="toggle-knob"></div>
                </div>
            </td>
            <td style="min-width:250px;">
                <div style="display:flex;flex-direction:column;gap:0.15rem;">
                    <input class="inline-edit" value="${t.title.replace(/"/g,'&quot;')}" style="font-weight:700;font-size:0.8rem;color:var(--primary);" onblur="updateTaskInline(${t.id},'title',this.value)">
                    <button onclick="toggleTaskDetails(${t.id})" style="background:none;border:none;color:var(--outline);font-size:0.6rem;font-weight:800;cursor:pointer;text-align:left;padding:0;width:fit-content;opacity:0.6;letter-spacing:0.05em;">＋ MISSION LOG</button>
                </div>
            </td>
            <td style="width:80px; font-size:0.75rem; font-weight:700;">
                ${t.poms_done || 0}/${t.poms_target || 1}
            </td>
            <td style="width:150px;">
                <input class="inline-edit" value="${t.project||'General'}" style="font-size:0.75rem;font-weight:700;color:var(--tertiary);" onblur="updateTaskInline(${t.id},'project',this.value)">
            </td>
            <td style="width:100px;">
                <select class="inline-select" style="background:${pc}12;color:${pc};border:1px solid ${pc}33;border-radius:99px;padding:0.2rem 0.5rem;font-size:0.6rem;font-weight:800;width:fit-content;" onchange="updateTaskInline(${t.id},'priority',this.value)">
                    ${[1,2,3,4].map(p=>`<option value="${p}"${t.priority===p?' selected':''}>P${p}</option>`).join('')}
                </select>
            </td>
            <td style="width:160px;">
                <select class="inline-select" style="font-size:0.75rem;font-weight:700;color:var(--on-surface-variant);background:none;border:none;width:100%;" onchange="updateTaskAssignee(${t.id},this.value)">
                    <option value="">Unassigned</option>
                    ${collaboratorsList.map(m=>`<option value="${escapeHTML(m)}"${assignee===m?' selected':''}>${escapeHTML(m)}</option>`).join('')}
                </select>
            </td>
            <td style="width:130px; font-size:0.75rem; font-weight:600; color:var(--outline);">
                <input type="date" class="inline-edit" value="${t.due_date||''}" style="width:100%;" onchange="updateTaskInline(${t.id},'due_date',this.value)">
            </td>
            <td style="width:120px;">
                <select class="inline-select" style="font-size:0.7rem;font-weight:700;color:var(--outline);background:none;border:none;" onchange="updateTaskInline(${t.id},'recurring',this.value)">
                    <option value="" ${!t.recurring?'selected':''}>Once</option>
                    <option value="daily" ${t.recurring==='daily'?'selected':''}>Daily</option>
                    <option value="weekly" ${t.recurring==='weekly'?'selected':''}>Weekly</option>
                </select>
            </td>
            <td style="width:120px;">
                <select class="inline-select" style="font-size:0.7rem;font-weight:700;color:${t.is_private?'var(--error)':'var(--primary)'};background:none;border:none;" onchange="updateTaskInline(${t.id},'is_private',this.value === 'true')">
                    <option value="true" ${t.is_private?'selected':''}>Private</option>
                    <option value="false" ${!t.is_private?'selected':''}>Shared</option>
                </select>
            </td>
            <td style="width:100px; text-align:center;">
                <span style="display:inline-flex; align-items:center; justify-content:center; gap:0.4rem; width:80px; padding:0.25rem 0; border-radius:99px; font-size:0.6rem; font-weight:900; letter-spacing:0.05em; background:${t.completed?'#16a34a12':'#2563eb10'}; color:${t.completed?'#16a34a':'#2563eb'}; border:1px solid ${t.completed?'#16a34a22':'#2563eb18'}; text-transform:uppercase;">
                    <span style="width:6px; height:6px; border-radius:50%; background:currentColor;"></span>
                    ${t.completed?'Done':'Active'}
                </span>
            </td>
            <td style="width:60px; text-align:center;">
                <button onclick="deleteTask(${t.id})" style="background:none;border:none;cursor:pointer;color:var(--outline-variant);display:flex;align-items:center;justify-content:center;margin:0 auto;transition:color 0.15s;" onmouseover="this.style.color='var(--error)'" onmouseout="this.style.color='var(--outline-variant)'">
                    <span class="material-symbols-outlined" style="font-size:18px;">delete</span>
                </button>
            </td>
        </tr>
        <tr id="details-${t.id}" class="hidden" style="background:var(--surface-container-lowest);">
            <td></td>
            <td colspan="6" style="padding:1.5rem;">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:2rem;">
                    <div>
                        <h5 class="label-overline mb-2" style="font-size:0.55rem;">Description</h5>
                        <textarea class="input-recessed" style="width:100%;height:80px;font-size:0.8rem;padding:0.75rem;line-height:1.5;" onblur="updateTaskInline(${t.id},'description',this.value)">${description}</textarea>
                    </div>
                    <div>
                        <h5 class="label-overline mb-2" style="font-size:0.55rem;">Work Log / Checklist</h5>
                        <div style="display:flex;flex-direction:column;gap:0.5rem;">
                            ${workLog.map((item, idx) => `
                                <div style="display:flex;align-items:center;gap:0.75rem;cursor:pointer;" onclick="toggleChecklistItem(${t.id}, ${idx})">
                                    <div style="width:14px;height:14px;border:1.5px solid ${item.done?'var(--primary)':'var(--outline-variant)'};border-radius:3px;display:flex;align-items:center;justify-content:center;background:${item.done?'var(--primary)':'none'};">
                                        ${item.done?'<span class="material-symbols-outlined" style="font-size:10px;color:white;font-weight:800;">check</span>':''}
                                    </div>
                                    <span style="font-size:0.75rem;color:${item.done?'var(--outline)':'#333'};text-decoration:${item.done?'line-through':'none'};font-weight:600;">${item.label}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            </td>
        </tr>`;
    };

    c.innerHTML = `
    <div class="anim-slide">
        <div class="view-header" style="${isMobile() ? 'text-align:center; align-items:center;' : ''}">
            <div class="view-header-content" style="${isMobile() ? 'align-items:center; display:flex; flex-direction:column;' : ''}">
                <span class="label-overline">Collaborative Intelligence</span>
                <h1 style="font-size:3rem;margin:0;">Team Radar</h1>
                <p class="text-sm text-outline mt-2">${pending.length} active missions &nbsp;·&nbsp; ${done.length} completed</p>
            </div>
            <div class="view-header-actions" style="${isMobile() ? 'flex-direction:column; width:100%;' : ''}">
                <div class="input-well" style="width:${isMobile() ? '100%' : '300px'};">
                    <span class="material-symbols-outlined">search</span>
                    <input type="text" class="input-recessed" placeholder="Search mission..." oninput="loadTeamGrid(this.value)" value="${currentTeamSearch}">
                </div>
                <div style="display:flex; gap:0.5rem; width:${isMobile() ? '100%' : 'auto'};">
                    <select id="tg-filter-member" class="input-well" style="font-weight:700; border:none; background:var(--surface-container); flex:1;" onchange="loadTeamGrid(currentTeamSearch)">
                        <option value=""${currentTeamFilter===''?' selected':''}>All Units</option>
                        ${collaboratorsList.map(m=>`<option value="${escapeHTML(m)}"${currentTeamFilter===m?' selected':''}>${escapeHTML(m)}</option>`).join('')}
                    </select>
                    <button class="btn-ghost" onclick="openModal('share')">
                        <span class="material-symbols-outlined">share</span>
                    </button>
                    <button class="btn-primary" onclick="showAddTeamTaskModal()" style="${isMobile() ? 'flex:1;' : ''}">
                        <span class="material-symbols-outlined">add</span> NEW TASK
                    </button>
                </div>
            </div>
        </div>
        ${teamQuickLinks}

        <div class="team-table-wrapper">
            <table class="team-table" style="min-width: 1250px;">
                <thead>
                    <tr>
                        <th style="width:60px;"></th>
                        <th style="min-width:250px;">Objective</th>
                        <th style="width:80px;">🍅 Poms</th>
                        <th style="width:150px;">Project</th>
                        <th style="width:100px;">Priority</th>
                        <th style="width:160px;">Assignee</th>
                        <th style="width:130px;">Due Date</th>
                        <th style="width:120px;">Recurring</th>
                        <th style="width:120px;">Visibility</th>
                        <th style="width:100px;">Status</th>
                        <th style="width:60px;">Del</th>
                    </tr>
                </thead>
                <tbody id="team-grid-body">
                    ${filteredTasks.map(makeRow).join('')}
                    <tr>
                        <td class="py-4 px-6"></td>
                        <td colspan="9" class="py-4 px-6">
                            <input class="w-full bg-transparent border-none font-bold text-sm focus:ring-0 placeholder:text-outline-variant" 
                                   placeholder="+ Add new mission — press Enter..." 
                                   onkeydown="if(event.key==='Enter')addNewTeamTask(this)">
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>`;

}

async function updateTaskAssignee(id, assignee) {
    await fetch(`/api/tasks/${id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({assignee}) });
    showToast(`Assigned to ${assignee||'no one'}`);
    if (assignee) {
        const body = currentUserMatchesAssignee(assignee)
            ? 'A task has been assigned directly to you.'
            : `Task responsibility moved to ${assignee}.`;
        playAlertChime(currentUserMatchesAssignee(assignee) ? [659, 784, 988] : [587, 659], 0.16);
        await sendBrowserNotification('Task assignment updated', {
            body,
            tag: `assignment-local-${id}`,
            vibrate: currentUserMatchesAssignee(assignee) ? [180, 100, 180] : [120]
        });
        if (currentUserMatchesAssignee(assignee)) {
            triggerDeviceVibration([180, 100, 180]);
        }
    }
    fetchNotifications({ notifyFresh: true });
}

async function addNewTeamTask(input) {
    if (!input.value.trim()) return;
    const defaultAssignee = currentTeamFilter ? currentTeamFilter : '';
    const res = await fetch('/api/tasks', { method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ 
            title:input.value.trim(), 
            project:'General', 
            priority:2, 
            assignee:defaultAssignee,
            is_private: false 
        }) 
    });
    if (res.ok) { showToast('Shared task added'); loadTeamGrid(currentTeamSearch); } else input.focus();
}

function showAddTeamTaskModal() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
        <div class="modal-card anim-pop" style="max-width:480px;">
            <h3 class="mb-6">Deploy Objective</h3>
            <form onsubmit="handleTeamTaskSubmit(event)" style="display:flex;flex-direction:column;gap:1.25rem;">
                <div>
                    <label style="font-size:0.75rem;font-weight:700;color:var(--outline);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.4rem;display:block;">Objective Title *</label>
                    <input class="input-recessed" style="width:100%;padding:0.75rem 1rem;border:1px solid var(--outline-variant);border-radius:var(--radius-sm);font-weight:600;" type="text" id="tt-title" placeholder="e.g. Redesign Landing Page" required>
                </div>
                <div>
                    <label style="font-size:0.75rem;font-weight:700;color:var(--outline);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.4rem;display:block;">Description / Mission Parameters</label>
                    <textarea class="input-recessed" style="width:100%;padding:0.75rem 1rem;border:1px solid var(--outline-variant);border-radius:var(--radius-sm);font-weight:600;resize:vertical;" id="tt-description" placeholder="Describe the objective protocol..." rows="3"></textarea>
                </div>
                <div style="display:grid;grid-template-columns: ${isMobile() ? '1fr' : '1fr 1fr'};gap:1.25rem;">
                    <div>
                        <label style="font-size:0.75rem;font-weight:700;color:var(--outline);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.4rem;display:block;">Project</label>
                        <input class="input-recessed" style="width:100%;padding:0.75rem 1rem;border:1px solid var(--outline-variant);border-radius:var(--radius-sm);font-weight:600;" type="text" id="tt-project" placeholder="e.g. Marketing">
                    </div>
                    <div>
                        <label style="font-size:0.75rem;font-weight:700;color:var(--outline);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.4rem;display:block;">Assignee</label>
                        <select class="input-recessed" style="width:100%;padding:0.75rem 1rem;border:1px solid var(--outline-variant);border-radius:var(--radius-sm);font-weight:600;" id="tt-assignee">
                            <option value="">Unassigned</option>
                            ${collaboratorsList.map(m=>`<option value="${escapeHTML(m)}">${escapeHTML(m)}</option>`).join('')}
                        </select>
                    </div>
                </div>
                <div style="display:grid;grid-template-columns: ${isMobile() ? '1fr' : '1fr 1fr'};gap:1.25rem;">
                    <div>
                        <label style="font-size:0.75rem;font-weight:700;color:var(--outline);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.4rem;display:block;">Priority Level</label>
                        <select class="input-recessed" style="width:100%;padding:0.75rem 1rem;border:1px solid var(--outline-variant);border-radius:var(--radius-sm);font-weight:600;" id="tt-priority">
                            <option value="1">P1 — Critical</option>
                            <option value="2" selected>P2 — High</option>
                            <option value="3">P3 — Medium</option>
                            <option value="4">P4 — Low</option>
                        </select>
                    </div>
                    <div>
                        <label style="font-size:0.75rem;font-weight:700;color:var(--outline);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.4rem;display:block;">Visibility</label>
                        <select class="input-recessed" style="width:100%;padding:0.75rem 1rem;border:1px solid var(--outline-variant);border-radius:var(--radius-sm);font-weight:600;" id="tt-visibility">
                            <option value="true">🔒 Private</option>
                            <option value="false" selected>🌐 Shared</option>
                        </select>
                    </div>
                </div>
                <div style="display:flex;gap:1rem;margin-top:1rem;">
                    <button type="submit" class="btn-primary" style="flex:1;padding:0.8rem;">Add Task</button>
                    <button type="button" class="btn-ghost" style="flex:1;padding:0.8rem;" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
                </div>
            </form>
        </div>`;
    document.body.appendChild(overlay);
}

async function handleTeamTaskSubmit(e) {
    e.preventDefault();
    const data = {
        title: document.getElementById('tt-title').value,
        description: document.getElementById('tt-description').value,
        project: document.getElementById('tt-project').value || 'General',
        assignee: document.getElementById('tt-assignee').value,
        is_private: document.getElementById('tt-visibility').value === 'true',
        priority: parseInt(document.getElementById('tt-priority').value)
    };
    const res = await fetch('/api/tasks', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
    if (res.ok) { 
        showToast(data.is_private ? 'Private task saved' : 'Task added to radar'); 
        document.querySelector('.modal-overlay')?.remove(); 
        if (currentPage === 'team-grid') loadTeamGrid(); 
        if (currentPage === 'task-hub') loadTaskHub();
        loadTasks();
    }
}

function showLeadForm() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
        <div class="modal-card anim-pop" style="max-width:550px;">
            <h3 class="mb-6">Add New Contact</h3>
            <form onsubmit="handleLeadSubmit(event)" style="display:flex;flex-direction:column;gap:1.25rem;">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.25rem;">
                    <div>
                        <label style="font-size:0.75rem;font-weight:700;color:var(--outline);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.4rem;display:block;">Contact Name *</label>
                        <input class="input-recessed" style="width:100%;padding:0.75rem 1rem;border:1px solid var(--outline-variant);border-radius:var(--radius-sm);font-weight:600;" type="text" id="ld-name" placeholder="e.g. Jane Doe" required>
                    </div>
                    <div>
                        <label style="font-size:0.75rem;font-weight:700;color:var(--outline);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.4rem;display:block;">Company</label>
                        <input class="input-recessed" style="width:100%;padding:0.75rem 1rem;border:1px solid var(--outline-variant);border-radius:var(--radius-sm);font-weight:600;" type="text" id="ld-company" placeholder="e.g. Acme Corp">
                    </div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.25rem;">
                    <div>
                        <label style="font-size:0.75rem;font-weight:700;color:var(--outline);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.4rem;display:block;">Email Address</label>
                        <input class="input-recessed" style="width:100%;padding:0.75rem 1rem;border:1px solid var(--outline-variant);border-radius:var(--radius-sm);font-weight:600;" type="email" id="ld-email" placeholder="jane@example.com">
                    </div>
                    <div>
                        <label style="font-size:0.75rem;font-weight:700;color:var(--outline);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.4rem;display:block;">Phone Number</label>
                        <input class="input-recessed" style="width:100%;padding:0.75rem 1rem;border:1px solid var(--outline-variant);border-radius:var(--radius-sm);font-weight:600;" type="text" id="ld-phone" placeholder="+1 (555) 000-0000">
                    </div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.25rem;">
                    <div>
                        <label style="font-size:0.75rem;font-weight:700;color:var(--outline);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.4rem;display:block;">Pipeline Stage</label>
                        <select class="input-recessed" style="width:100%;padding:0.75rem 1rem;border:1px solid var(--outline-variant);border-radius:var(--radius-sm);font-weight:600;" id="ld-status">
                            <option value="New">New</option><option value="Contacted">Contacted</option>
                            <option value="Qualified">Qualified</option><option value="Proposal">Proposal</option>
                            <option value="Won">Won</option><option value="Lost">Lost</option>
                        </select>
                    </div>
                    <div>
                        <label style="font-size:0.75rem;font-weight:700;color:var(--outline);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.4rem;display:block;">Estimated Value (₹)</label>
                        <input class="input-recessed" style="width:100%;padding:0.75rem 1rem;border:1px solid var(--outline-variant);border-radius:var(--radius-sm);font-weight:600;" type="number" id="ld-value" placeholder="50000" step="100">
                    </div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.25rem;">
                    <div>
                        <label style="font-size:0.75rem;font-weight:700;color:var(--outline);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.4rem;display:block;">Category</label>
                        <input class="input-recessed" style="width:100%;padding:0.75rem 1rem;border:1px solid var(--outline-variant);border-radius:var(--radius-sm);font-weight:600;" type="text" id="ld-category" placeholder="e.g. Real Estate">
                    </div>
                    <div>
                        <label style="font-size:0.75rem;font-weight:700;color:var(--outline);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.4rem;display:block;">Source Link</label>
                        <input class="input-recessed" style="width:100%;padding:0.75rem 1rem;border:1px solid var(--outline-variant);border-radius:var(--radius-sm);font-weight:600;" type="url" id="ld-source-link" placeholder="https://...">
                    </div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.25rem;">
                    <div>
                        <label style="font-size:0.75rem;font-weight:700;color:var(--outline);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.4rem;display:block;">Source</label>
                        <select class="input-recessed" style="width:100%;padding:0.75rem 1rem;border:1px solid var(--outline-variant);border-radius:var(--radius-sm);font-weight:600;" id="ld-source">
                            <option value="Direct">Direct</option>
                            <option value="Referral">Referral</option>
                            <option value="Website">Website</option>
                            <option value="Social Media">Social Media</option>
                            <option value="Event">Event</option>
                        </select>
                    </div>
                    <div>
                        <label style="font-size:0.75rem;font-weight:700;color:var(--outline);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.4rem;display:block;">Identified By</label>
                        <select class="input-recessed" style="width:100%;padding:0.75rem 1rem;border:1px solid var(--outline-variant);border-radius:var(--radius-sm);font-weight:600;" id="ld-identified-by">
                            <option value="">Unknown</option>
                            ${collaboratorsList.map(m=>`<option value="${escapeHTML(m)}">${escapeHTML(m)}</option>`).join('')}
                        </select>
                    </div>
                </div>
                    <div>
                        <label style="font-size:0.75rem;font-weight:700;color:var(--outline);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.4rem;display:block;">Additional Notes</label>
                        <textarea class="input-recessed" style="width:100%;padding:0.75rem 1rem;border:1px solid var(--outline-variant);border-radius:var(--radius-sm);font-weight:600;resize:vertical;" id="ld-notes" placeholder="Any specific requirements or details..." rows="3"></textarea>
                    </div>
                </div>
                <div style="display:flex;gap:1rem;margin-top:1rem;">
                    <button type="submit" class="btn-primary" style="flex:1;padding:0.8rem;">Save Lead</button>
                    <button type="button" class="btn-ghost" style="flex:1;padding:0.8rem;" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
                </div>
            </form>
        </div>`;
    document.body.appendChild(overlay);
}

async function handleLeadSubmit(e) {
    e.preventDefault();
    const data = {
        name: document.getElementById('ld-name').value,
        company: document.getElementById('ld-company').value,
        email: document.getElementById('ld-email').value,
        phone: document.getElementById('ld-phone').value,
        status: document.getElementById('ld-status').value,
        value: parseFloat(document.getElementById('ld-value').value || 0),
        category: document.getElementById('ld-category').value,
        source: document.getElementById('ld-source').value,
        source_link: document.getElementById('ld-source-link').value,
        identified_by: document.getElementById('ld-identified-by').value,
        notes: document.getElementById('ld-notes').value
    };
    const res = await fetch('/api/leads', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
    if (res.ok) { showToast('Lead saved'); document.querySelector('.modal-overlay')?.remove(); loadLeads(); }
}

async function deleteLead(id) {
    if (!confirm('Archive this lead?')) return;
    await fetch(`/api/leads/${id}`, { method:'DELETE' });
    loadLeads();
}

async function convertLeadToTask(leadId, leadName, company) {
    await fetch('/api/tasks', { method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ title:`Follow up with ${leadName} (${company})`, priority:2, project:'Leads' }) });
    await fetch(`/api/leads/${leadId}`, { method:'PUT', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ status:'Qualified', notes:'Converted to task.' }) });
    showToast('Lead → Task created'); loadLeads();
}


function toggleTaskDetails(id) {
    const el = document.getElementById(`details-${id}`);
    if (el) el.classList.toggle('hidden');
}

async function toggleChecklistItem(taskId, itemIdx) {
    // Find task in local state
    let task = tasks.find(t => t.id === taskId);
    if (!task) return;
    
    let checklist = task.checklist ? JSON.parse(task.checklist) : [
        { label: "Initialize Protocol", done: true },
        { label: "Define Parameters", done: task.completed },
        { label: "Final Validation", done: false }
    ];
    
    checklist[itemIdx].done = !checklist[itemIdx].done;
    
    await updateTaskInline(taskId, 'checklist', JSON.stringify(checklist));
    
    // Refresh current view
    const activeView = document.querySelector('.nav-item.active').getAttribute('data-view');
    if (activeView === 'tasks') loadTasks();
    else if (activeView === 'team-grid') loadTeamGrid();
}

async function updateTaskInline(id, field, value) {
    const body = {};
    body[field] = (field === 'priority' ? parseInt(value) : value);
    await fetch(`/api/tasks/${id}`, { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body) });
    showToast('Grid synced');
}



// ═══════════════════════════════════════════════════════
// SETTINGS — Workspace Configuration
// ═══════════════════════════════════════════════════════
function loadSettings() {
    const c = document.getElementById('view-settings');
    const settings = {
        darkMode: localStorage.getItem('at-dark-mode') !== 'false',
        audio: localStorage.getItem('at-audio') !== 'false',
        rollover: localStorage.getItem('at-rollover') !== 'false'
    };
    
    c.innerHTML = `
    <div class="anim-slide px-4 md:px-0 pb-24">
        <div class="mb-10 md:mb-12">
            <span class="label-overline">System Configuration</span>
            <h1 class="text-3xl md:text-5xl font-black tracking-tighter text-primary">Settings</h1>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8 md:gap-12">
            <div class="lg:col-span-1">
                <p class="text-xs md:text-sm text-outline leading-relaxed font-medium">Manage your executive workspace protocols and personal preferences. All changes are persisted to your local core for zero-latency operation.</p>
            </div>
            
            <div class="lg:col-span-2 space-y-8 md:space-y-12">
                <!-- Profile Section -->
                <div class="neumorphic-raised rounded-3xl p-6 md:p-10 bg-white">
                    <h3 class="label-sm mb-8 text-primary">Account Profile</h3>
                    <div class="flex items-center gap-6">
                        <div class="w-16 h-16 md:w-20 md:h-20 rounded-full bg-primary flex items-center justify-center text-white text-2xl md:text-3xl font-black">
                            ${(currentUser?.display_name || 'E')[0].toUpperCase()}
                        </div>
                        <div class="overflow-hidden">
                            <div class="text-xl md:text-2xl font-black tracking-tight text-on-surface truncate">${currentUser?.display_name || 'Executive User'}</div>
                            <div class="text-xs md:text-sm text-outline mt-1 font-medium truncate">${currentUser?.email || 'N/A'}</div>
                        </div>
                    </div>
                </div>

                <!-- Protocols Section -->
                <div class="space-y-6">
                    <h3 class="label-sm px-2 text-primary">Workspace Protocols</h3>
                    
                    <div class="flex items-center justify-between neumorphic-inset bg-surface-container-low p-6 md:p-8 rounded-[2rem]">
                        <div class="pr-4">
                            <h4 class="font-bold text-on-surface text-sm md:text-base">Dark Mode Protocol</h4>
                            <p class="text-[10px] md:text-xs text-outline mt-1">Optimize visual output for low-light environments.</p>
                        </div>
                        <div class="toggle-switch ${settings.darkMode?'on':''}" onclick="toggleSetting('at-dark-mode', this)">
                            <div class="toggle-knob shadow-md"></div>
                        </div>
                    </div>

                    <div class="flex items-center justify-between neumorphic-inset bg-surface-container-low p-6 md:p-8 rounded-[2rem]">
                        <div class="pr-4">
                            <h4 class="font-bold text-on-surface text-sm md:text-base">Focus Audio Feedback</h4>
                            <p class="text-[10px] md:text-xs text-outline mt-1">Auditory cues for session transitions.</p>
                        </div>
                        <div class="toggle-switch ${settings.audio?'on':''}" onclick="toggleSetting('at-audio', this)">
                            <div class="toggle-knob shadow-md"></div>
                        </div>
                    </div>

                    <div class="flex items-center justify-between neumorphic-inset bg-surface-container-low p-6 md:p-8 rounded-[2rem]">
                        <div class="pr-4">
                            <h4 class="font-bold text-on-surface text-sm md:text-base">Automatic Task Rollover</h4>
                            <p class="text-[10px] md:text-xs text-outline mt-1">Auto-migrate missions to the next cycle.</p>
                        </div>
                        <div class="toggle-switch ${settings.rollover?'on':''}" onclick="toggleSetting('at-rollover', this)">
                            <div class="toggle-knob shadow-md"></div>
                        </div>
                    </div>
                </div>

                <!-- Footer Actions -->
                <div class="pt-8 border-t border-surface-container-high px-2">
                    <button class="btn-ghost !text-error !border-error/20 hover:!bg-error/5 w-full md:w-auto" onclick="handleLogout()">De-authenticate Workspace</button>
                    <p class="mt-6 text-[10px] text-outline opacity-40 font-bold uppercase tracking-widest">CommandFlow Workspace v4.0.0</p>
                </div>
            </div>
        </div>
    </div>`;

}

function toggleSetting(key, el) {
    const isOn = el.classList.contains('on');
    el.classList.toggle('on');
    localStorage.setItem(key, !isOn);
    showToast('Protocol updated');
    
    // Immediate effects
    if (key === 'at-dark-mode') applyDarkMode(!isOn);
}

function loadSettingsState() {
    const darkMode = localStorage.getItem('at-dark-mode') === 'true';
    if (darkMode) applyDarkMode(true);
}

function applyDarkMode(on) {
    if (on) {
        document.documentElement.style.setProperty('--background', '#0f172a');
        document.documentElement.style.setProperty('--surface', '#1e293b');
        document.documentElement.style.setProperty('--surface-container', '#334155');
        document.documentElement.style.setProperty('--surface-container-low', '#1e293b');
        document.documentElement.style.setProperty('--on-surface', '#f8fafc');
        document.documentElement.style.setProperty('--on-surface-variant', '#cbd5e1');
        document.documentElement.style.setProperty('--primary', '#38bdf8');
        document.documentElement.style.setProperty('--primary-dim', '#0ea5e9');
        document.documentElement.style.setProperty('--on-primary', '#ffffff');
    } else {
        document.documentElement.style.removeProperty('--background');
        document.documentElement.style.removeProperty('--surface');
        document.documentElement.style.removeProperty('--surface-container');
        document.documentElement.style.removeProperty('--surface-container-low');
        document.documentElement.style.removeProperty('--on-surface');
        document.documentElement.style.removeProperty('--on-surface-variant');
        document.documentElement.style.removeProperty('--primary');
        document.documentElement.style.removeProperty('--primary-dim');
        document.documentElement.style.removeProperty('--on-primary');
    }
}

async function deleteTask(id) {
    if (!confirm('Abort this objective?')) return;
    await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
    loadTeamGrid();
}

// ═══════════════════════════════════════════════════════
// INVITE CENTER — Workspace Access
// ═══════════════════════════════════════════════════════
async function loadInvites(tab = 'received') {
    const c = document.getElementById('view-invites');
    let items = [];
    try { 
        const r = await fetch('/api/invites'); 
        const data = await r.json(); 
        items = tab === 'received' ? (data.received || []) : (data.sent || []);
    } catch(e) { console.error(e); }

    const sectionMap = {
        'task-hub': 'Mission Matrix',
        'team-grid': 'Team Radar',
        'tracker': 'Velocity Tracker',
        'leads': 'Business Pipeline',
        'schedule': 'Shared Schedule'
    };

    if (isMobile()) {
        const inviteCards = items.length === 0
            ? `<div class="card-recessed p-8 text-center color-outline">No invitations found.</div>`
            : items.map(i => {
                const isReceived = tab === 'received';
                const sender = isReceived ? i.sender_id : i.recipient_email;
                const sectionName = sectionMap[i.section] || 'Full Access';
                
                return `
                <div class="card-elevated mb-4" style="border-left: 4px solid ${i.status==='accepted'?'#16a34a':'var(--primary)'}; padding: 1.25rem;">
                    <div class="flex-between mb-3">
                        <div style="font-weight:800; font-size:0.9rem; color:#333; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${sender}</div>
                        <span class="pill ${i.status==='accepted'?'pill-green':(i.status==='pending'?'pill-amber':'pill-red')}" style="font-size:0.55rem;">${i.status.toUpperCase()}</span>
                    </div>
                    <div style="font-size:0.7rem; color:var(--outline); margin-bottom:1rem;">Access: <span style="font-weight:700; color:var(--primary);">${sectionName}</span></div>
                    
                    <div style="display:flex; gap:0.5rem; justify-content:flex-end;">
                        ${isReceived && i.status === 'pending' ? `
                            <button class="btn-primary" style="padding:0.4rem 1rem; font-size:0.65rem;" onclick="acceptInvite(${i.id},'${i.section}')">ACCEPT</button>
                            <button class="btn-ghost" style="padding:0.4rem 1rem; font-size:0.65rem; color:var(--error);" onclick="rejectInvite(${i.id})">REJECT</button>
                        ` : ''}
                        ${!isReceived ? `
                            <button class="btn-icon" onclick="deleteInvite(${i.id})" style="color:var(--error);"><span class="material-symbols-outlined" style="font-size:18px;">delete</span></button>
                        ` : ''}
                    </div>
                </div>`;
            }).join('');

        c.innerHTML = `
        <div class="anim-slide">
            <div class="view-header" style="margin-bottom:2rem;">
                <div class="view-header-content">
                    <span class="label-overline">Access</span>
                    <h1 style="font-size:2.2rem; margin:0;">Invite Center</h1>
                </div>
                <button class="btn-primary" onclick="showInviteModal()">+ INVITE</button>
            </div>
            
            <div class="tab-container mb-6">
                <button class="tab-btn ${tab==='received'?'active':''}" onclick="loadInvites('received')">Received</button>
                <button class="tab-btn ${tab==='sent'?'active':''}" onclick="loadInvites('sent')">Sent</button>
            </div>
            
            <div id="invites-container">${inviteCards}</div>
        </div>`;
    } else {
        c.innerHTML = `
        <div class="anim-slide">
            <div class="view-header">
                <div class="view-header-content">
                    <span class="label-overline">Access Management</span>
                    <h1 style="font-size:3rem; margin:0;">Invite Center</h1>
                    <p style="color:var(--outline);font-size:0.9rem;margin-top:0.5rem;">Manage workspace permissions and team access.</p>
                </div>
                <div class="view-header-actions">
                    <button class="btn-primary" onclick="showInviteModal()">+ SEND INVITE</button>
                </div>
            </div>

            <div class="tab-container mb-8" style="max-width:400px;">
                <button class="tab-btn ${tab==='received'?'active':''}" onclick="loadInvites('received')">Received</button>
                <button class="tab-btn ${tab==='sent'?'active':''}" onclick="loadInvites('sent')">Sent</button>
            </div>

            <div class="card-elevated" style="padding:0;overflow:hidden;">
                <table class="team-table">
                    <thead><tr>
                        <th style="padding:1rem;">${tab==='received'?'Sender':'Recipient'}</th>
                        <th>Access Section</th>
                        <th>Status</th>
                        <th>Actions</th>
                    </tr></thead>
                    <tbody>
                        ${items.map(i => `
                            <tr onmouseover="this.style.background='var(--surface-container-low)'" onmouseout="this.style.background=''">
                                <td style="padding:1rem;font-weight:700;">${tab==='received'?i.sender_id:i.recipient_email}</td>
                                <td style="font-size:0.75rem;font-weight:800;color:var(--tertiary);text-transform:uppercase;">
                                    ${sectionMap[i.section] || 'Full Access'}
                                </td>
                                <td>
                                    <span class="pill ${i.status==='accepted'?'pill-green':(i.status==='pending'?'pill-amber':'pill-red')}">
                                        ${i.status.toUpperCase()}
                                    </span>
                                </td>
                                <td>
                                    ${tab === 'received' && i.status === 'pending' ? `
                                        <button class="btn-primary" style="padding:0.3rem 0.8rem;font-size:0.6rem;" onclick="acceptInvite(${i.id},'${i.section}')">Accept</button>
                                        <button class="btn-ghost" style="padding:0.3rem 0.8rem;font-size:0.6rem;color:var(--error);" onclick="rejectInvite(${i.id})">Reject</button>
                                    ` : ''}
                                    ${tab === 'sent' ? `
                                        <button class="btn-icon" onclick="deleteInvite(${i.id})" style="color:var(--error);"><span class="material-symbols-outlined" style="font-size:18px;">delete</span></button>
                                    ` : ''}
                                </td>
                            </tr>
                        `).join('')}
                        ${items.length === 0 ? '<tr><td colspan="4" style="text-align:center;padding:3rem;color:var(--outline);">No invitations found.</td></tr>' : ''}
                    </tbody>
                </table>
            </div>
        </div>`;
    }
}

async function acceptInvite(id, section) {
    const res = await fetch(`/api/invites/${id}/accept`, { method: 'PUT' });
    if (res.ok) {
        showToast(`Access granted to ${section.toUpperCase()}`);
        loadInvites('received');
    }
}

async function rejectInvite(id) {
    if(!confirm('Reject this invitation?')) return;
    await fetch(`/api/invites/${id}/reject`, { method: 'PUT' });
    loadInvites('received');
}

async function deleteInvite(id) {
    if(!confirm('Revoke this invitation?')) return;
    await fetch(`/api/invites/${id}`, { method: 'DELETE' });
    loadInvites('sent');
}

function showInviteModal() {
    openModal('share');
}

async function submitInvite() {
    const data = {
        email: document.getElementById('share-email').value,
        section: document.getElementById('share-section').value,
        role: document.getElementById('share-role').value
    };
    if (!data.email) { showToast('Email required'); return; }
    
    const res = await fetch('/api/invites', { 
        method:'POST', 
        headers:{'Content-Type':'application/json'}, 
        body:JSON.stringify(data) 
    });
    if (res.ok) {
        showToast('Workspace sharing invite sent');
        closeModal('share');
        loadInvites('sent');
    } else {
        const err = await res.json();
        showToast(err.error || 'Failed to share', 'error');
    }
}

function closeModal(id) {
    const el = document.getElementById(`modal-${id}`);
    if (el) el.classList.add('hidden');
}

function openModal(id) {
    const el = document.getElementById(`modal-${id}`);
    if (el) el.classList.remove('hidden');
}

// ── Schedule Mode Management ───────────────────────────
window.showManageModesModal = function() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.onclick = (e) => e.target === overlay && overlay.remove();
    
    const generateModeRows = () => {
        return scheduleModes.map((m, i) => `
            <div class="mode-row card-recessed mb-2" style="padding:1rem; display:grid; grid-template-columns:1fr 1fr; gap:0.5rem;" data-index="${i}">
                <div>
                    <label class="label-sm">Slug (ID) *</label>
                    <input type="text" class="input-well w-full mode-slug" value="${m.slug}" placeholder="e.g. college" required>
                </div>
                <div>
                    <label class="label-sm">Label *</label>
                    <input type="text" class="input-well w-full mode-label" value="${m.label}" placeholder="e.g. College Day" required>
                </div>
                <div>
                    <label class="label-sm">Icon (Google Font)</label>
                    <input type="text" class="input-well w-full mode-icon" value="${m.icon}" placeholder="e.g. school">
                </div>
                <div>
                    <label class="label-sm">Active Days (0=Sun, 6=Sat)</label>
                    <input type="text" class="input-well w-full mode-days" value="${m.days_of_week ? m.days_of_week.join(',') : ''}" placeholder="e.g. 1,2,3">
                </div>
                <div style="grid-column: 1 / -1; display:flex; justify-content:flex-end;">
                    <button type="button" class="btn-ghost text-red" onclick="this.closest('.mode-row').remove()" style="font-size:0.75rem; padding:0.25rem 0.5rem;">Delete</button>
                </div>
            </div>
        `).join('');
    };

    overlay.innerHTML = `
        <div class="modal-card anim-pop" style="max-width:600px; max-height:90vh; overflow-y:auto; display:flex; flex-direction:column;">
            <div class="flex-between mb-4">
                <h3 style="font-size:1.5rem;">Manage Schedule Modes</h3>
                <button type="button" class="btn-icon" onclick="this.closest('.modal-overlay').remove()"><span class="material-symbols-outlined">close</span></button>
            </div>
            <p class="text-xs text-outline mb-4">Customize your day types (e.g. College, Remote, Rest). The system will auto-select the mode based on the "Active Days" (0 = Sunday, 1 = Monday, etc.).</p>
            
            <form onsubmit="handleSaveModes(event); this.closest('.modal-overlay').remove();" style="display:flex; flex-direction:column; gap:1rem;">
                <div id="modes-list-container" style="display:flex; flex-direction:column; gap:0.5rem;">
                    ${generateModeRows()}
                </div>
                <button type="button" class="btn-ghost mb-4" onclick="addModeRow()" style="border: 1px dashed var(--outline-variant);">
                    <span class="material-symbols-outlined">add</span> Add Mode
                </button>
                <div style="display:flex;gap:1rem;margin-top:1rem;">
                    <button type="button" class="btn-ghost flex-1" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
                    <button type="submit" class="btn-primary flex-1">Save Configurations</button>
                </div>
            </form>
        </div>
    `;
    document.body.appendChild(overlay);
};

window.addModeRow = function() {
    const container = document.getElementById('modes-list-container');
    const row = document.createElement('div');
    row.className = 'mode-row card-recessed mb-2 anim-slide';
    row.style.cssText = 'padding:1rem; display:grid; grid-template-columns:1fr 1fr; gap:0.5rem;';
    row.innerHTML = `
        <div>
            <label class="label-sm">Slug (ID) *</label>
            <input type="text" class="input-well w-full mode-slug" value="new_mode" required>
        </div>
        <div>
            <label class="label-sm">Label *</label>
            <input type="text" class="input-well w-full mode-label" value="New Mode" required>
        </div>
        <div>
            <label class="label-sm">Icon (Google Font)</label>
            <input type="text" class="input-well w-full mode-icon" value="event">
        </div>
        <div>
            <label class="label-sm">Active Days (0=Sun, 6=Sat)</label>
            <input type="text" class="input-well w-full mode-days" value="" placeholder="e.g. 1,2,3">
        </div>
        <div style="grid-column: 1 / -1; display:flex; justify-content:flex-end;">
            <button type="button" class="btn-ghost text-red" onclick="this.closest('.mode-row').remove()" style="font-size:0.75rem; padding:0.25rem 0.5rem;">Delete</button>
        </div>
    `;
    container.appendChild(row);
};

window.handleSaveModes = async function(e) {
    e.preventDefault();
    const rows = document.querySelectorAll('.mode-row');
    const modes = Array.from(rows).map(row => {
        const daysRaw = row.querySelector('.mode-days').value;
        const days = daysRaw ? daysRaw.split(',').map(d => parseInt(d.trim())).filter(n => !isNaN(n)) : [];
        return {
            slug: row.querySelector('.mode-slug').value.trim(),
            label: row.querySelector('.mode-label').value.trim(),
            icon: row.querySelector('.mode-icon').value.trim(),
            days_of_week: days
        };
    });

    try {
        const res = await fetch('/api/schedule/modes', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ modes })
        });
        if (res.ok) {
            scheduleModes = await res.json();
            showToast('Schedule Modes Configured');
            if (!scheduleModes.find(m => m.slug === currentScheduleMode)) {
                initializeCurrentScheduleMode();
            }
            if (currentPage === 'schedule') {
                renderPage('schedule');
            } else {
                renderScheduleHeader();
            }
        }
    } catch (e) {
        showToast('Error saving modes');
    }
};

window.addNewTask = async function() {
    const titleInput = document.getElementById('new-task-input');
    const dayInput = document.getElementById('new-task-day');
    const priorityInput = document.getElementById('new-task-priority');
    
    if (!titleInput || !titleInput.value.trim()) return;

    const payload = {
        title: titleInput.value.trim(),
        priority: priorityInput ? parseInt(priorityInput.value) : 4,
        day_type: dayInput ? dayInput.value : 'any'
    };

    try {
        const res = await fetch('/api/tasks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (res.ok) {
            titleInput.value = '';
            showToast('Objective Added');
            if (typeof loadTasks === 'function') loadTasks();
        } else {
            showToast('Failed to add objective');
        }
    } catch (e) {
        showToast('Error adding objective');
    }
};

window.showAddTaskModal = function() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    
    const activeFilterMode = window.taskHubMode || (typeof currentScheduleMode !== 'undefined' ? currentScheduleMode : 'any');
    const modesHtml = (typeof scheduleModes !== 'undefined' && scheduleModes) 
        ? scheduleModes.map(m => `<option value="${m.slug}" ${activeFilterMode===m.slug?'selected':''}>${m.label}</option>`).join('')
        : '';
    
    overlay.innerHTML = `
        <div class="modal-card anim-pop" style="max-width:500px; width: 90%;">
            <div style="display:flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
                <h3 style="margin: 0; font-size: 1.5rem;">Deploy Objective</h3>
                <button class="btn-ghost" style="padding: 0; width: 32px; height: 32px;" onclick="this.closest('.modal-overlay').remove()">
                    <span class="material-symbols-outlined">close</span>
                </button>
            </div>
            
            <div style="display: flex; flex-direction: column; gap: 1rem;">
                <div>
                    <label class="label-sm mb-2" style="display:block;">Objective Title</label>
                    <input type="text" id="modal-task-title" class="input-well" style="width: 100%; padding: 0.8rem;" placeholder="E.g., Complete Phase 1 documentation" onkeydown="if(event.key==='Enter') submitModalTask(this)">
                </div>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                    <div>
                        <label class="label-sm mb-2" style="display:block;">Day Type</label>
                        <select id="modal-task-day" class="input-well" style="width: 100%; padding: 0.8rem;">
                            <option value="any">Any Day</option>
                            ${modesHtml}
                        </select>
                    </div>
                    <div>
                        <label class="label-sm mb-2" style="display:block;">Priority</label>
                        <select id="modal-task-priority" class="input-well" style="width: 100%; padding: 0.8rem;">
                            <option value="1">P1 - Critical</option>
                            <option value="2">P2 - Strategic</option>
                            <option value="3">P3 - Operational</option>
                            <option value="4" selected>P4 - Backlog</option>
                        </select>
                    </div>
                </div>

                <div>
                    <label class="label-sm mb-2" style="display:block;">Target Pomodoros (25m sessions)</label>
                    <div class="flex items-center gap-4">
                        <input type="range" id="modal-task-poms" min="1" max="10" value="1" class="flex-1" oninput="this.nextElementSibling.textContent = this.value">
                        <span class="text-lg font-bold" style="min-width: 2rem; text-align: center;">1</span>
                    </div>
                </div>
                
                <button class="btn-primary" style="margin-top: 1rem; width: 100%; padding: 1rem;" onclick="submitModalTask(this)">
                    INITIALIZE PROTOCOL
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(overlay);
    setTimeout(() => document.getElementById('modal-task-title')?.focus(), 100);
};

window.submitModalTask = async function(btn) {
    const overlay = btn.closest('.modal-overlay');
    const titleInput = overlay.querySelector('#modal-task-title');
    const dayInput = overlay.querySelector('#modal-task-day');
    const priorityInput = overlay.querySelector('#modal-task-priority');
    const pomsInput = overlay.querySelector('#modal-task-poms');
    
    if (!titleInput || !titleInput.value.trim()) return;

    const payload = {
        title: titleInput.value.trim(),
        priority: priorityInput ? parseInt(priorityInput.value) : 4,
        day_type: dayInput ? dayInput.value : 'any',
        poms_target: pomsInput ? parseInt(pomsInput.value) : 1
    };

    try {
        const res = await fetch('/api/tasks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (res.ok) {
            overlay.remove();
            showToast('Objective Added');
            if (typeof loadTasks === 'function') loadTasks();
        } else {
            showToast('Failed to add objective');
        }
    } catch (e) {
        showToast('Error adding objective');
    }
};

window.startFocusSession = function(id, title) {
    const overlay = document.querySelector('.modal-overlay');
    if (overlay) overlay.remove();
    
    if (typeof linkTaskToPom === 'function') {
        linkTaskToPom(id, title, 'task');
    } else {
        window.pomTaskId = `task_${id}`;
        window.pomTaskInput = title;
    }
    
    if (typeof navigate === 'function') {
        navigate('pomodoro');
        setTimeout(() => {
            if (typeof togglePom === 'function' && !pomIsRunning) togglePom();
        }, 300);
    }
};

window.addChecklistItem = async function(taskId) {
    const input = document.getElementById(`new-checklist-input-${taskId}`);
    if (!input) return;
    const label = input.value.trim();
    if (!label) return;

    const r = await fetch(`/api/tasks/${taskId}`);
    const task = await r.json();
    let checklist = [];
    try { checklist = task.checklist ? JSON.parse(task.checklist) : []; } catch(e) {}
    
    checklist.push({ label, done: false });
    
    await fetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ checklist: JSON.stringify(checklist) })
    });
    
    const overlay = document.querySelector('.modal-overlay');
    if (overlay) overlay.remove();
    showTaskDetailModal(taskId);
    
    if (typeof loadTasks === 'function' && currentPage === 'tasks') loadTasks();
    if (typeof loadTaskHub === 'function' && currentPage === 'task-hub') loadTaskHub();
};

// Instantly update timer visually when returning to the tab
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && typeof pomIsRunning !== 'undefined' && pomIsRunning) {
        if (typeof updatePomDisplay === 'function') {
            updatePomDisplay();
            // Also check if timer finished while away
            if (pomTimeLeft <= 0 && typeof completePom === 'function') {
                if (typeof pomTimer !== 'undefined' && pomTimer) {
                    clearInterval(pomTimer);
                    pomTimer = null;
                }
                completePom();
            } else if (typeof ensurePomTimerRunning === 'function') {
                ensurePomTimerRunning();
            }
        }
    }
});
