// Background Service Worker - Phase 2: Authentication & Headers
class TwitterAuthManager {
  constructor() {
    this.authTokens = {
      auth_token: null,
      ct0: null,
      guest_id: null,
      bearer_token: 'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA'
    };
    this.headers = {};
    this.init();
  }

  async init() {
    await this.loadStoredTokens();
    await this.setupCookieListener();
  }

  async loadStoredTokens() {
    try {
      const stored = await chrome.storage.local.get(['twitter_tokens']);
      if (stored.twitter_tokens) {
        this.authTokens = { ...this.authTokens, ...stored.twitter_tokens };
      }
    } catch (error) {
      console.error('Failed to load stored tokens:', error);
    }
  }

  async extractCookiesFromTab(tabId) {
    try {
      const cookies = await chrome.cookies.getAll({
        domain: '.x.com'
      });

      const cookieMap = {};
      cookies.forEach(cookie => {
        cookieMap[cookie.name] = cookie.value;
      });

      // Extract required tokens
      if (cookieMap.auth_token) {
        this.authTokens.auth_token = cookieMap.auth_token;
      }
      if (cookieMap.ct0) {
        this.authTokens.ct0 = cookieMap.ct0;
      }
      if (cookieMap.guest_id) {
        this.authTokens.guest_id = cookieMap.guest_id;
      }

      await this.saveTokens();
      await this.buildHeaders();
      
      return this.authTokens;
    } catch (error) {
      console.error('Cookie extraction failed:', error);
      return null;
    }
  }

  async buildHeaders() {
    this.headers = {
      'Authorization': `Bearer ${this.authTokens.bearer_token}`,
      'X-Csrf-Token': this.authTokens.ct0 || '',
      'X-Guest-Token': this.authTokens.guest_id || '',
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'X-Twitter-Active-User': 'yes',
      'X-Twitter-Auth-Type': 'OAuth2Session',
      'X-Twitter-Client-Language': 'en',
      'Referer': 'https://x.com/',
      'Origin': 'https://x.com'
    };

    if (this.authTokens.auth_token) {
      this.headers['Cookie'] = `auth_token=${this.authTokens.auth_token}; ct0=${this.authTokens.ct0}; guest_id=${this.authTokens.guest_id}`;
    }
  }

  async saveTokens() {
    try {
      await chrome.storage.local.set({
        twitter_tokens: this.authTokens,
        headers: this.headers
      });
    } catch (error) {
      console.error('Failed to save tokens:', error);
    }
  }

  async setupCookieListener() {
    chrome.cookies.onChanged.addListener(async (changeInfo) => {
      if (changeInfo.cookie.domain.includes('x.com') || changeInfo.cookie.domain.includes('twitter.com')) {
        if (['auth_token', 'ct0', 'guest_id'].includes(changeInfo.cookie.name)) {
          console.log('Twitter cookie changed:', changeInfo.cookie.name);
          // Re-extract cookies when they change
          const tabs = await chrome.tabs.query({
            url: ['*://x.com/*', '*://twitter.com/*']
          });
          if (tabs.length > 0) {
            await this.extractCookiesFromTab(tabs[0].id);
          }
        }
      }
    });
  }

  getHeaders() {
    return this.headers;
  }

  getTokens() {
    return this.authTokens;
  }
}

// Phase 3: API Integration
class TwitterAPIClient {
  constructor(authManager) {
    this.authManager = authManager;
    this.baseURL = 'https://twitter.com/i/api/graphql';
    this.endpoints = {
      tweetDetail: 'VWxGj2zgkpTEP4Jo0SNKtw/TweetDetail',
      userTweets: 'CdG2Vuc1v6F5JyEngHWw9A/UserTweets'
    };
  }

