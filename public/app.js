// Get auth token from localStorage or URL
function getAuthToken() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('token') || localStorage.getItem('authToken');
}

// Add auth token to all API requests
function getAuthHeaders() {
    const token = getAuthToken();
    return {
        'Content-Type': 'application/json',
        'X-Auth-Token': token || ''
    };
}

// Check if authenticated, redirect to login if not
function checkAuth() {
    const token = getAuthToken();
    if (!token) {
        window.location.href = '/login';
        return false;
    }
    return true;
}

// Initialize auth check
if (!checkAuth()) {
    // Will redirect, so stop execution
} else {
    // Update all links to include token
    document.addEventListener('DOMContentLoaded', () => {
        const token = getAuthToken();
        if (token) {
            // Update all internal links to include token
            document.querySelectorAll('a[href^="/"]').forEach(link => {
                const href = link.getAttribute('href');
                if (href && !href.includes('token=')) {
                    const separator = href.includes('?') ? '&' : '?';
                    link.setAttribute('href', `${href}${separator}token=${token}`);
                }
            });
        }
    });
}

// Password update form handler
const passwordForm = document.getElementById('passwordForm');
if (passwordForm) {
    passwordForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        if (!checkAuth()) return;
        
        const oldPassword = document.getElementById('currentPassword').value;
        const newPassword = document.getElementById('newPassword').value;
        
        try {
            const response = await fetch('/api/update-password', {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ oldPassword, newPassword })
            });
            
            const result = await response.json();
            
            if (result.success) {
                showNotification('パスワードが正常に更新されました！', 'success');
                // Clear form
                document.getElementById('passwordForm').reset();
            } else {
                showNotification('パスワード更新エラー: ' + result.error, 'error');
            }
        } catch (error) {
            showNotification('エラー: ' + error.message, 'error');
        }
    });
}

// Profile details toggle function
function toggleProfileDetails(profileName) {
    const detailsRow = document.getElementById(`details-${profileName}`);
    const expandBtn = document.querySelector(`.profile-expand-btn[data-profile="${profileName}"]`);
    
    if (detailsRow.classList.contains('expanded')) {
        detailsRow.classList.remove('expanded');
        expandBtn?.classList.remove('expanded');
    } else {
        // Close all other expanded rows
        document.querySelectorAll('.profile-details-row.expanded').forEach(row => {
            row.classList.remove('expanded');
            const btn = document.querySelector(`.profile-expand-btn[data-profile="${row.getAttribute('data-profile')}"]`);
            if (btn) {
                btn.classList.remove('expanded');
            }
        });
        
        detailsRow.classList.add('expanded');
        expandBtn?.classList.add('expanded');
    }
}

// Generate selector string from number inputs
function generateSelectorString(selectorType, profileName) {
    if (selectorType === 'date') {
        const rowInput = document.querySelector(
            `.selector-number-input[data-selector-type="date"][data-selector-index="0"][data-profile="${profileName}"]`
        );
        const colInput = document.querySelector(
            `.selector-number-input[data-selector-type="date"][data-selector-index="1"][data-profile="${profileName}"]`
        );
        if (rowInput && colInput) {
            const rowIndex = parseInt(rowInput.value) || 3;
            const colIndex = parseInt(colInput.value) || 15;
            return `#listcontainer${rowIndex} > td:nth-child(${colIndex}) > a > p.lesson_name`;
        }
    } else if (selectorType === 'location') {
        const rowInput = document.querySelector(
            `.selector-number-input[data-selector-type="location"][data-selector-index="0"][data-profile="${profileName}"]`
        );
        const colInput = document.querySelector(
            `.selector-number-input[data-selector-type="location"][data-selector-index="1"][data-profile="${profileName}"]`
        );
        if (rowInput && colInput) {
            const rowIndex = parseInt(rowInput.value) || 3;
            const colIndex = parseInt(colInput.value) || 6;
            return `#main > div.overflow-wrap > div > fieldset > fieldset > div > table > tbody > tr:nth-child(${rowIndex}) > td:nth-child(${colIndex}) > div > label`;
        }
    }
    return '';
}

// Update selector string display when number inputs change
function updateSelectorString(selectorType, profileName) {
    const selectorString = generateSelectorString(selectorType, profileName);
    const displayInput = document.querySelector(
        `.selector-string-display[data-selector-type="${selectorType}"][data-profile="${profileName}"]`
    );
    if (displayInput) {
        displayInput.value = selectorString;
    }
}

