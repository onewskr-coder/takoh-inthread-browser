/* TAKOH Media Downloader PRO - Meta Main World Bridge */

(() => {
  console.log('[TAKOH MAIN] Meta Main World bridge active');

  // Leak-proof scanner to recursively search React Fiber props for video URLs
  const searchObj = (obj, depth = 0) => {
    if (!obj || depth > 8) return null;
    
    // Safety check: skip arrays of posts or timeline lists
    if (Array.isArray(obj) && obj.length > 5) {
      return null;
    }

    for (const key in obj) {
      try {
        const val = obj[key];
        if (typeof val === 'string' && val.startsWith('http') && (val.includes('cdninstagram') || val.includes('fbcdn'))) {
          const isVideoKey = /video|playable|stream|source|hd|sd|src/i.test(key);
          const isVideoUrl = val.includes('.mp4') || val.includes('/v/') || val.includes('/o1/v/') || isVideoKey;
          const isImage = val.includes('.jpg') || val.includes('.webp') || val.includes('.png') || val.includes('_n.jpg');
          const isHls = val.includes('.m3u8') || val.includes('.mpd') || val.includes('/hls-') || val.includes('m3u8') || val.includes('.m3u');
          
          if (isVideoUrl && !isImage && !isHls) {
            return val;
          }
        }
        if (typeof val === 'object' && val !== null) {
          if (key.startsWith('__') || key === 'current' || key === 'stateNode' || key === 'return' || val.nodeType) continue;
          if (Array.isArray(val) && val.length > 5) continue;
          
          const res = searchObj(val, depth + 1);
          if (res) return res;
        }
      } catch (e) {}
    }
    return null;
  };

  const findVideoUrlFromReactProps = (element) => {
    if (!element) return null;
    const keys = Object.keys(element);
    const fiberKey = keys.find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
    if (!fiberKey) {
      console.log('[TAKOH MAIN] React fiber key not found on element keys:', keys);
      return null;
    }
    
    const fiberNode = element[fiberKey];
    if (!fiberNode) return null;
    
    let currentFiber = fiberNode;
    let levelsChecked = 0;
    
    // Safe to search up to 15 levels because searchObj is leak-proof and skips lists/posts
    while (currentFiber && levelsChecked < 15) {
      levelsChecked++;
      
      const compName = typeof currentFiber.type === 'function' 
        ? (currentFiber.type.displayName || currentFiber.type.name || 'Anonymous') 
        : (typeof currentFiber.type === 'string' ? currentFiber.type : 'Unknown');
        
      if (currentFiber.memoizedProps) {
        const url = searchObj(currentFiber.memoizedProps);
        if (url) {
          console.log(`[TAKOH MAIN] Found URL in memoizedProps at Fiber level ${levelsChecked} (${compName}):`, url);
          return url;
        }
      }
      if (currentFiber.pendingProps) {
        const url = searchObj(currentFiber.pendingProps);
        if (url) {
          console.log(`[TAKOH MAIN] Found URL in pendingProps at Fiber level ${levelsChecked} (${compName}):`, url);
          return url;
        }
      }
      if (currentFiber.memoizedState) {
        const url = searchObj(currentFiber.memoizedState);
        if (url) {
          console.log(`[TAKOH MAIN] Found URL in memoizedState at Fiber level ${levelsChecked} (${compName}):`, url);
          return url;
        }
      }
      currentFiber = currentFiber.return;
    }
    console.log('[TAKOH MAIN] Video URL not found in Fiber tree');
    return null;
  };

  // Listen for request events from the isolated world content scripts
  document.addEventListener('TAKOH_REQUEST_URL', (e) => {
    const { targetId } = e.detail;
    if (!targetId) return;
    
    console.log('[TAKOH MAIN] Received request for targetId:', targetId);

    // Prefer direct element reference if passed, fallback to DOM query
    let videoEl = e.detail.videoEl;
    if (!videoEl) {
      videoEl = document.querySelector(`video[data-takoh-target="${targetId}"]`);
    }
    
    if (!videoEl) {
      // Search recursively in shadow DOMs as final fallback
      const searchShadowForTarget = (root) => {
        if (!root) return null;
        if (root.tagName === 'VIDEO' && root.getAttribute('data-takoh-target') === targetId) return root;
        const el = root.querySelector(`video[data-takoh-target="${targetId}"]`);
        if (el) return el;
        if (root.shadowRoot) {
          const res = searchShadowForTarget(root.shadowRoot);
          if (res) return res;
        }
        for (const child of root.children) {
          const res = searchShadowForTarget(child);
          if (res) return res;
        }
        return null;
      };
      videoEl = searchShadowForTarget(document.body);
    }

    console.log('[TAKOH MAIN] Target video element resolved:', videoEl);

    let foundUrl = null;
    if (videoEl) {
      foundUrl = findVideoUrlFromReactProps(videoEl);
    }

    console.log('[TAKOH MAIN] Sending response back for targetId:', targetId, 'Url:', foundUrl);

    // Dispatch the response back to the isolated world
    document.dispatchEvent(new CustomEvent('TAKOH_RESPONSE_URL', {
      detail: { targetId, videoUrl: foundUrl }
    }));
  });

  // ========== Reels Fetch Handler (runs in PAGE context with full cookies) ==========
  document.addEventListener('TAKOH_REQUEST_REELS', async (e) => {
    const username = e.detail && e.detail.username;
    const requestId = e.detail && e.detail.requestId;
    if (!username || !requestId) return;

    console.log('[TAKOH MAIN] Reels fetch request for @' + username, 'requestId:', requestId);

    const sendResponse = (data) => {
      document.dispatchEvent(new CustomEvent('TAKOH_RESPONSE_REELS', {
        detail: JSON.stringify({ requestId: requestId, ...data })
      }));
    };

    try {
      const csrfMatch = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
      const csrf = csrfMatch ? csrfMatch[1] : '';

      // Common headers
      const defaultHeaders = {
        'x-ig-app-id': '936619743392459',
        'x-requested-with': 'XMLHttpRequest',
        'x-csrftoken': csrf,
        'x-asbd-id': '129477'
      };

      // Step 1: Get user ID & initial edge clips if available
      console.log('[TAKOH MAIN] Fetching web_profile_info for @' + username);
      const profileRes = await fetch('https://www.instagram.com/api/v1/users/web_profile_info/?username=' + encodeURIComponent(username), {
        headers: defaultHeaders,
        credentials: 'include'
      });

      const profileText = await profileRes.text();
      const normalizedProfileText=profileText.trimStart();
      if (!profileRes.ok || !normalizedProfileText.startsWith('{')) {
        const authRedirect=/\/(?:accounts\/login|challenge|auth_platform)(?:\/|\?|$)/.test(profileRes.url||'');
        const error=profileRes.status===429?'rate_limited':authRedirect?'login_required':'profile_api_unavailable';
        // HTML may be a logged-in app shell, not evidence of a failed login.
        // The isolated-world caller falls back to collecting visible profile tiles.
        sendResponse({ error, status:profileRes.status, items: [] });
        return;
      }

      let profileData;
      try{profileData=JSON.parse(normalizedProfileText);}catch{
        sendResponse({error:'invalid_profile_response',items:[]});return;
      }
      const user = profileData?.data?.user;
      const userId = user?.id;

      if (!userId) {
        sendResponse({ error: 'no_user_id', items: [] });
        return;
      }

      console.log('[TAKOH MAIN] Got user ID:', userId);

      const allClips = [];
      const seenCodes = new Set();

      const parseMediaNode = (media) => {
        if (!media) return null;
        const code = media.code || media.shortcode || '';
        if (!code || seenCodes.has(code)) return null;
        seenCodes.add(code);

        let thumbUrl = '';
        if (media.image_versions2?.candidates?.length > 0) {
          thumbUrl = media.image_versions2.candidates[0].url;
        } else if (media.display_url) {
          thumbUrl = media.display_url;
        } else if (media.thumbnail_src) {
          thumbUrl = media.thumbnail_src;
        }

        let videoUrl = '';
        if (media.video_versions?.length > 0) {
          videoUrl = media.video_versions[0].url;
        } else if (media.video_url) {
          videoUrl = media.video_url;
        }

        let captionText = '';
        if (typeof media.caption === 'string') {
          captionText = media.caption;
        } else if (media.caption?.text) {
          captionText = media.caption.text;
        } else if (media.edge_media_to_caption?.edges?.[0]?.node?.text) {
          captionText = media.edge_media_to_caption.edges[0].node.text;
        }

        const playCount = Number(
          media.play_count ||
          media.view_count ||
          media.video_view_count ||
          media.video_play_count ||
          media.metrics?.play_count ||
          0
        );

        const likeCount = Number(
          media.like_count ||
          media.edge_media_preview_like?.count ||
          media.edge_liked_by?.count ||
          0
        );

        const commentCount = Number(
          media.comment_count ||
          media.edge_media_to_comment?.count ||
          0
        );

        return {
          code: code,
          playCount: playCount,
          likeCount: likeCount,
          commentCount: commentCount,
          thumbUrl: thumbUrl,
          videoUrl: videoUrl,
          caption: captionText,
          url: 'https://www.instagram.com/reel/' + code + '/'
        };
      };

      // Step 2: Extract clips from web_profile_info if present
      const initialEdges = user?.edge_felix_video_timeline?.edges || user?.edge_owner_to_timeline_media?.edges || [];
      for (const edge of initialEdges) {
        const item = parseMediaNode(edge.node);
        if (item) allClips.push(item);
      }
      console.log('[TAKOH MAIN] Initial profile clips found:', allClips.length);

      // Step 3: Paginate via GraphQL clips query & timeline query
      let afterCursor = '';
      let pageCount = 0;
      const maxPages = 40; // Up to ~500+ reels
      let hasNextPage = true;

      // Current active doc_ids used by Instagram Web
      const activeDocIds = [
        '8489812497705139', // Latest Web Clips User Query
        '25586616424262925',
        '23983196307997576',
        '7871146746274479'
      ];

      while (hasNextPage && pageCount < maxPages) {
        pageCount++;
        let pageItemsCount = 0;
        let querySuccess = false;

        // Method 1: Web doc_id GraphQL query
        const variables = {
          data: {
            include_feed_video: true,
            page_size: 24,
            target_user_id: userId
          }
        };
        if (afterCursor) {
          variables.data.max_id = afterCursor;
        }

        for (const docId of activeDocIds) {
          try {
            const formData = new URLSearchParams();
            formData.append('doc_id', docId);
            formData.append('variables', JSON.stringify(variables));

            const gqlRes = await fetch('https://www.instagram.com/graphql/query', {
              method: 'POST',
              headers: {
                ...defaultHeaders,
                'content-type': 'application/x-www-form-urlencoded'
              },
              credentials: 'include',
              body: formData.toString()
            });

            const gqlText = await gqlRes.text();
            if (gqlText.startsWith('{')) {
              const gqlData = JSON.parse(gqlText);
              const connection = gqlData?.data?.xdt_api__v1__clips__user__connection_v2 ||
                                 gqlData?.data?.xdt_api__v1__clips__user__connection ||
                                 gqlData?.data?.user?.edge_felix_video_timeline;
              
              if (connection && connection.edges && connection.edges.length > 0) {
                for (const e of connection.edges) {
                  const node = e.node?.media || e.node;
                  const item = parseMediaNode(node);
                  if (item) {
                    allClips.push(item);
                    pageItemsCount++;
                  }
                }

                hasNextPage = !!(connection.page_info?.has_next_page || connection.paging_info?.more_available);
                afterCursor = connection.page_info?.end_cursor || connection.paging_info?.max_id || '';
                querySuccess = true;
                console.log('[TAKOH MAIN] Successfully fetched page', pageCount, 'with doc_id', docId, 'count:', pageItemsCount);
                break;
              }
            }
          } catch (e) {
            console.warn('[TAKOH MAIN] doc_id ' + docId + ' error:', e);
          }
        }

        // Method 2: Feed timeline query via GET if doc_id failed
        if (!querySuccess) {
          try {
            const tlVars = { id: userId, first: 24 };
            if (afterCursor) tlVars.after = afterCursor;

            const tlUrl = 'https://www.instagram.com/api/v1/feed/user/' + userId + '/?count=24' + (afterCursor ? '&max_id=' + afterCursor : '');
            const feedRes = await fetch(tlUrl, {
              headers: defaultHeaders,
              credentials: 'include'
            });

            const feedText = await feedRes.text();
            if (feedText.startsWith('{')) {
              const feedData = JSON.parse(feedText);
              const items = feedData?.items || [];
              for (const it of items) {
                const node = it.media || it;
                if (node.is_video !== false || node.media_type === 2) {
                  const item = parseMediaNode(node);
                  if (item) {
                    allClips.push(item);
                    pageItemsCount++;
                  }
                }
              }

              hasNextPage = !!feedData?.more_available;
              afterCursor = feedData?.next_max_id || '';
              if (items.length > 0) {
                querySuccess = true;
                console.log('[TAKOH MAIN] Feed user API succeeded on page', pageCount, 'items:', items.length);
              }
            }
          } catch (err) {
            console.warn('[TAKOH MAIN] Feed user API error:', err);
          }
        }

        sendResponse({ progress: true, count: allClips.length, page: pageCount });

        if (!querySuccess || pageItemsCount === 0 || !hasNextPage || !afterCursor) {
          console.log('[TAKOH MAIN] Reached end of pagination at page', pageCount, 'total clips:', allClips.length);
          break;
        }

        await new Promise(r => setTimeout(r, 300));
      }

      console.log('[TAKOH MAIN] Total reels collected:', allClips.length);
      sendResponse({ done: true, items: allClips });

    } catch (err) {
      console.error('[TAKOH MAIN] Reels fetch error:', err);
      sendResponse({ error: String(err.message || err), items: [] });
    }
  });
})();



