/**
 * ResearchMind - Frontend Application Logic
 * Connects to FastAPI Backend via Server-Sent Events (SSE) and REST APIs
 */

document.addEventListener('DOMContentLoaded', () => {
    // ── DOM References ────────────────────────────────────────────────────────
    const topicInput = document.getElementById('topicInput');
    const clearBtn = document.getElementById('clearBtn');
    const startPipelineBtn = document.getElementById('startPipelineBtn');
    const cancelPipelineBtn = document.getElementById('cancelPipelineBtn');
    const chipButtons = document.querySelectorAll('.chip-btn');

    const overallStatusBadge = document.getElementById('overallStatusBadge');
    const agentsCompleteCount = document.getElementById('agentsCompleteCount');
    const pipelineTimer = document.getElementById('pipelineTimer');
    const progressBarFill = document.getElementById('progressBarFill');

    const errorBanner = document.getElementById('errorBanner');
    const errorTitle = document.getElementById('errorTitle');
    const errorMessage = document.getElementById('errorMessage');
    const retryBtn = document.getElementById('retryBtn');
    const dismissErrorBtn = document.getElementById('dismissErrorBtn');

    const resultsSection = document.getElementById('resultsSection');
    const reportTopicTitle = document.getElementById('reportTopicTitle');
    const reportWordCount = document.getElementById('reportWordCount');
    const reportReadTime = document.getElementById('reportReadTime');
    const reportBody = document.getElementById('reportBody');
    const criticBody = document.getElementById('criticBody');
    const criticScoreVal = document.getElementById('criticScoreVal');
    const criticScoreBadge = document.getElementById('criticScoreBadge');

    const copyReportBtn = document.getElementById('copyReportBtn');
    const downloadPdfBtn = document.getElementById('downloadPdfBtn');
    const newRunBtn = document.getElementById('newRunBtn');

    const serverStatus = document.getElementById('serverStatus');
    const btnInfoModal = document.getElementById('btnInfoModal');
    const archModal = document.getElementById('archModal');
    const closeModalBtn = document.getElementById('closeModalBtn');
    const toastContainer = document.getElementById('toastContainer');

    // ── Base API URL (empty for same-origin, or customizable for separate backend) ──
    const API_BASE = window.API_BASE || '';

    // ── Application State ─────────────────────────────────────────────────────
    let eventSource = null;
    let timerInterval = null;
    let startTime = null;
    let isRunning = false;
    let currentTopic = '';
    let currentReportMarkdown = '';
    let currentCriticMarkdown = '';
    let completedSteps = 0;
    let failedStep = null;

    const STEPS_CONFIG = [
        { id: 'search', num: '01', title: 'Search Agent' },
        { id: 'reader', num: '02', title: 'Reader Agent' },
        { id: 'writer', num: '03', title: 'Writer Chain' },
        { id: 'critic', num: '04', title: 'Critic Chain' },
    ];

    // ── Initial Setup & Health Check ──────────────────────────────────────────
    checkBackendHealth();

    async function checkBackendHealth() {
        try {
            const res = await fetch(`${API_BASE}/api/health`);
            if (res.ok) {
                const data = await res.json();
                serverStatus.classList.remove('offline');
                serverStatus.querySelector('.status-label').textContent = `FastAPI v${data.version || '2.0'} Ready`;
            } else {
                throw new Error('Health check non-200');
            }
        } catch (e) {
            serverStatus.classList.add('offline');
            serverStatus.querySelector('.status-label').textContent = 'Backend Offline';
        }
    }

    // ── Input Controls & Suggestions ──────────────────────────────────────────
    topicInput.addEventListener('input', () => {
        clearBtn.style.display = topicInput.value.trim() ? 'block' : 'none';
    });

    clearBtn.addEventListener('click', () => {
        topicInput.value = '';
        clearBtn.style.display = 'none';
        topicInput.focus();
    });

    topicInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !isRunning) {
            e.preventDefault();
            startResearch();
        }
    });

    chipButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
            if (isRunning) return;
            const topic = btn.getAttribute('data-topic');
            topicInput.value = topic;
            clearBtn.style.display = 'block';
            topicInput.focus();
            showToast(`Selected topic: "${topic}"`, 'info');
        });
    });

    // ── Pipeline Stepper Reset & UI Helpers ────────────────────────────────────
    function resetPipelineUI() {
        completedSteps = 0;
        failedStep = null;
        progressBarFill.style.width = '0%';
        agentsCompleteCount.textContent = '0 / 4 agents complete';
        overallStatusBadge.textContent = 'Idle';
        overallStatusBadge.className = 'pipeline-stage-indicator';

        STEPS_CONFIG.forEach((s) => {
            const card = document.getElementById(`stepCard_${s.id}`);
            const badge = document.getElementById(`badge_${s.id}`);
            const duration = document.getElementById(`duration_${s.id}`);
            const liveMsg = document.getElementById(`liveMsg_${s.id}`);
            const accordion = document.getElementById(`accordion_${s.id}`);

            if (card) {
                card.className = 'step-card';
            }
            if (badge) {
                badge.className = 'step-badge status-waiting';
                badge.textContent = 'WAITING';
            }
            if (duration) {
                duration.style.display = 'none';
                duration.textContent = '0.0s';
            }
            if (liveMsg) {
                liveMsg.style.display = 'none';
            }
            if (accordion) {
                accordion.style.display = 'none';
                const content = accordion.querySelector('.accordion-content');
                if (content) content.style.display = 'none';
            }
        });

        hideError();
        resultsSection.style.display = 'none';
        reportBody.innerHTML = '';
        criticBody.innerHTML = '';
        currentReportMarkdown = '';
        currentCriticMarkdown = '';
    }

    function startTimer() {
        stopTimer();
        startTime = Date.now();
        pipelineTimer.textContent = '0.0s elapsed';
        timerInterval = setInterval(() => {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            pipelineTimer.textContent = `${elapsed}s elapsed`;
        }, 100);
    }

    function stopTimer() {
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
    }

    function updateProgressBar(percent) {
        progressBarFill.style.width = `${Math.min(100, Math.max(0, percent))}%`;
    }

    // ── Pipeline Execution via Server-Sent Events (SSE) ───────────────────────
    startPipelineBtn.addEventListener('click', () => {
        if (!isRunning) startResearch();
    });

    cancelPipelineBtn.addEventListener('click', () => {
        if (isRunning) stopResearch('Pipeline cancelled by user.');
    });

    function startResearch() {
        const topic = topicInput.value.trim();
        if (!topic) {
            topicInput.focus();
            showToast('Please enter a research topic first.', 'error');
            return;
        }

        currentTopic = topic;
        isRunning = true;
        resetPipelineUI();

        // Update Button States
        startPipelineBtn.disabled = true;
        startPipelineBtn.innerHTML = `
            <span class="btn-icon">⏳</span>
            <span class="btn-text">Agents Collaborating…</span>
        `;
        cancelPipelineBtn.style.display = 'inline-flex';
        topicInput.disabled = true;

        overallStatusBadge.textContent = 'Running';
        overallStatusBadge.className = 'pipeline-stage-indicator running';

        startTimer();
        showToast(`Research initiated: "${topic}"`, 'info');

        // Connect to SSE Endpoint
        const streamUrl = `${API_BASE}/api/research/stream?topic=${encodeURIComponent(topic)}`;
        eventSource = new EventSource(streamUrl);

        eventSource.onmessage = (e) => {
            try {
                const data = JSON.parse(e.data);
                handlePipelineEvent(data);
            } catch (err) {
                console.error('Error parsing SSE event data:', err);
            }
        };

        eventSource.onerror = (err) => {
            console.error('EventSource connection error:', err);
            if (isRunning && completedSteps < STEPS_CONFIG.length) {
                stopResearch('Connection lost to research stream. You can retry the step.');
            }
        };
    }

    function handlePipelineEvent(data) {
        const eventType = data.event;

        if (eventType === 'pipeline_start') {
            overallStatusBadge.textContent = 'Executing';
            updateProgressBar(5);
        } else if (eventType === 'step_start') {
            const stepId = data.step;
            const card = document.getElementById(`stepCard_${stepId}`);
            const badge = document.getElementById(`badge_${stepId}`);
            const liveMsg = document.getElementById(`liveMsg_${stepId}`);

            if (card) {
                card.classList.remove('done', 'error');
                card.classList.add('active');
            }
            if (badge) {
                badge.className = 'step-badge status-running';
                badge.textContent = '● RUNNING';
            }
            if (liveMsg && data.message) {
                liveMsg.textContent = data.message;
                liveMsg.style.display = 'block';
            }

            const stepIdx = STEPS_CONFIG.findIndex((s) => s.id === stepId);
            const progressPct = Math.max(10, stepIdx * 25);
            updateProgressBar(progressPct);
            overallStatusBadge.textContent = `Stage ${data.step_num || stepIdx + 1}/4`;
        } else if (eventType === 'step_complete') {
            const stepId = data.step;
            const card = document.getElementById(`stepCard_${stepId}`);
            const badge = document.getElementById(`badge_${stepId}`);
            const duration = document.getElementById(`duration_${stepId}`);
            const liveMsg = document.getElementById(`liveMsg_${stepId}`);
            const accordion = document.getElementById(`accordion_${stepId}`);

            if (card) {
                card.classList.remove('active');
                card.classList.add('done');
            }
            if (badge) {
                badge.className = 'step-badge status-done';
                badge.textContent = '✓ DONE';
            }
            if (duration) {
                duration.textContent = `${data.duration}s`;
                duration.style.display = 'inline-block';
            }
            if (liveMsg) {
                liveMsg.style.display = 'none';
            }

            // Expose raw intermediate outputs for inspection (search and reader)
            if (accordion && data.output) {
                const rawPre = accordion.querySelector('.raw-output');
                if (rawPre) {
                    rawPre.textContent = data.output;
                    accordion.style.display = 'block';
                }
            }

            // If writer step, save report text
            if (stepId === 'writer') {
                currentReportMarkdown = data.output;
            }

            completedSteps++;
            agentsCompleteCount.textContent = `${completedSteps} / 4 agents complete`;
            updateProgressBar(completedSteps * 25);
        } else if (eventType === 'done') {
            finishResearch(data);
        } else if (eventType === 'error') {
            handleStepError(data.step, data.message);
        }
    }

    function finishResearch(data) {
        stopTimer();
        isRunning = false;
        if (eventSource) {
            eventSource.close();
            eventSource = null;
        }

        updateProgressBar(100);
        overallStatusBadge.textContent = 'Completed';
        overallStatusBadge.className = 'pipeline-stage-indicator done';

        restoreRunButtons();

        // Extract and render Final Report
        const results = data.results || {};
        currentReportMarkdown = results.writer || currentReportMarkdown || '';
        currentCriticMarkdown = results.critic || '';

        reportTopicTitle.textContent = currentTopic;
        const words = data.word_count || currentReportMarkdown.split(/\s+/).filter(Boolean).length;
        const readMins = data.read_mins || Math.max(1, Math.round(words / 200));

        reportWordCount.textContent = `${words} words`;
        reportReadTime.textContent = `~${readMins} min read`;

        // Render Markdown into HTML
        reportBody.innerHTML = renderMarkdown(currentReportMarkdown);

        // Render Critic Audit
        renderCriticFeedback(currentCriticMarkdown);

        // Display results section with smooth scroll
        resultsSection.style.display = 'block';
        resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

        showToast('Research pipeline finished successfully!', 'success');
    }

    function handleStepError(stepId, errorMsg) {
        stopTimer();
        isRunning = false;
        failedStep = stepId;

        if (eventSource) {
            eventSource.close();
            eventSource = null;
        }

        if (stepId) {
            const card = document.getElementById(`stepCard_${stepId}`);
            const badge = document.getElementById(`badge_${stepId}`);
            const liveMsg = document.getElementById(`liveMsg_${stepId}`);

            if (card) {
                card.classList.remove('active');
                card.classList.add('error');
            }
            if (badge) {
                badge.className = 'step-badge status-error';
                badge.textContent = '✕ FAILED';
            }
            if (liveMsg) liveMsg.style.display = 'none';
        }

        overallStatusBadge.textContent = 'Failed';
        overallStatusBadge.className = 'pipeline-stage-indicator';

        showError(`Stage failed: ${stepId || 'Unknown step'}`, errorMsg || 'An unexpected error occurred during execution.');
        restoreRunButtons();
        showToast('Pipeline execution encountered an error.', 'error');
    }

    function stopResearch(reason = '') {
        stopTimer();
        isRunning = false;
        if (eventSource) {
            eventSource.close();
            eventSource = null;
        }
        overallStatusBadge.textContent = 'Stopped';
        overallStatusBadge.className = 'pipeline-stage-indicator';

        if (reason) {
            showError('Pipeline Terminated', reason);
        }
        restoreRunButtons();
    }

    function restoreRunButtons() {
        startPipelineBtn.disabled = false;
        startPipelineBtn.innerHTML = `
            <span class="btn-icon">⚡</span>
            <span class="btn-text">Run Research Pipeline</span>
        `;
        cancelPipelineBtn.style.display = 'none';
        topicInput.disabled = false;
    }

    // ── Error Banner Handling ─────────────────────────────────────────────────
    function showError(title, msg) {
        errorTitle.textContent = title;
        errorMessage.textContent = msg;
        errorBanner.style.display = 'block';
    }

    function hideError() {
        errorBanner.style.display = 'none';
    }

    dismissErrorBtn.addEventListener('click', hideError);

    retryBtn.addEventListener('click', () => {
        hideError();
        startResearch();
    });

    // ── Intermediate Output Accordion Toggle ──────────────────────────────────
    document.addEventListener('click', (e) => {
        const toggleBtn = e.target.closest('.accordion-toggle');
        if (!toggleBtn) return;

        const targetId = toggleBtn.getAttribute('data-target');
        const content = document.getElementById(targetId);
        const arrow = toggleBtn.querySelector('.accordion-arrow');

        if (content) {
            const isVisible = content.style.display === 'block';
            content.style.display = isVisible ? 'none' : 'block';
            if (arrow) arrow.textContent = isVisible ? '▾' : '▴';
        }
    });

    // ── Critic Review Parsing & Visual Rendering ──────────────────────────────
    function renderCriticFeedback(criticText) {
        if (!criticText) {
            criticBody.innerHTML = '<p class="text-muted">No critique available.</p>';
            return;
        }

        // Try extracting score: "Score: 8/10" or "8/10"
        const scoreMatch = criticText.match(/Score:\s*(\d+(?:\.\d+)?\s*\/\s*10)/i) || criticText.match(/(\b\d{1,2}\s*\/\s*10\b)/);
        if (scoreMatch) {
            criticScoreVal.textContent = scoreMatch[1].replace(/\s+/g, '');
        } else {
            criticScoreVal.textContent = 'Reviewed';
        }

        criticBody.innerHTML = renderMarkdown(criticText);
    }

    // ── Markdown Parser with Fallback ─────────────────────────────────────────
    function renderMarkdown(md) {
        if (!md) return '';

        // If marked.js is available from CDN
        if (window.marked && typeof window.marked.parse === 'function') {
            try {
                const rawHtml = window.marked.parse(md, {
                    breaks: true,
                    gfm: true,
                });
                return window.DOMPurify ? window.DOMPurify.sanitize(rawHtml) : rawHtml;
            } catch (err) {
                console.warn('Marked.js rendering error, using fallback:', err);
            }
        }

        // Fallback markdown converter for offline/resilient environments
        return fallbackMarkdownParser(md);
    }

    function fallbackMarkdownParser(text) {
        let out = text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        // Headers
        out = out.replace(/^### (.*$)/gim, '<h3>$1</h3>');
        out = out.replace(/^## (.*$)/gim, '<h2>$1</h2>');
        out = out.replace(/^# (.*$)/gim, '<h1>$1</h1>');

        // Bold & Italic
        out = out.replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>');
        out = out.replace(/\*(.*?)\*/gim, '<em>$1</em>');

        // Inline Code
        out = out.replace(/`([^`]+)`/gim, '<code>$1</code>');

        // Links
        out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/gim, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

        // Bullet lists
        out = out.replace(/^\s*[-*]\s+(.*$)/gim, '<li>$1</li>');
        out = out.replace(/(<li>.*<\/li>)/gims, '<ul>$1</ul>');

        // Paragraphs
        out = out.replace(/\n{2,}/g, '</p><p>');
        out = `<p>${out}</p>`;
        return out;
    }

    // ── Toolbar Actions (Copy, PDF Download, New Run) ─────────────────────────
    copyReportBtn.addEventListener('click', async () => {
        if (!currentReportMarkdown) {
            showToast('No report available to copy.', 'error');
            return;
        }

        try {
            await navigator.clipboard.writeText(currentReportMarkdown);
            showToast('Report copied to clipboard!', 'success');
        } catch (err) {
            // Fallback for clipboard
            const textarea = document.createElement('textarea');
            textarea.value = currentReportMarkdown;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            showToast('Report copied to clipboard!', 'success');
        }
    });

    downloadPdfBtn.addEventListener('click', async () => {
        if (!currentReportMarkdown) {
            showToast('No report available for PDF export.', 'error');
            return;
        }

        const originalText = downloadPdfBtn.innerHTML;
        downloadPdfBtn.disabled = true;
        downloadPdfBtn.innerHTML = `<span>Generating PDF…</span>`;

        try {
            const res = await fetch(`${API_BASE}/api/export-pdf`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    topic: currentTopic || 'Research Report',
                    markdown: currentReportMarkdown,
                }),
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.detail || 'Failed to generate PDF.');
            }

            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            const safeName = (currentTopic || 'report').replace(/[^\w\-]/gi, '_').substring(0, 30);
            a.download = `ResearchReport_${safeName}_${Date.now()}.pdf`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            showToast('PDF downloaded successfully!', 'success');
        } catch (err) {
            console.error('PDF export error:', err);
            showToast(`PDF Download failed: ${err.message}`, 'error');
        } finally {
            downloadPdfBtn.disabled = false;
            downloadPdfBtn.innerHTML = originalText;
        }
    });

    newRunBtn.addEventListener('click', () => {
        resetPipelineUI();
        topicInput.value = '';
        clearBtn.style.display = 'none';
        window.scrollTo({ top: 0, behavior: 'smooth' });
        setTimeout(() => topicInput.focus(), 300);
    });

    // ── Architecture Modal ────────────────────────────────────────────────────
    btnInfoModal.addEventListener('click', () => {
        archModal.style.display = 'flex';
    });

    closeModalBtn.addEventListener('click', () => {
        archModal.style.display = 'none';
    });

    archModal.addEventListener('click', (e) => {
        if (e.target === archModal) archModal.style.display = 'none';
    });

    // ── Toast Notifications ───────────────────────────────────────────────────
    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;

        const iconMap = {
            info: '💡',
            success: '✓',
            error: '⚠️',
        };

        toast.innerHTML = `
            <span>${iconMap[type] || 'ℹ️'}</span>
            <span>${message}</span>
        `;

        toastContainer.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(10px)';
            toast.style.transition = 'all 0.3s ease';
            setTimeout(() => {
                if (toast.parentNode) toast.parentNode.removeChild(toast);
            }, 300);
        }, 3500);
    }
});