// Initialize selector input handlers using event delegation
function initializeSelectorInputs() {
    // Use event delegation to handle all selector number inputs
    document.addEventListener('input', (e) => {
        if (e.target.classList.contains('selector-number-input')) {
            const selectorType = e.target.getAttribute('data-selector-type');
            const profileName = e.target.getAttribute('data-profile');
            updateSelectorString(selectorType, profileName);
        }
    });
    
    document.addEventListener('change', (e) => {
        if (e.target.classList.contains('selector-number-input')) {
            const selectorType = e.target.getAttribute('data-selector-type');
            const profileName = e.target.getAttribute('data-profile');
            updateSelectorString(selectorType, profileName);
        }
    });
}

// Profile form handler
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.profile-form').forEach(form => {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!checkAuth()) return;
            
            const profileName = form.getAttribute('data-profile');
            const formData = new FormData(e.target);
            const config = {
                login: {
                    id: formData.get('login.id'),
                    password: formData.get('login.password')
                },
                reservation: {
                    time: formData.get('reservation.time').replace('T', ' '),
                    flying_time: parseFloat(formData.get('reservation.flying_time')),
                    confirm_reservation: formData.get('reservation.confirm_reservation') === 'on'
                },
                store: {
                    selected_store_index: parseInt(formData.get('store.selected_store_index'))
                },
                lesson: {
                    date_selector: {
                        row: parseInt(formData.get('lesson.date_selector.row')) || 3,
                        col: parseInt(formData.get('lesson.date_selector.col')) || 15,
                        selector: formData.get('lesson.date_selector.selector')
                    },
                    location_selector: {
                        row: parseInt(formData.get('lesson.location_selector.row')) || 3,
                        col: parseInt(formData.get('lesson.location_selector.col')) || 6,
                        selector: formData.get('lesson.location_selector.selector')
                    }
                }
            };
            
            try {
                const response = await fetch(`/api/profiles/${profileName}`, {
                    method: 'POST',
                    headers: getAuthHeaders(),
                    body: JSON.stringify(config)
                });
                
                const result = await response.json();
                
                if (result.success) {
                    showNotification('プロフィールが正常に保存されました！', 'success');
                    // Reload page after a short delay to show updated status
                    setTimeout(() => {
                        window.location.reload();
                    }, 1000);
                } else {
                    showNotification('プロフィール保存エラー: ' + result.error, 'error');
                }
            } catch (error) {
                showNotification('エラー: ' + error.message, 'error');
            }
        });
    });
});

