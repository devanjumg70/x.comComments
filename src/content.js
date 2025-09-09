// Content Script - Phase 1: Core Setup & Phase 4: UI Implementation
class TwitterCommentsSidebar {
  constructor() {
    this.sidebarVisible = false;
    this.currentTweetId = null;
    this.comments = [];
    this.loading = false;
    this.cursor = null;
    
    this.init();
  }

  async init() {
    console.log('Twitter Comments Sidebar initializing...');
    
    // Wait for page to load
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.setup());
    } else {
      this.setup();
    }
  }

  async setup() {
    // Extract cookies on initialization
    await this.extractCookies();
    
    // Create sidebar
    this.createSidebar();
    
    // Setup URL change listener for SPA navigation
    this.setupNavigationListener();
    
    // Setup tweet click listener
    this.setupTweetClickListener();
    
    // Check if we're on a tweet page
    this.checkCurrentPage();
  }

  async extractCookies() {
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'extractCookies'
      });
      
      if (response?.success) {
        console.log('Cookies extracted successfully');
      }
    } catch (error) {
      console.error('Failed to extract cookies:', error);
    }
  }

  createSidebar() {
    // Remove existing sidebar
    const existingSidebar = document.getElementById('twitter-comments-sidebar');
    if (existingSidebar) {
      existingSidebar.remove();
    }

    // Create sidebar container
    const sidebar = document.createElement('div');
    sidebar.id = 'twitter-comments-sidebar';
    sidebar.className = 'twitter-comments-sidebar hidden';
    
    sidebar.innerHTML = `
      <div class="sidebar-header">
        <div class="sidebar-title">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
          </svg>
          Tweet Comments
        </div>
        <button class="sidebar-close" onclick="window.twitterSidebar?.toggleSidebar()">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          </svg>
        </button>
      </div>
      
      <div class="sidebar-content">
        <div class="sidebar-loading">
          <div class="loading-spinner"></div>
          <span>Loading comments...</span>
        </div>
        
        <div class="sidebar-error hidden">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
          </svg>
          <span>Failed to load comments</span>
          <button class="retry-btn" onclick="window.twitterSidebar?.loadComments()">Retry</button>
        </div>
        
        <div class="comments-container">
          <div class="comments-list"></div>
          <button class="load-more-btn hidden" onclick="window.twitterSidebar?.loadMoreComments()">
            Load More Comments
          </button>
        </div>
      </div>
      
      <div class="sidebar-footer">
        <div class="comment-stats">
          <span class="comment-count">0 comments loaded</span>
        </div>
      </div>
    `;

    document.body.appendChild(sidebar);
    
    // Make sidebar globally accessible
    window.twitterSidebar = this;
  }

  setupNavigationListener() {
    // Listen for URL changes in SPA
    let lastUrl = location.href;
    new MutationObserver(() => {
      const url = location.href;
      if (url !== lastUrl) {
        lastUrl = url;
        this.checkCurrentPage();
      }
    }).observe(document, { subtree: true, childList: true });
  }

  setupTweetClickListener() {
    document.addEventListener('click', (event) => {
      const tweetElement = event.target.closest('[data-testid="tweet"]');
      if (tweetElement) {
        const tweetId = this.extractTweetIdFromElement(tweetElement);
        if (tweetId && tweetId !== this.currentTweetId) {
          setTimeout(() => {
            this.checkCurrentPage();
          }, 100);
        }
      }
    });
  }

  checkCurrentPage() {
    const tweetId = this.extractTweetIdFromUrl();
    if (tweetId && tweetId !== this.currentTweetId) {
      this.currentTweetId = tweetId;
      this.showSidebar();
      this.loadComments();
    } else if (!tweetId && this.sidebarVisible) {
      this.hideSidebar();
    }
  }

  extractTweetIdFromUrl() {
    const match = window.location.pathname.match(/\/status\/(\d+)/);
    return match ? match[1] : null;
  }

  extractTweetIdFromElement(element) {
    const link = element.querySelector('a[href*="/status/"]');
    if (link) {
      const match = link.href.match(/\/status\/(\d+)/);
      return match ? match[1] : null;
    }
    return null;
  }

  showSidebar() {
    const sidebar = document.getElementById('twitter-comments-sidebar');
    if (sidebar) {
      sidebar.classList.remove('hidden');
      this.sidebarVisible = true;
      
      // Adjust main content
      const mainContent = document.querySelector('main[role="main"]');
      if (mainContent) {
        mainContent.style.marginRight = '350px';
      }
    }
  }

  hideSidebar() {
    const sidebar = document.getElementById('twitter-comments-sidebar');
    if (sidebar) {
      sidebar.classList.add('hidden');
      this.sidebarVisible = false;
      
      // Reset main content
      const mainContent = document.querySelector('main[role="main"]');
      if (mainContent) {
        mainContent.style.marginRight = '';
      }
    }
  }

  toggleSidebar() {
    if (this.sidebarVisible) {
      this.hideSidebar();
    } else {
      this.showSidebar();
    }
  }

  async loadComments() {
    if (!this.currentTweetId || this.loading) return;

    this.loading = true;
    this.showLoading();

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'fetchComments',
        tweetId: this.currentTweetId,
        cursor: null
      });

      if (response?.success) {
        this.comments = response.comments || [];
        this.renderComments();
        this.hideLoading();
      } else {
        throw new Error(response?.error || 'Failed to fetch comments');
      }
    } catch (error) {
      console.error('Error loading comments:', error);
      this.showError();
    } finally {
      this.loading = false;
    }
  }

  async loadMoreComments() {
    if (!this.currentTweetId || this.loading || !this.cursor) return;

    this.loading = true;
    
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'fetchComments',
        tweetId: this.currentTweetId,
        cursor: this.cursor
      });

      if (response?.success) {
        const newComments = response.comments || [];
        this.comments.push(...newComments);
        this.renderComments();
      }
    } catch (error) {
      console.error('Error loading more comments:', error);
    } finally {
      this.loading = false;
    }
  }

  renderComments() {
    const commentsList = document.querySelector('.comments-list');
    const commentCount = document.querySelector('.comment-count');
    
    if (!commentsList || !commentCount) return;

    commentsList.innerHTML = '';
    
    if (this.comments.length === 0) {
      commentsList.innerHTML = `
        <div class="no-comments">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor" opacity="0.5">
            <path d="M20 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h4l4 4 4-4h4c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
          </svg>
          <p>No comments available</p>
          <span>Be the first to comment on this tweet</span>
        </div>
      `;
    } else {
      this.comments.forEach(comment => {
        const commentElement = this.createCommentElement(comment);
        commentsList.appendChild(commentElement);
      });
    }

    commentCount.textContent = `${this.comments.length} comments loaded`;
  }

  createCommentElement(comment) {
    const commentDiv = document.createElement('div');
    commentDiv.className = 'comment-item';
    commentDiv.innerHTML = `
      <div class="comment-header">
        <img src="${comment.user.profile_image}" alt="${comment.user.name}" class="comment-avatar">
        <div class="comment-user">
          <span class="comment-name">${comment.user.name}</span>
          ${comment.user.verified ? '<svg class="verified-badge" width="16" height="16" viewBox="0 0 24 24" fill="#1d9bf0"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>' : ''}
          <span class="comment-username">@${comment.user.username}</span>
        </div>
        <span class="comment-time">${this.formatTime(comment.created_at)}</span>
      </div>
      <div class="comment-content">
        <p>${this.formatText(comment.text)}</p>
      </div>
      <div class="comment-actions">
        <button class="comment-action">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M14.046 2.242l-4.148-.01h-.002c-4.374 0-7.8 3.427-7.8 7.802 0 4.098 3.186 7.206 7.465 7.37v3.828c0 .108.044.286.12.403.142.225.384.347.632.347.138 0 .277-.038.402-.118.264-.168 6.473-4.14 8.088-5.506 1.902-1.61 3.04-3.97 3.043-6.312v-.017c-.006-4.367-3.43-7.787-7.8-7.788zm3.787 12.972c-1.134.96-4.862 3.405-6.772 4.643V16.67c0-.414-.335-.75-.75-.75h-.396c-3.66 0-6.318-2.476-6.318-5.886 0-3.534 2.768-6.302 6.3-6.302l4.147.01h.002c3.532 0 6.3 2.766 6.302 6.296-.003 1.91-.942 3.844-2.514 5.176z"/>
          </svg>
          <span>${comment.reply_count}</span>
        </button>
        <button class="comment-action">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M23.77 15.67c-.292-.293-.767-.293-1.06 0l-2.22 2.22V7.65c0-2.068-1.683-3.75-3.75-3.75h-5.85c-.414 0-.75.336-.75.75s.336.75.75.75h5.85c1.24 0 2.25 1.01 2.25 2.25v10.24l-2.22-2.22c-.293-.293-.768-.293-1.061 0s-.293.768 0 1.061l3.5 3.5c.145.147.337.22.53.22s.383-.072.53-.22l3.5-3.5c.294-.292.294-.767.001-1.06z"/>
            <path d="M10.22 5.69c.292.293.767.293 1.06 0l2.22-2.22V14.41c0 2.068 1.683 3.75 3.75 3.75h5.85c.414 0 .75-.336.75-.75s-.336-.75-.75-.75h-5.85c-1.24 0-2.25-1.01-2.25-2.25V3.17l2.22 2.22c.293.293.768.293 1.061 0s.293-.768 0-1.061L14.53.83c-.147-.145-.337-.22-.53-.22s-.383.072-.53.22L10.22 4.33c-.294.292-.294.767-.001 1.06z"/>
          </svg>
          <span>${comment.retweet_count}</span>
        </button>
        <button class="comment-action">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 21.638h-.014C9.403 21.59 1.95 14.856 1.95 8.478c0-3.064 2.525-5.754 5.403-5.754 2.29 0 3.83 1.58 4.646 2.73.814-1.148 2.354-2.73 4.645-2.73 2.88 0 5.404 2.69 5.404 5.755 0 6.376-7.454 13.11-10.037 13.157H12zM7.354 4.225c-2.08 0-3.903 1.988-3.903 4.255 0 5.74 7.034 11.596 8.55 11.658 1.518-.062 8.55-5.917 8.55-11.658 0-2.267-1.822-4.255-3.902-4.255-2.528 0-3.94 2.936-3.952 2.965-.23.562-1.156.562-1.387 0-.014-.03-1.425-2.965-3.954-2.965z"/>
          </svg>
          <span>${comment.favorite_count}</span>
        </button>
      </div>
    `;

    return commentDiv;
  }

  formatText(text) {
    // Basic text formatting - replace URLs, mentions, hashtags
    return text
      .replace(/https?:\/\/[^\s]+/g, '<a href="$&" target="_blank" rel="noopener">$&</a>')
      .replace(/@(\w+)/g, '<a href="https://x.com/$1" target="_blank" rel="noopener">@$1</a>')
      .replace(/#(\w+)/g, '<a href="https://x.com/hashtag/$1" target="_blank" rel="noopener">#$1</a>');
  }

  formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInMinutes = Math.floor((now - date) / (1000 * 60));

    if (diffInMinutes < 1) return 'now';
    if (diffInMinutes < 60) return `${diffInMinutes}m`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h`;
    return `${Math.floor(diffInMinutes / 1440)}d`;
  }

  showLoading() {
    const loading = document.querySelector('.sidebar-loading');
    const error = document.querySelector('.sidebar-error');
    const content = document.querySelector('.comments-container');

    if (loading) loading.classList.remove('hidden');
    if (error) error.classList.add('hidden');
    if (content) content.classList.add('hidden');
  }

  hideLoading() {
    const loading = document.querySelector('.sidebar-loading');
    const content = document.querySelector('.comments-container');

    if (loading) loading.classList.add('hidden');
    if (content) content.classList.remove('hidden');
  }

  showError() {
    const loading = document.querySelector('.sidebar-loading');
    const error = document.querySelector('.sidebar-error');
    const content = document.querySelector('.comments-container');

    if (loading) loading.classList.add('hidden');
    if (error) error.classList.remove('hidden');
    if (content) content.classList.add('hidden');
  }
}

// Initialize the sidebar when the script loads
const sidebar = new TwitterCommentsSidebar();