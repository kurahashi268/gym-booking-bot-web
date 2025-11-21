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
        
        // Check for unsaved changes when expanding
        const form = detailsRow.querySelector('.profile-form');
        if (form) {
            updateUnsavedChangesWarning(form);
        }
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
        // Trigger change detection for the form
        const form = displayInput.closest('.profile-form');
        if (form && profileName !== 'new') {
            updateUnsavedChangesWarning(form);
        }
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
            // Also trigger change detection for the form
            const form = e.target.closest('.profile-form');
            if (form && profileName !== 'new') {
                updateUnsavedChangesWarning(form);
            }
        }
    });
    
    document.addEventListener('change', (e) => {
        if (e.target.classList.contains('selector-number-input')) {
            const selectorType = e.target.getAttribute('data-selector-type');
            const profileName = e.target.getAttribute('data-profile');
            updateSelectorString(selectorType, profileName);
            // Also trigger change detection for the form
            const form = e.target.closest('.profile-form');
            if (form && profileName !== 'new') {
                updateUnsavedChangesWarning(form);
            }
        }
    });
}

// Store original form values for change detection
const originalFormValues = new Map();

// Get form values as a serializable object
function getFormValues(form) {
    const formData = new FormData(form);
    const values = {};
    for (const [key, value] of formData.entries()) {
        values[key] = value;
    }
    // Also capture checkbox states
    form.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
        values[checkbox.name] = checkbox.checked ? 'on' : 'off';
    });
    // Also capture readonly inputs (like selector strings)
    form.querySelectorAll('input[readonly]').forEach(input => {
        if (input.name) {
            values[input.name] = input.value;
        }
    });
    return values;
}

// Check if form has unsaved changes
function hasFormChanges(form) {
    const profileName = form.getAttribute('data-profile');
    if (!originalFormValues.has(profileName)) return false;
    
    const original = originalFormValues.get(profileName);
    const current = getFormValues(form);
    
    // Compare all values
    for (const key in original) {
        if (original[key] !== current[key]) {
            return true;
        }
    }
    // Check for new keys in current
    for (const key in current) {
        if (!(key in original)) {
            return true;
        }
    }
    return false;
}

// Show/hide unsaved changes warning
function updateUnsavedChangesWarning(form) {
    const profileName = form.getAttribute('data-profile');
    const detailsRow = document.getElementById(`details-${profileName}`);
    if (!detailsRow) return;
    
    let warningBanner = detailsRow.querySelector('.unsaved-changes-warning');
    const hasChanges = hasFormChanges(form);
    
    if (hasChanges && !warningBanner) {
        // Create warning banner
        warningBanner = document.createElement('div');
        warningBanner.className = 'unsaved-changes-warning';
        warningBanner.innerHTML = `
            <div class="unsaved-changes-content">
                <span class="unsaved-changes-icon">⚠️</span>
                <span class="unsaved-changes-text">変更を保存してからボットを使用してください</span>
            </div>
        `;
        
        // Insert at the beginning of profile-details-content
        const detailsContent = detailsRow.querySelector('.profile-details-content');
        if (detailsContent) {
            detailsContent.insertBefore(warningBanner, detailsContent.firstChild);
        }
    } else if (!hasChanges && warningBanner) {
        // Remove warning banner
        warningBanner.remove();
    }
}