// Delete profile function
async function deleteProfile(profileName) {
    if (!checkAuth()) return;
    
    if (!confirm(`プロフィール「${profileName}」を削除してもよろしいですか？`)) {
        return;
    }
    
    try {
        const response = await fetch(`/api/profiles/${profileName}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        
        const result = await response.json();
        
        if (result.success) {
            showNotification('プロフィールが正常に削除されました！', 'success');
            setTimeout(() => {
                window.location.reload();
            }, 1000);
        } else {
            showNotification('プロフィール削除エラー: ' + result.error, 'error');
        }
    } catch (error) {
        showNotification('エラー: ' + error.message, 'error');
    }
}

// Add profile modal
const addProfileBtn = document.getElementById('addProfileBtn');
const addProfileModal = document.getElementById('addProfileModal');
const addProfileForm = document.getElementById('addProfileForm');

if (addProfileBtn) {
    addProfileBtn.addEventListener('click', () => {
        if (addProfileModal) {
            addProfileModal.style.display = 'flex';
            document.body.style.overflow = 'hidden';
            // Initialize selector strings for new profile
            setTimeout(() => {
                updateSelectorString('date', 'new');
                updateSelectorString('location', 'new');
            }, 100);
        }
    });
}

function closeAddProfileModal() {
    if (addProfileModal) {
        document.body.style.overflow = 'auto';
        addProfileModal.style.display = 'none';
        if (addProfileForm) {
            addProfileForm.reset();
        }
    }
}

if (addProfileForm) {
    addProfileForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!checkAuth()) return;
        
        const profileName = document.getElementById('newProfileName').value.trim();
        if (!profileName) {
            showNotification('プロフィール名は必須です', 'error');
            return;
        }
        
        const formData = new FormData(e.target);
        const config = {
            login: {
                id: formData.get('login.id'),
                password: formData.get('login.password')
            },
            reservation: {
                time: formData.get('reservation.time').replace('T', ' '),
                flying_time: parseFloat(formData.get('reservation.flying_time')),
                confirm_reservation: formData.get('reservation.confirm_reservation') === 'on'
            },
            store: {
                selected_store_index: parseInt(formData.get('store.selected_store_index'))
            },
            lesson: {
                date_selector: {
                    row: parseInt(formData.get('lesson.date_selector.row')) || 3,
                    col: parseInt(formData.get('lesson.date_selector.col')) || 15,
                    selector: formData.get('lesson.date_selector.selector')
                },
                location_selector: {
                    row: parseInt(formData.get('lesson.location_selector.row')) || 3,
                    col: parseInt(formData.get('lesson.location_selector.col')) || 6,
                    selector: formData.get('lesson.location_selector.selector')
                }
            }
        };
        
        try {
            const response = await fetch(`/api/profiles/${profileName}`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify(config)
            });
            
            const result = await response.json();
            
            if (result.success) {
                showNotification('プロフィールが正常に作成されました！', 'success');
                closeAddProfileModal();
                setTimeout(() => {
                    window.location.reload();
                }, 1000);
            } else {
                showNotification('プロフィール作成エラー: ' + result.error, 'error');
            }
        } catch (error) {
            showNotification('エラー: ' + error.message, 'error');
        }
    });
}

// Close modal when clicking outside
if (addProfileModal) {
    addProfileModal.addEventListener('click', (e) => {
        if (e.target === addProfileModal) {
            closeAddProfileModal();
        }
    });
}

// Toggle select all checkboxes
function toggleSelectAll() {
    const selectAllCheckbox = document.getElementById('selectAllCheckbox');
    const profileCheckboxes = document.querySelectorAll('.profile-checkbox');
    
    profileCheckboxes.forEach(checkbox => {
        // Only toggle if profile is not running
        const profileName = checkbox.value;
        const row = document.querySelector(`tr[data-profile="${profileName}"]`);
        const isRunning = row?.querySelector('.profile-status-badge.status-running');
        if (!isRunning) {
            checkbox.checked = selectAllCheckbox.checked;
        }
    });
    
    updateRunButtonState();
}

// Update run button state based on selection
function updateRunButtonState() {
    const runSelectedBtn = document.getElementById('runSelectedBtn');
    const selectedCheckboxes = document.querySelectorAll('.profile-checkbox:checked');
    
    if (runSelectedBtn) {
        if (selectedCheckboxes.length > 0) {
            runSelectedBtn.disabled = false;
            runSelectedBtn.textContent = `▶ 選択したボットを実行 (${selectedCheckboxes.length})`;
        } else {
            runSelectedBtn.disabled = true;
            runSelectedBtn.textContent = '▶ 選択したボットを実行';
        }
    }
    
    // Update select all checkbox state
    const selectAllCheckbox = document.getElementById('selectAllCheckbox');
    const allCheckboxes = document.querySelectorAll('.profile-checkbox');
    const checkedCount = document.querySelectorAll('.profile-checkbox:checked').length;
    
    if (selectAllCheckbox && allCheckboxes.length > 0) {
        selectAllCheckbox.checked = checkedCount === allCheckboxes.length;
        selectAllCheckbox.indeterminate = checkedCount > 0 && checkedCount < allCheckboxes.length;
    }
}

// Disable checkboxes for running profiles
function updateCheckboxStates() {
    document.querySelectorAll('.profile-checkbox').forEach(checkbox => {
        const profileName = checkbox.value;
        const row = document.querySelector(`tr[data-profile="${profileName}"]`);
        const isRunning = row?.querySelector('.profile-status-badge.status-running');
        
        if (isRunning) {
            checkbox.disabled = true;
            checkbox.checked = false;
        } else {
            checkbox.disabled = false;
        }
    });
    updateRunButtonState();
}

// Run selected bots button
const runSelectedBtn = document.getElementById('runSelectedBtn');
if (runSelectedBtn) {
    runSelectedBtn.addEventListener('click', async () => {
        if (!checkAuth()) return;
        
        const selectedCheckboxes = document.querySelectorAll('.profile-checkbox:checked');
        const selectedProfiles = Array.from(selectedCheckboxes).map(cb => cb.value);
        
        if (selectedProfiles.length === 0) {
            showNotification('少なくとも1つのプロフィールを選択してください', 'error');
            return;
        }
        
        if (!confirm(`選択した${selectedProfiles.length}つのボットを実行してもよろしいですか？`)) {
            return;
        }
        
        try {
            const response = await fetch('/api/run-selected', {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ profiles: selectedProfiles })
            });
            
            const result = await response.json();
            
            if (result.success) {
                showNotification(`${result.profiles.length}つのボットを開始しました！`, 'success');
                // Disable buttons and start polling
                runSelectedBtn.disabled = true;
                const runAllBtn = document.getElementById('runAllBtn');
                if (runAllBtn) runAllBtn.disabled = true;
                // Uncheck all checkboxes
                selectedCheckboxes.forEach(cb => cb.checked = false);
                updateRunButtonState();
                startStatusPolling();
            } else {
                showNotification('ボット開始エラー: ' + result.error, 'error');
            }
        } catch (error) {
            showNotification('エラー: ' + error.message, 'error');
        }
    });
    
    // Initially disable the button
    runSelectedBtn.disabled = true;
}

// Run all bots button
const runAllBtn = document.getElementById('runAllBtn');
if (runAllBtn) {
    runAllBtn.addEventListener('click', async () => {
        if (!checkAuth()) return;
        
        if (!confirm('すべてのボットを実行してもよろしいですか？')) {
            return;
        }
        
        try {
            const response = await fetch('/api/run-all', {
                method: 'POST',
                headers: getAuthHeaders()
            });
            
            const result = await response.json();
            
            if (result.success) {
                showNotification(`${result.profiles.length}つのボットを開始しました！`, 'success');
                // Disable buttons and start polling
                runAllBtn.disabled = true;
                if (runSelectedBtn) runSelectedBtn.disabled = true;
                // Uncheck all checkboxes
                document.querySelectorAll('.profile-checkbox').forEach(cb => cb.checked = false);
                updateRunButtonState();
                startStatusPolling();
            } else {
                showNotification('ボット開始エラー: ' + result.error, 'error');
            }
        } catch (error) {
            showNotification('エラー: ' + error.message, 'error');
        }
    });
}

// Status polling
let statusPollInterval = null;

function startStatusPolling() {
    if (statusPollInterval) return;
    
    statusPollInterval = setInterval(async () => {
        try {
            const response = await fetch('/api/profiles/status', {
                headers: getAuthHeaders()
            });
            const data = await response.json();
            
            if (data.success) {
                // Update UI with latest status
                updateProfileStatuses(data.profiles);
                
                // Check if all bots are done
                const allDone = data.profiles.every(p => p.status.status !== 'running');
                if (allDone && statusPollInterval) {
                    clearInterval(statusPollInterval);
                    statusPollInterval = null;
                    if (runAllBtn) {
                        runAllBtn.disabled = false;
                    }
                    if (runSelectedBtn) {
                        runSelectedBtn.disabled = false;
                    }
                }
            }
        } catch (error) {
            console.error('Error polling status:', error);
        }
    }, 2000); // Poll every 2 seconds
}

function updateProfileStatuses(profiles) {
    profiles.forEach(profile => {
        const row = document.querySelector(`tr[data-profile="${profile.name}"]`);
        if (row) {
            const badge = row.querySelector('.profile-status-badge');
            if (badge) {
                // Remove all status classes
                badge.className = 'profile-status-badge';
                badge.classList.add(`status-${profile.status.status || 'inactive'}`);
                
                // Update badge text
                if (profile.status.status === 'running') {
                    badge.textContent = '🟢 実行中';
                } else if (profile.status.status === 'success') {
                    badge.textContent = '✅ 成功';
                } else if (profile.status.status === 'failure') {
                    badge.textContent = '❌ 失敗';
                } else {
                    badge.textContent = '⚪ 無効';
                }
            }
            
            // Update status info if details row is expanded
            const detailsRow = document.getElementById(`details-${profile.name}`);
            if (detailsRow && detailsRow.classList.contains('expanded')) {
                updateProfileStatusInfo(profile);
            }
        }
    });
    
    // Update checkbox states after status update
    updateCheckboxStates();
}

function updateProfileStatusInfo(profile) {
    const detailsRow = document.getElementById(`details-${profile.name}`);
    if (!detailsRow) return;
    
    const statusInfo = detailsRow.querySelector('.profile-status-info');
    if (!statusInfo) return;
    
    let html = '';
    if (profile.status.status === 'running') {
        html = `<p><strong>ステータス:</strong> ${profile.status.timestamp ? new Date(profile.status.timestamp).toLocaleString('ja-JP') : 'N/A'} から実行中</p>`;
    } else if (profile.status.status === 'success') {
        html = `
            <p><strong>ステータス:</strong> 成功</p>
            <p><strong>完了:</strong> ${profile.status.timestamp ? new Date(profile.status.timestamp).toLocaleString('ja-JP') : 'N/A'}</p>
            <p><strong>経過時間:</strong> ${profile.status.elapsed || 'N/A'}</p>
        `;
    } else if (profile.status.status === 'failure') {
        html = `
            <p><strong>ステータス:</strong> 失敗</p>
            <p><strong>失敗:</strong> ${profile.status.timestamp ? new Date(profile.status.timestamp).toLocaleString('ja-JP') : 'N/A'}</p>
            <p><strong>経過時間:</strong> ${profile.status.elapsed || 'N/A'}</p>
            ${profile.status.message ? `<p><strong>エラー:</strong> <span class="error-text">${profile.status.message}</span></p>` : ''}
        `;
    } else {
        html = `<p><strong>ステータス:</strong> 無効</p>`;
    }
    
    statusInfo.innerHTML = html;
}

// Auto-start polling if any bot is running
document.addEventListener('DOMContentLoaded', () => {
    const runningProfiles = document.querySelectorAll('.profile-status-badge.status-running');
    if (runningProfiles.length > 0) {
        startStatusPolling();
    }
    
    // Initialize checkbox states
    updateCheckboxStates();
    
    // Initialize selector inputs
    initializeSelectorInputs();
    
    // Make functions available globally
    window.toggleSelectAll = toggleSelectAll;
    window.updateRunButtonState = updateRunButtonState;
});

// Make toggleProfileDetails available globally
window.toggleProfileDetails = toggleProfileDetails;

// Notification system
function showNotification(message, type = 'info') {
    // Remove existing notifications
    const existing = document.querySelector('.notification');
    if (existing) existing.remove();
    
    const icons = {
        success: '✓',
        error: '✕',
        info: 'ℹ'
    };
    
    const gradients = {
        success: 'linear-gradient(135deg, #48bb78 0%, #38a169 100%)',
        error: 'linear-gradient(135deg, #f56565 0%, #e53e3e 100%)',
        info: 'linear-gradient(135deg, #4299e1 0%, #3182ce 100%)'
    };
    
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    
    notification.innerHTML = `
        <div class="notification-icon">${icons[type] || icons.info}</div>
        <div class="notification-content">${message}</div>
        <button class="notification-close" onclick="this.parentElement.remove()">×</button>
    `;
    
    notification.style.cssText = `
        position: fixed;
        top: 30px;
        right: 30px;
        padding: 0;
        background: ${gradients[type] || gradients.info};
        color: white;
        border-radius: 16px;
        box-shadow: 0 10px 40px rgba(0,0,0,0.3);
        z-index: 10000;
        animation: slideInRight 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        display: flex;
        align-items: center;
        gap: 15px;
        min-width: 300px;
        max-width: 500px;
        overflow: hidden;
        backdrop-filter: blur(10px);
        border: 2px solid rgba(255, 255, 255, 0.2);
    `;
    
    // Add internal styles
    const iconStyle = document.createElement('style');
    iconStyle.textContent = `
        .notification-icon {
            font-size: 24px;
            font-weight: bold;
            width: 50px;
            height: 50px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: rgba(255, 255, 255, 0.2);
            flex-shrink: 0;
        }
        .notification-content {
            flex: 1;
            padding: 18px 0;
            font-weight: 600;
            font-size: 15px;
            line-height: 1.4;
        }
        .notification-close {
            background: rgba(255, 255, 255, 0.2);
            border: none;
            color: white;
            font-size: 24px;
            width: 40px;
            height: 40px;
            cursor: pointer;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin-right: 10px;
            transition: all 0.2s;
            flex-shrink: 0;
        }
        .notification-close:hover {
            background: rgba(255, 255, 255, 0.3);
            transform: rotate(90deg);
        }
    `;
    if (!document.getElementById('notification-styles')) {
        iconStyle.id = 'notification-styles';
        document.head.appendChild(iconStyle);
    }
    
    document.body.appendChild(notification);
    
    // Auto-remove after 4 seconds
    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
        setTimeout(() => notification.remove(), 400);
    }, 4000);
}

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideInRight {
        from {
            transform: translateX(120%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    @keyframes slideOutRight {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(120%);
            opacity: 0;
        }
    }
`;
if (!document.getElementById('notification-animations')) {
    style.id = 'notification-animations';
    document.head.appendChild(style);
}