  async fetchTweetComments(tweetId, cursor = null) {
    const headers = this.authManager.getHeaders();
    
    const variables = {
      focalTweetId: tweetId,
      with_rux_injections: false,
      includePromotedContent: true,
      withCommunity: true,
      withQuickPromoteEligibilityTweetFields: true,
      withBirdwatchNotes: true,
      withVoice: true,
      withV2Timeline: true
    };

    if (cursor) {
      variables.cursor = cursor;
    }

    const features = {
      rweb_lists_timeline_redesign_enabled: true,
      responsive_web_graphql_exclude_directive_enabled: true,
      verified_phone_label_enabled: false,
      creator_subscriptions_tweet_preview_api_enabled: true,
      responsive_web_graphql_timeline_navigation_enabled: true,
      responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
      tweetypie_unmention_optimization_enabled: true,
      responsive_web_edit_tweet_api_enabled: true,
      graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
      view_counts_everywhere_api_enabled: true,
      longform_notetweets_consumption_enabled: true,
      responsive_web_twitter_article_tweet_consumption_enabled: false,
      tweet_awards_web_tipping_enabled: false,
      freedom_of_speech_not_reach_fetch_enabled: true,
      standardized_nudges_misinfo: true,
      tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
      longform_notetweets_rich_text_read_enabled: true,
      longform_notetweets_inline_media_enabled: true,
      responsive_web_media_download_video_enabled: false,
      responsive_web_enhance_cards_enabled: false
    };

    const url = new URL(`${this.baseURL}/${this.endpoints.tweetDetail}`);
    url.searchParams.append('variables', JSON.stringify(variables));
    url.searchParams.append('features', JSON.stringify(features));

    try {
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: headers
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return this.parseCommentsFromResponse(data);
    } catch (error) {
      console.error('Failed to fetch tweet comments:', error);
      throw error;
    }
  }

  parseCommentsFromResponse(data) {
    const comments = [];
    
    try {
      const instructions = data?.data?.threaded_conversation_with_injections_v2?.instructions || [];
      
      for (const instruction of instructions) {
        if (instruction.type === 'TimelineAddEntries') {
          for (const entry of instruction.entries) {
            if (entry.content?.entryType === 'TimelineTimelineItem') {
              const tweet = entry.content?.itemContent?.tweet_results?.result;
              if (tweet && tweet.legacy) {
                const comment = this.formatComment(tweet);
                if (comment) {
                  comments.push(comment);
                }
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('Error parsing comments:', error);
    }

    return comments;
  }

  formatComment(tweet) {
    try {
      const user = tweet.core?.user_results?.result?.legacy;
      const tweetData = tweet.legacy;

      if (!user || !tweetData) return null;

      return {
        id: tweetData.id_str,
        text: tweetData.full_text,
        user: {
          name: user.name,
          username: user.screen_name,
          profile_image: user.profile_image_url_https,
          verified: user.verified
        },
        created_at: tweetData.created_at,
        reply_count: tweetData.reply_count,
        retweet_count: tweetData.retweet_count,
        favorite_count: tweetData.favorite_count,
        conversation_id: tweetData.conversation_id_str
      };
    } catch (error) {
      console.error('Error formatting comment:', error);
      return null;
    }
  }
}

// Initialize managers
const authManager = new TwitterAuthManager();
const apiClient = new TwitterAPIClient(authManager);

// Message handling
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  (async () => {
    try {
      switch (request.action) {
        case 'extractCookies':
          const tokens = await authManager.extractCookiesFromTab(sender.tab.id);
          sendResponse({ success: true, tokens });
          break;

        case 'fetchComments':
          const comments = await apiClient.fetchTweetComments(request.tweetId, request.cursor);
          sendResponse({ success: true, comments });
          break;

        case 'getAuthStatus':
          const authTokens = authManager.getTokens();
          sendResponse({ 
            success: true, 
            authenticated: !!authTokens.auth_token,
            tokens: authTokens 
          });
          break;

        default:
          sendResponse({ success: false, error: 'Unknown action' });
      }
    } catch (error) {
      console.error('Background script error:', error);
      sendResponse({ success: false, error: error.message });
    }
  })();
  
  return true; // Keep message channel open for async response
});