// Initialize form change tracking
function initializeFormChangeTracking() {
    document.querySelectorAll('.profile-form').forEach(form => {
        const profileName = form.getAttribute('data-profile');
        if (profileName && profileName !== 'new') {
            // Store original values
            originalFormValues.set(profileName, getFormValues(form));
            
            // Add change listeners to all inputs
            const inputs = form.querySelectorAll('input, select, textarea');
            inputs.forEach(input => {
                const handleChange = () => {
                    updateUnsavedChangesWarning(form);
                };
                
                input.addEventListener('input', handleChange);
                input.addEventListener('change', handleChange);
            });
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
                    // Update original values after successful save
                    originalFormValues.set(profileName, getFormValues(form));
                    updateUnsavedChangesWarning(form);
                    
                    showNotification('プロフィールが正常に保存されました！', 'success');
                    // Refresh profile status without reloading
                    refreshProfileStatus(profileName);
                } else {
                    showNotification('プロフィール保存エラー: ' + result.error, 'error');
                }
            } catch (error) {
                showNotification('エラー: ' + error.message, 'error');
            }
        });
    });
    
    // Initialize form change tracking
    initializeFormChangeTracking();
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
            // Remove the profile row from the UI
            const row = document.querySelector(`tr[data-profile="${profileName}"]`);
            const detailsRow = document.getElementById(`details-${profileName}`);
            if (row) row.remove();
            if (detailsRow) detailsRow.remove();
            // Update checkbox states
            updateCheckboxStates();
            // Check if no profiles left and show message
            const remainingProfiles = document.querySelectorAll('tr[data-profile]');
            if (remainingProfiles.length === 0) {
                const tbody = document.querySelector('.profiles-table tbody');
                if (tbody) {
                    tbody.innerHTML = '';
                }
            }
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
                // Fetch the new profile and add it to the table
                addProfileToTable(profileName);
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
                headers: getAuthHeaders(),
                body: "{}",
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
                headers: getAuthHeaders(),
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
                    // if (runSelectedBtn) {
                    //     runSelectedBtn.disabled = false;
                    // }
                    // Refresh profile statuses one more time to ensure final state is displayed
                    updateProfileStatuses(data.profiles);
                    updateCheckboxStates();
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
        `;
    } else if (profile.status.status === 'failure') {
        html = `
            <p><strong>ステータス:</strong> 失敗</p>
            <p><strong>失敗:</strong> ${profile.status.timestamp ? new Date(profile.status.timestamp).toLocaleString('ja-JP') : 'N/A'}</p>
            ${profile.status.message ? `<p><strong>エラー:</strong> <span class="error-text">${profile.status.message}</span></p>` : ''}
        `;
    } else {
        html = `<p><strong>ステータス:</strong> 無効</p>`;
    }
    
    statusInfo.innerHTML = html;
}

// Refresh a single profile's status
async function refreshProfileStatus(profileName) {
    try {
        const response = await fetch(`/api/profiles/${profileName}`, {
            headers: getAuthHeaders()
        });
        const result = await response.json();
        
        if (result.success && result.profile) {
            // Update the status badge
            const row = document.querySelector(`tr[data-profile="${profileName}"]`);
            if (row) {
                const badge = row.querySelector('.profile-status-badge');
                if (badge) {
                    badge.className = 'profile-status-badge';
                    badge.classList.add(`status-${result.profile.status.status || 'inactive'}`);
                    
                    if (result.profile.status.status === 'running') {
                        badge.textContent = '🟢 実行中';
                    } else if (result.profile.status.status === 'success') {
                        badge.textContent = '✅ 成功';
                    } else if (result.profile.status.status === 'failure') {
                        badge.textContent = '❌ 失敗';
                    } else {
                        badge.textContent = '⚪ 無効';
                    }
                }
            }
            
            // Update status info if details row is expanded
            const detailsRow = document.getElementById(`details-${profileName}`);
            if (detailsRow && detailsRow.classList.contains('expanded')) {
                updateProfileStatusInfo(result.profile);
            }
            
            // Update checkbox states
            updateCheckboxStates();
        }
    } catch (error) {
        console.error('Error refreshing profile status:', error);
    }
}

// Add a new profile to the table after creation
async function addProfileToTable(profileName) {
    try {
        const response = await fetch(`/api/profiles/${profileName}`, {
            headers: getAuthHeaders()
        });
        const result = await response.json();
        
        if (result.success && result.profile) {
            const tbody = document.querySelector('.profiles-table tbody');
            if (!tbody) {
                // If table doesn't exist, show error
                showNotification('プロフィールテーブルが見つかりません。ページを手動で更新してください。', 'error');
                return;
            }
            
            // Create and add the new rows
            const row = createProfileRow(result.profile);
            const detailsRow = createProfileDetailsRow(result.profile);
            tbody.appendChild(row);
            tbody.appendChild(detailsRow);
            
            // Initialize form tracking for the new profile
            const form = detailsRow.querySelector('.profile-form');
            if (form) {
                const profileName = form.getAttribute('data-profile');
                if (profileName && profileName !== 'new') {
                    originalFormValues.set(profileName, getFormValues(form));
                    
                    const inputs = form.querySelectorAll('input, select, textarea');
                    inputs.forEach(input => {
                        const handleChange = () => {
                            updateUnsavedChangesWarning(form);
                        };
                        input.addEventListener('input', handleChange);
                        input.addEventListener('change', handleChange);
                    });
                }
            }
            
            // Attach form submit handler
            attachFormSubmitHandler(form);
            
            // Initialize selector strings
            updateSelectorString('date', profileName);
            updateSelectorString('location', profileName);
            
            // Update checkbox states
            updateCheckboxStates();
        }
    } catch (error) {
        console.error('Error adding profile to table:', error);
        showNotification('プロフィールの追加に失敗しました', 'error');
    }
}

// Attach form submit handler to a form element
function attachFormSubmitHandler(form) {
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
                originalFormValues.set(profileName, getFormValues(form));
                updateUnsavedChangesWarning(form);
                showNotification('プロフィールが正常に保存されました！', 'success');
                refreshProfileStatus(profileName);
            } else {
                showNotification('プロフィール保存エラー: ' + result.error, 'error');
            }
        } catch (error) {
            showNotification('エラー: ' + error.message, 'error');
        }
    });
}

// Refresh the entire profiles list (fallback function, not currently used)
async function refreshProfilesList() {
    try {
        const response = await fetch('/api/profiles', {
            headers: getAuthHeaders()
        });
        const result = await response.json();
        
        if (result.success && result.profiles) {
            const tbody = document.querySelector('.profiles-table tbody');
            if (!tbody) {
                // If table doesn't exist, show error
                showNotification('プロフィールテーブルが見つかりません。ページを手動で更新してください。', 'error');
                return;
            }
            
            // Clear existing rows
            tbody.innerHTML = '';
            
            // Add new rows for each profile
            result.profiles.forEach(profile => {
                const row = createProfileRow(profile);
                const detailsRow = createProfileDetailsRow(profile);
                tbody.appendChild(row);
                tbody.appendChild(detailsRow);
            });
            
            // Re-initialize form tracking and other handlers
            initializeFormChangeTracking();
            initializeSelectorInputs();
            updateCheckboxStates();
            
            // Re-attach form submit handlers
            document.querySelectorAll('.profile-form').forEach(form => {
                // Remove existing listener if any, then add new one
                const newForm = form.cloneNode(true);
                form.parentNode.replaceChild(newForm, form);
                
                newForm.addEventListener('submit', async (e) => {
                    e.preventDefault();
                    if (!checkAuth()) return;
                    
                    const profileName = newForm.getAttribute('data-profile');
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
                            originalFormValues.set(profileName, getFormValues(newForm));
                            updateUnsavedChangesWarning(newForm);
                            showNotification('プロフィールが正常に保存されました！', 'success');
                            refreshProfileStatus(profileName);
                        } else {
                            showNotification('プロフィール保存エラー: ' + result.error, 'error');
                        }
                    } catch (error) {
                        showNotification('エラー: ' + error.message, 'error');
                    }
                });
            });
        }
    } catch (error) {
        console.error('Error refreshing profiles list:', error);
        showNotification('プロフィールリストの更新に失敗しました', 'error');
    }
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    if (text == null) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Create a profile row element
function createProfileRow(profile) {
    const row = document.createElement('tr');
    row.setAttribute('data-profile', profile.name);
    
    const statusText = profile.status.status === 'running' ? '🟢 実行中' :
                       profile.status.status === 'success' ? '✅ 成功' :
                       profile.status.status === 'failure' ? '❌ 失敗' : '⚪ 無効';
    
    const escapedName = escapeHtml(profile.name);
    row.innerHTML = `
        <td class="profile-checkbox-cell">
            <input type="checkbox" class="profile-checkbox" value="${escapedName}" onchange="updateRunButtonState()">
        </td>
        <td class="profile-name-cell">${escapedName}</td>
        <td class="profile-status-cell">
            <span class="profile-status-badge status-${profile.status.status || 'inactive'}">
                ${statusText}
            </span>
        </td>
        <td class="profile-actions-cell">
            <button class="profile-expand-btn" onclick="toggleProfileDetails('${escapedName}')" data-profile="${escapedName}">
                <span class="expand-icon">▼</span>
                <span>詳細</span>
            </button>
        </td>
    `;
    
    return row;
}

// Create a profile details row element
function createProfileDetailsRow(profile) {
    const row = document.createElement('tr');
    row.className = 'profile-details-row';
    const escapedName = escapeHtml(profile.name);
    row.id = `details-${escapedName}`;
    row.setAttribute('data-profile', escapedName);
    
    const timestamp = profile.status.timestamp ? escapeHtml(new Date(profile.status.timestamp).toLocaleString('ja-JP')) : 'N/A';
    const elapsed = escapeHtml(String(profile.status.elapsed || 'N/A'));
    const errorMessage = profile.status.message ? escapeHtml(profile.status.message) : '';
    
    const statusHtml = profile.status.status === 'running' ? 
        `<p><strong>ステータス:</strong> ${timestamp} から実行中</p>` :
        profile.status.status === 'success' ?
        `<p><strong>ステータス:</strong> 成功</p>
         <p><strong>完了:</strong> ${timestamp}</p>` :
        profile.status.status === 'failure' ?
        `<p><strong>ステータス:</strong> 失敗</p>
         <p><strong>失敗:</strong> ${timestamp}</p>
         ${errorMessage ? `<p><strong>エラー:</strong> <span class="error-text">${errorMessage}</span></p>` : ''}` :
        `<p><strong>ステータス:</strong> 無効</p>`;
    
    const confirmChecked = profile.config.reservation.confirm_reservation ? 'checked' : '';
    
    row.innerHTML = `
        <td colspan="4" class="profile-details-cell">
            <div class="profile-details-content">
                <div class="profile-status-info">
                    ${statusHtml}
                </div>
                
                <form class="profile-form" data-profile="${escapedName}">
                    <div class="form-group">
                        <label>ログインID:</label>
                        <input type="text" name="login.id" value="${escapeHtml(profile.config.login.id || '')}" required>
                    </div>
                    <div class="form-group">
                        <label>パスワード:</label>
                        <input type="text" name="login.password" value="${escapeHtml(profile.config.login.password || '')}" required>
                    </div>
                    <div class="form-group">
                        <label>予約時間:</label>
                        <input type="text" name="reservation.time" value="${escapeHtml(profile.config.reservation.time || '')}" pattern="\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}" placeholder="2025-11-21 23:32" required>
                    </div>
                    <div class="form-group">
                        <label>フライング時間（秒）:</label>
                        <input type="number" name="reservation.flying_time" value="${escapeHtml(String(profile.config.reservation.flying_time || ''))}" step="0.01" required>
                    </div>
                    <div class="form-group">
                        <label>予約を確認:</label>
                        <input type="checkbox" name="reservation.confirm_reservation" ${confirmChecked}>
                    </div>
                    <div class="form-group">
                        <label>店舗インデックス:</label>
                        <input type="number" name="store.selected_store_index" value="${escapeHtml(String(profile.config.store.selected_store_index || ''))}" required>
                    </div>
                    <div class="form-group">
                        <label>レッスン日付セレクター:</label>
                        <div class="selector-input-group">
                            <div class="selector-numbers">
                                <label class="selector-number-label">日付行:</label>
                                <input type="number" class="selector-number-input" 
                                       name="lesson.date_selector.row"
                                       data-selector-type="date" 
                                       data-selector-index="0" 
                                       data-profile="${escapedName}"
                                       value="${profile.config.lesson.date_selector.row || 3}" 
                                       min="1" required>
                                <label class="selector-number-label">日付列:</label>
                                <input type="number" class="selector-number-input" 
                                        name="lesson.date_selector.col"
                                        data-selector-type="date" 
                                        data-selector-index="1" 
                                        data-profile="${escapedName}"
                                        value="${profile.config.lesson.date_selector.col || 15}" 
                                        min="1" required>
                            </div>
                            <input type="text" class="selector-string-display" 
                                name="lesson.date_selector.selector"
                                   data-selector-type="date"
                                   data-profile="${escapedName}"
                                   value="${escapeHtml(profile.config.lesson.date_selector.selector || '')}" 
                                   readonly>
                        </div>
                    </div>
                    <div class="form-group">
                        <label>レッスン場所セレクター:</label>
                        <div class="selector-input-group">
                            <div class="selector-numbers">
                                <label class="selector-number-label">行インデックス:</label>
                                <input type="number" class="selector-number-input" 
                                       name="lesson.location_selector.row" 
                                       data-selector-type="location" 
                                       data-selector-index="0"
                                       data-profile="${escapedName}"
                                       value="${profile.config.lesson.location_selector.row || 3}" 
                                       min="1" required>
                                <label class="selector-number-label">列インデックス:</label>
                                <input type="number" class="selector-number-input" 
                                        name="lesson.location_selector.col" 
                                        data-selector-type="location" 
                                        data-selector-index="1"
                                        data-profile="${escapedName}"
                                        value="${profile.config.lesson.location_selector.col || 6}" 
                                        min="1" required>
                            </div>
                            <input type="text" class="selector-string-display" 
                                    name="lesson.location_selector.selector"
                                   data-selector-type="location"
                                   data-profile="${escapedName}"
                                   value="${escapeHtml(profile.config.lesson.location_selector.selector || '')}" 
                                   readonly>
                        </div>
                    </div>
                    <div class="form-actions">
                        <button type="submit" class="btn btn-primary">プロフィールを保存</button>
                        <button type="button" class="btn btn-danger" onclick="deleteProfile('${escapedName}')">プロフィールを削除</button>
                    </div>
                </form>
            </div>
        </td>
    `;
    
    return row;
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
