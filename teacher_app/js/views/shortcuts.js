/* ==========================================================================
   views/shortcuts.js — Standalone shortcuts screen (used by bottom-nav → ⚡).
   Simple grid of destinations: Portfolio · Reports · Reminders · Help.
   ========================================================================== */

(function (global) {
    'use strict';

    const TILES = [
        { icon: '📁', label: 'ملف الإنجاز', href: '#/portfolio' },
        { icon: '📊', label: 'التقارير',    href: '#/reports'   },
        { icon: '🔔', label: 'تذكيراتي',    href: '#/reminders' },
        { icon: '❓', label: 'المساعدة',    href: '#/help'      }
    ];

    async function render(container) {
        const teacher = await global.Auth.currentTeacher();
        if (!teacher) { global.location.hash = '#/login'; return; }

        container.innerHTML = `
            <div class="container">
                <div class="section-header" style="margin-top: var(--space-6);">
                    <h2 class="section-title">⚡ اختصارات سريعة</h2>
                </div>

                <div class="grid grid-4">
                    ${TILES.map((t) => `
                        <a href="${t.href}" class="shortcut-tile">
                            <span class="icon">${t.icon}</span>
                            <span class="label">${t.label}</span>
                        </a>
                    `).join('')}
                </div>
            </div>
        `;
    }

    global.ShortcutsView = { render };
})(window);
