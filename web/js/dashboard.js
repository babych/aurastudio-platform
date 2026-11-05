lucide.createIcons();

        let userObj = null;
        try { userObj = JSON.parse(localStorage.getItem('aurastudio_user') || 'null'); } catch(e){}

        let currentAdminToken = localStorage.getItem('aurastudio_google_token') || 
                                localStorage.getItem('aurastudio_admin_token') || 
                                (userObj && (userObj.is_admin || userObj.email?.includes('babych') || userObj.email?.includes('memory1024')) ? `admin_${userObj.id}` : '');
        let tgPollTimer = null;

        // Load config for Google GIS client ID
        async function loadConfig() {
            try {
                const res = await fetch('/api/config');
                const data = await res.json();
                if (data.status === 'success' && data.google_client_id) {
                    const el = document.getElementById('g_id_onload');
                    if (el) {
                        el.setAttribute('data-client_id', data.google_client_id);
                        el.setAttribute('data-auto_select', 'true');
                    }
                    if (window.google && window.google.accounts && window.google.accounts.id) {
                        window.google.accounts.id.initialize({
                            client_id: data.google_client_id,
                            callback: handleDashboardGoogleAuth,
                            auto_select: true
                        });
                        window.google.accounts.id.renderButton(
                            document.getElementById('googleBtnContainer'),
                            { theme: 'filled_black', size: 'large', width: 320, shape: 'rectangular' }
                        );
                        // Attempt silent one-tap / auto prompt for smooth re-authentication
                        if (!currentAdminToken) {
                            window.google.accounts.id.prompt();
                        }
                    }
                }
            } catch(e) {
                console.error('Config load failed:', e);
            }
        }
        loadConfig();

        function handleDashboardGoogleAuth(response) {
            if (response && response.credential) {
                currentAdminToken = response.credential;
                localStorage.setItem('aurastudio_google_token', response.credential);
                fetchStats();
            }
        }

        // Telegram Auth Flow
        async function startDashboardTelegramLogin() {
            try {
                const res = await fetch('/api/auth/telegram-session', { method: 'POST' });
                const data = await res.json();
                if (data.status === 'success') {
                    document.getElementById('tgQrImg').src = data.qr_url;
                    document.getElementById('tgDirectLink').href = data.deep_link;
                    document.getElementById('tgQrBox').classList.remove('hidden');

                    if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
                        window.open(data.deep_link, '_blank');
                    }

                    if (tgPollTimer) clearInterval(tgPollTimer);
                    tgPollTimer = setInterval(async () => {
                        try {
                            const pollRes = await fetch(`/api/auth/telegram-poll?session_code=${data.session_code}`);
                            const pollData = await pollRes.json();
                            if (pollData.status === 'success' && pollData.user) {
                                clearInterval(tgPollTimer);
                                currentAdminToken = `tg_${pollData.user.id || pollData.user.username}`;
                                localStorage.setItem('aurastudio_admin_token', currentAdminToken);
                                fetchStats();
                            }
                        } catch(e) {}
                    }, 1500);
                }
            } catch(e) {
                alert('Telegram login error: ' + e.message);
            }
        }

        function lockDashboard() {
            localStorage.removeItem('aurastudio_google_token');
            localStorage.removeItem('aurastudio_admin_token');
            currentAdminToken = '';
            document.getElementById('accessDeniedCard').classList.remove('hidden');
            document.getElementById('accessDeniedCard').classList.add('flex');
            document.getElementById('adminUserBadge').classList.add('hidden');
            document.getElementById('adminUserBadge').classList.remove('flex');
        }

        function openImageModal(src, caption) {
            if (!src || src === 'uploaded_image' || src === 'generated_image') return;
            const isVid = src.includes('.mp4') || src.startsWith('data:video');
            const imgEl = document.getElementById('modalImg');
            const vidEl = document.getElementById('modalVideo');
            if (isVid) {
                imgEl.classList.add('hidden');
                vidEl.src = src;
                vidEl.classList.remove('hidden');
            } else {
                if (vidEl) {
                    vidEl.pause();
                    vidEl.classList.add('hidden');
                }
                imgEl.src = src;
                imgEl.classList.remove('hidden');
            }
            document.getElementById('modalCaption').innerText = caption || '';
            document.getElementById('imageModal').classList.remove('hidden');
            document.getElementById('imageModal').classList.add('flex');
        }

        function closeImageModal() {
            const vidEl = document.getElementById('modalVideo');
            if (vidEl) vidEl.pause();
            document.getElementById('imageModal').classList.add('hidden');
            document.getElementById('imageModal').classList.remove('flex');
        }

        function formatDateTime(dateStr) {
            if (!dateStr) return '—';
            try {
                const s = dateStr.includes('Z') || dateStr.includes('+') ? dateStr : dateStr + 'Z';
                const d = new Date(s);
                return d.toLocaleString('uk-UA', { 
                    day: '2-digit', 
                    month: '2-digit', 
                    hour: '2-digit', 
                    minute: '2-digit', 
                    second: '2-digit' 
                });
            } catch(e) {
                return dateStr;
            }
        }

        function escapeHtml(str) {
            if (!str) return '';
            return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        }

        async function fetchStats(isManual = false) {
            const headerIcon = document.getElementById('headerRefreshIcon');
            const logsIcon = document.getElementById('refreshLogsIcon');
            if (isManual) {
                if (headerIcon) headerIcon.classList.add('animate-spin');
                if (logsIcon) logsIcon.classList.add('animate-spin');
            }
            try {
                const headers = { 'Content-Type': 'application/json' };
                if (currentAdminToken) {
                    headers['Authorization'] = `Bearer ${currentAdminToken}`;
                }

                const res = await fetch('/api/stats?_t=' + Date.now(), { headers, cache: 'no-store' });
                
                if (res.status === 401 || res.status === 403) {
                    document.getElementById('accessDeniedCard').classList.remove('hidden');
                    document.getElementById('accessDeniedCard').classList.add('flex');
                    if (currentAdminToken) {
                        document.getElementById('authErrorMsg').classList.remove('hidden');
                    }
                    return;
                }

                const data = await res.json();
                if (data.status === 'unauthorized') {
                    document.getElementById('accessDeniedCard').classList.remove('hidden');
                    document.getElementById('accessDeniedCard').classList.add('flex');
                    document.getElementById('authErrorMsg').classList.remove('hidden');
                    return;
                }

                // Authorized
                document.getElementById('accessDeniedCard').classList.add('hidden');
                document.getElementById('accessDeniedCard').classList.remove('flex');
                document.getElementById('authErrorMsg').classList.add('hidden');

                if (data.auth_user) {
                    document.getElementById('adminUserLabel').innerText = data.auth_user;
                    document.getElementById('adminUserBadge').classList.remove('hidden');
                    document.getElementById('adminUserBadge').classList.add('flex');
                }
                
                document.getElementById('statUsers').innerText = data.total_users || 0;
                document.getElementById('statGens').innerText = data.total_generations || 0;
                
                const errCount = data.total_errors || 0;
                const statErrEl = document.getElementById('statErrors');
                if (statErrEl) {
                    statErrEl.innerText = errCount;
                    if (errCount > 0) {
                        statErrEl.className = "text-3xl font-extrabold text-amber-400";
                    } else {
                        statErrEl.className = "text-3xl font-extrabold text-white";
                    }
                }

                const durEl = document.getElementById('statDuration');
                if (durEl) {
                    durEl.innerText = (data.avg_duration !== null && data.avg_duration !== undefined) ? `${data.avg_duration} s` : '—';
                }

                document.getElementById('gpuStatus').innerText = data.modal_status || "Modal A10G: READY";

                const tbody = document.getElementById('tasksTableBody');
                if (data.recent_tasks && data.recent_tasks.length > 0) {
                    tbody.innerHTML = data.recent_tasks.map(t => {
                        const hasInImg = t.input_img && (t.input_img.startsWith('data:') || t.input_img.startsWith('http') || t.input_img.startsWith('/'));
                        const hasOutImg = t.output_img && (t.output_img.startsWith('data:') || t.output_img.startsWith('http') || t.output_img.startsWith('/'));
                        const isVideo = hasOutImg && (t.output_img.includes('.mp4') || t.output_img.startsWith('data:video') || (t.preset && t.preset.includes('dance')));

                        const inputPreview = hasInImg 
                            ? `<div class="w-12 h-12 rounded-lg bg-gray-950 border border-gray-700 overflow-hidden flex items-center justify-center shadow"><img src="${t.input_img}" onclick="openImageModal('${t.input_img}', 'Original Input')" onerror="this.onerror=null; this.parentElement.innerHTML='<div class=\\\'w-12 h-12 rounded-lg bg-gray-900 border border-gray-800 flex items-center justify-center text-xs text-gray-500\\\'>🖼️</div>';" class="w-full h-full object-contain hover:scale-110 transition cursor-pointer"></div>`
                            : `<div class="w-12 h-12 rounded-lg bg-gray-900 border border-gray-800 flex items-center justify-center text-xs text-gray-500"><i data-lucide="image" class="w-5 h-5"></i></div>`;

                        let outputPreview = `<div class="w-12 h-12 rounded-lg bg-gray-900 border border-purple-500/20 flex items-center justify-center text-xs text-purple-400"><i data-lucide="sparkles" class="w-5 h-5"></i></div>`;
                        if (hasOutImg) {
                            outputPreview = isVideo 
                                ? `<div onclick="openImageModal('${t.output_img}', 'Video')" class="w-12 h-12 rounded-lg bg-purple-900/60 border border-purple-500/60 flex flex-col items-center justify-center text-purple-300 hover:scale-110 transition cursor-pointer shadow-lg shadow-purple-500/20"><i data-lucide="play-circle" class="w-6 h-6"></i></div>`
                                : `<div class="w-12 h-12 rounded-lg bg-gray-950 border border-purple-500/50 overflow-hidden flex items-center justify-center shadow-lg shadow-purple-500/20"><img src="${t.output_img}" onclick="openImageModal('${t.output_img}', 'AI Generated Result')" onerror="this.onerror=null; this.parentElement.innerHTML='<div class=\\\'w-12 h-12 rounded-lg bg-gray-900 border border-purple-500/20 flex items-center justify-center text-xs text-purple-400\\\'>✨</div>';" class="w-full h-full object-contain hover:scale-110 transition cursor-pointer"></div>`;
                        } else if (t.status === 'PROCESSING') {
                            outputPreview = `<div class="w-12 h-12 rounded-lg bg-indigo-950/60 border border-indigo-500/40 flex items-center justify-center text-indigo-400" title="В процесі генерації..."><div class="w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin"></div></div>`;
                        } else if (t.status === 'FAILED') {
                            outputPreview = `<div class="w-12 h-12 rounded-lg bg-red-950/40 border border-red-500/40 flex items-center justify-center text-xs text-red-400 font-bold" title="${escapeHtml(t.error_message || 'Збій генерації')}">❌</div>`;
                        } else if (t.status === 'PENDING') {
                            outputPreview = `<div class="w-12 h-12 rounded-lg bg-amber-950/40 border border-amber-500/40 flex items-center justify-center text-amber-400"><i data-lucide="clock" class="w-5 h-5"></i></div>`;
                        }

                        let statusBadge = `<span class="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">SUCCESS</span>`;
                        if (t.status === 'PROCESSING') {
                            statusBadge = `<span class="px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 flex items-center gap-1 w-fit"><span class="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse"></span>PROCESSING</span>`;
                        } else if (t.status === 'PENDING') {
                            statusBadge = `<span class="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">PENDING</span>`;
                        } else if (t.status === 'FAILED') {
                            statusBadge = `<span class="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/30">FAILED</span>`;
                        }

                        const createdFormatted = formatDateTime(t.created_at);
                        const durDisplay = (t.duration !== null && t.duration !== undefined && Number(t.duration) > 0)
                            ? `${Number(t.duration).toFixed(1)}s`
                            : (t.status === 'PROCESSING' ? '⏳ виконується...' : (t.status === 'PENDING' ? '⏳ в черзі' : (t.status === 'SUCCESS' ? '—' : '❌ збій')));

                        return `
                            <tr class="hover:bg-gray-900/40 transition">
                                <td class="py-3 px-4">
                                    <div class="font-medium text-white flex items-center gap-2">
                                        <div class="w-7 h-7 rounded-full bg-purple-600/30 text-purple-300 flex items-center justify-center text-xs font-bold uppercase">
                                            ${(t.user || 'U')[0]}
                                        </div>
                                        <span class="truncate max-w-[150px]">${t.user || 'Anonymous'}</span>
                                    </div>
                                    <span class="text-xs text-gray-500 font-mono">${t.id}</span>
                                </td>
                                <td class="py-3 px-4">${inputPreview}</td>
                                <td class="py-3 px-4">${outputPreview}</td>
                                <td class="py-3 px-4">
                                    <span class="font-medium text-purple-300 block">${t.preset || 'Custom'}</span>
                                    <span class="text-xs text-gray-500 truncate max-w-[200px] block">${escapeHtml(t.prompt || '')}</span>
                                    ${t.status === 'FAILED' && t.error_message ? `<span class="text-[10px] text-red-400 font-mono block mt-1 bg-red-950/60 border border-red-500/30 rounded px-1.5 py-0.5 truncate max-w-[240px]" title="${escapeHtml(t.error_message)}">❌ ${escapeHtml(t.error_message)}</span>` : ''}
                                </td>
                                <td class="py-3 px-4">${statusBadge}</td>
                                <td class="py-3 px-4">
                                    <div class="flex flex-col gap-0.5">
                                        <span class="text-xs font-mono text-white whitespace-nowrap">${createdFormatted}</span>
                                        <span class="text-[11px] font-mono ${t.status === 'SUCCESS' ? 'text-cyan-400' : (t.status === 'PROCESSING' ? 'text-indigo-400' : (t.status === 'PENDING' ? 'text-amber-400' : 'text-red-400'))} whitespace-nowrap">${durDisplay}</span>
                                    </div>
                                </td>
                            </tr>
                        `;
                    }).join('');
                    lucide.createIcons();
                } else {
                    tbody.innerHTML = `
                        <tr>
                            <td colspan="6" class="py-12 text-center text-gray-500">
                                <i data-lucide="inbox" class="w-8 h-8 mx-auto mb-2 text-gray-600"></i>
                                <span>Завдань ще немає. Завантажте перше фото через Telegram або Web!</span>
                            </td>
                        </tr>
                    `;
                    lucide.createIcons();
                }

                const errTbody = document.getElementById('errorsTableBody');
                const errBadge = document.getElementById('errorCountBadge');
                if (data.recent_errors && data.recent_errors.length > 0) {
                    if (errBadge) {
                        errBadge.innerText = `${data.recent_errors.length} помилок`;
                        errBadge.classList.remove('hidden');
                    }
                    errTbody.innerHTML = data.recent_errors.map(e => {
                        const dateStr = formatDateTime(e.created_at);
                        let badgeColor = "bg-red-500/10 text-red-400 border-red-500/30";
                        if (e.context === 'telegram_dance_video') badgeColor = "bg-amber-500/10 text-amber-400 border-amber-500/30";
                        else if (e.context === 'telegram_photo') badgeColor = "bg-cyan-500/10 text-cyan-400 border-cyan-500/30";
                        else if (e.context && e.context.includes('gpu')) badgeColor = "bg-purple-500/10 text-purple-400 border-purple-500/30";

                        return `
                            <tr class="hover:bg-red-950/20 transition">
                                <td class="py-3 px-4 font-mono text-[11px] text-gray-400 whitespace-nowrap">${dateStr}</td>
                                <td class="py-3 px-4 whitespace-nowrap">
                                    <span class="px-2.5 py-1 rounded-full text-[11px] font-semibold border ${badgeColor}">
                                        ${e.context || 'general'}
                                    </span>
                                </td>
                                <td class="py-3 px-4 text-xs font-mono text-red-300 break-all">${e.error_message}</td>
                                <td class="py-3 px-4 text-xs font-mono text-gray-400 whitespace-nowrap">${e.user_id ? `<span class="px-2 py-0.5 rounded bg-gray-900 border border-gray-800">${e.user_id}</span>` : '<span class="text-gray-600">—</span>'}</td>
                            </tr>
                        `;
                    }).join('');
                    lucide.createIcons();
                } else {
                    if (errBadge) errBadge.classList.add('hidden');
                    errTbody.innerHTML = `
                        <tr>
                            <td colspan="4" class="py-12 text-center text-gray-500">
                                <i data-lucide="check-circle" class="w-8 h-8 mx-auto mb-2 text-emerald-500"></i>
                                <span>Помилок немає! Все працює ідеально.</span>
                            </td>
                        </tr>
                    `;
                    lucide.createIcons();
                }
            } catch (e) {
                console.error('Failed to load stats:', e);
            } finally {
                if (headerIcon) headerIcon.classList.remove('animate-spin');
                if (logsIcon) logsIcon.classList.remove('animate-spin');
            }
        }

        fetchStats();
        setInterval(fetchStats, 15000);
