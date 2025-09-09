// Popup Script - Phase 1: Extension Management
class PopupManager {
  constructor() {
    this.init();
  }

  async init() {
    await this.checkAuthStatus();
    this.setupEventListeners();
  }

  async checkAuthStatus() {
    const loading = document.getElementById('loading');
    const statusContainer = document.getElementById('status-container');
    const authStatus = document.getElementById('auth-status');
    const authIcon = document.getElementById('auth-icon');
    const authDescription = document.getElementById('auth-description');

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'getAuthStatus'
      });

      if (response?.success) {
        const { authenticated, tokens } = response;
        
        loading.classList.add('hidden');
        statusContainer.classList.remove('hidden');

        if (authenticated) {
          authStatus.classList.add('success');
          authStatus.classList.remove('error');
          authIcon.textContent = '✅';
          authDescription.textContent = 'Successfully authenticated with X/Twitter. The extension is ready to load comments.';
        } else {
          authStatus.classList.add('error');
          authStatus.classList.remove('success');
          authIcon.textContent = '❌';
          authDescription.textContent = 'Not authenticated. Please visit X/Twitter and log in to use the extension.';
        }
      } else {
        throw new Error('Failed to check authentication status');
      }
    } catch (error) {
      console.error('Error checking auth status:', error);
      
      loading.classList.add('hidden');
      statusContainer.classList.remove('hidden');
      authStatus.classList.add('error');
      authIcon.textContent = '⚠️';
      authDescription.textContent = 'Error checking authentication status. Please try refreshing.';
    }
  }

  setupEventListeners() {
    const refreshBtn = document.getElementById('refresh-btn');
    const openTwitterBtn = document.getElementById('open-twitter');

    refreshBtn?.addEventListener('click', async () => {
      refreshBtn.disabled = true;
      refreshBtn.textContent = 'Refreshing...';
      
      await this.checkAuthStatus();
      
      refreshBtn.disabled = false;
      refreshBtn.textContent = 'Refresh Status';
    });

    openTwitterBtn?.addEventListener('click', () => {
      chrome.tabs.create({ url: 'https://x.com' });
      window.close();
    });
  }
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new PopupManager();
});