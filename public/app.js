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
    
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    
    try {
        const response = await fetch('/api/update-password', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ currentPassword, newPassword })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showNotification('Password updated successfully!', 'success');
            // Update stored token
            localStorage.setItem('authToken', result.token);
            // Update URL with new token
            const url = new URL(window.location);
            url.searchParams.set('token', result.token);
            window.history.replaceState({}, '', url);
            // Clear form
            document.getElementById('passwordForm').reset();
        } else {
            showNotification('Error updating password: ' + result.error, 'error');
        }
    } catch (error) {
        showNotification('Error: ' + error.message, 'error');
    }
    });
}

// Configuration form handler
const configForm = document.getElementById('configForm');
if (configForm) {
    configForm.addEventListener('submit', async (e) => {
    if (!checkAuth()) return;
    e.preventDefault();
    
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
            date_selector: formData.get('lesson.date_selector'),
            location_selector: formData.get('lesson.location_selector')
        }
    };
    
    try {
        const response = await fetch('/api/config', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(config)
        });
        
        const result = await response.json();
        
        if (result.success) {
            showNotification('Configuration saved successfully!', 'success');
        } else {
            showNotification('Error saving configuration: ' + result.error, 'error');
        }
    } catch (error) {
        showNotification('Error: ' + error.message, 'error');
    }
    });
}

// Run bot button handler
const runBotBtn = document.getElementById('runBotBtn');
if (runBotBtn) {
    runBotBtn.addEventListener('click', async () => {
        if (!checkAuth()) return;
        
        if (confirm('Are you sure you want to run the bot?')) {
            try {
                const response = await fetch('/api/run', {
                    method: 'POST',
                    headers: getAuthHeaders()
                });
                
                const result = await response.json();
                
                if (result.success) {
                    showNotification('Bot started!', 'success');
                    // Disable button and start polling
                    document.getElementById('runBotBtn').disabled = true;
                    startStatusPolling();
                } else {
                    showNotification('Error starting bot: ' + result.error, 'error');
                }
            } catch (error) {
                showNotification('Error: ' + error.message, 'error');
            }
        }
    });
}

// Status polling
let statusPollInterval = null;

function startStatusPolling() {
    if (statusPollInterval) return;
    
    statusPollInterval = setInterval(async () => {
        try {
            const response = await fetch('/api/status', {
                headers: getAuthHeaders()
            });
            const data = await response.json();
            
            // Update UI based on status
            if (!data.isRunning && statusPollInterval) {
                clearInterval(statusPollInterval);
                statusPollInterval = null;
                document.getElementById('runBotBtn').disabled = false;
                // Reload page to show updated results
                setTimeout(() => {
                    window.location.reload();
                }, 1000);
            }
        } catch (error) {
            console.error('Error polling status:', error);
        }
    }, 2000); // Poll every 2 seconds
}

// Auto-start polling if bot is running
if (document.querySelector('.status-indicator .badge.running')) {
    startStatusPolling();
}

// Only run status polling initialization if we're on the main page
if (configForm || runBotBtn) {
    // We're on the main page, initialize status polling
}

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

