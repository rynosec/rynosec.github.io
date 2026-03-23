(() => {
  const SIDEBAR_SELECTOR = '#sidebar nav';
  const LISTENING_URL = '/listening.txt';

  const hashDuration = (seed) => {
    let hash = 0;
    for (let i = 0; i < seed.length; i += 1) {
      hash = (hash << 5) - hash + seed.charCodeAt(i);
      hash |= 0;
    }
    const min = 120000;
    const max = 210000;
    return (Math.abs(hash) % (max - min + 1)) + min;
  };

  const extractVideoId = (url, fallback) => {
    try {
      const parsed = new URL(url);
      if (parsed.hostname.includes('youtube.com')) return parsed.searchParams.get('v') || fallback;
      if (parsed.hostname.includes('youtu.be')) return parsed.pathname.replace(/^\//, '') || fallback;
    } catch (_) {}
    return fallback;
  };

  const parseLine = (line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return null;

    const normalized = trimmed.replace(/\|\|/g, '|');
    const parts = normalized
      .split('|')
      .map((part) => part.trim())
      .filter(Boolean);

    if (parts.length < 2) return null;

    const [url, second, third] = parts;
    const fallbackId = `track-${index}`;
    const id = extractVideoId(url, fallbackId);

    let title = second;
    let artist = third || second;

    if (parts.length === 2) {
      title = second;
      artist = 'Unknown Artist';
    }

    return {
      id,
      url,
      title,
      artist,
      duration: hashDuration(`${id}${title}${artist}`),
    };
  };

  const formatTime = (seconds) => {
    const total = Math.max(0, Math.floor(seconds));
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  const pickCurrentTrack = (tracks) => {
    const totalDuration = tracks.reduce((sum, track) => sum + track.duration, 0);
    if (!totalDuration) return null;

    let cursor = Date.now() % totalDuration;
    let elapsed = 0;
    let current = tracks[0];

    for (const track of tracks) {
      if (cursor < elapsed + track.duration) {
        current = track;
        break;
      }
      elapsed += track.duration;
    }

    const seek = (cursor - elapsed) / 1000;
    return { current, seek };
  };

  const createWidget = () => {
    const widget = document.createElement('section');
    widget.className = 'now-playing-widget';
    widget.innerHTML = `
      <div class="now-playing-inner">
        <div class="now-playing-cover-wrap">
          <img class="now-playing-cover" alt="Album art" hidden>
          <div class="now-playing-fallback">
            <div class="now-playing-bars"><span></span><span></span><span></span><span></span></div>
          </div>
          <div class="now-playing-gradient"></div>
        </div>
        <div class="now-playing-content">
          <div class="now-playing-meta">
            <span class="now-playing-label"><span class="now-playing-dot"></span>NOW PLAYING</span>
            <a class="now-playing-open" href="#" target="_blank" rel="noopener noreferrer" aria-label="Open track">↗</a>
          </div>
          <div class="now-playing-copy">
            <div class="now-playing-title">Loading track…</div>
            <div class="now-playing-artist">reading listening.txt</div>
          </div>
          <div class="now-playing-progress">
            <div class="now-playing-progress-bar"></div>
          </div>
          <div class="now-playing-time">
            <span class="now-playing-elapsed">0:00</span>
            <span class="now-playing-duration">0:00</span>
          </div>
        </div>
      </div>
    `;
    return widget;
  };

  const mount = async () => {
    const nav = document.querySelector(SIDEBAR_SELECTOR);
    const sidebarBottom = document.querySelector('#sidebar .sidebar-bottom');
    if (!nav || !sidebarBottom || document.querySelector('.now-playing-widget, .now-playing-empty')) return;

    const widget = createWidget();
    sidebarBottom.parentNode.insertBefore(widget, sidebarBottom);

    try {
      const response = await fetch(LISTENING_URL, { cache: 'no-store' });
      const text = await response.text();
      const tracks = text
        .split('\n')
        .map((line, index) => parseLine(line, index))
        .filter(Boolean);

      if (!tracks.length) {
        widget.replaceWith(Object.assign(document.createElement('div'), {
          className: 'now-playing-empty',
          textContent: 'Add tracks to listening.txt to enable the music widget.',
        }));
        return;
      }

      const cover = widget.querySelector('.now-playing-cover');
      const fallback = widget.querySelector('.now-playing-fallback');
      const title = widget.querySelector('.now-playing-title');
      const artist = widget.querySelector('.now-playing-artist');
      const open = widget.querySelector('.now-playing-open');
      const progressBar = widget.querySelector('.now-playing-progress-bar');
      const elapsedTime = widget.querySelector('.now-playing-elapsed');
      const durationTime = widget.querySelector('.now-playing-duration');

      const render = () => {
        const state = pickCurrentTrack(tracks);
        if (!state) return;
        const { current, seek } = state;
        const progress = Math.min(100, Math.max(0, (seek * 1000 / current.duration) * 100));
        const hasThumb = !current.id.startsWith('track-');

        title.textContent = current.title || 'Untitled Track';
        artist.textContent = current.artist || 'Unknown Artist';
        open.href = current.url;
        progressBar.style.width = `${progress}%`;
        elapsedTime.textContent = formatTime(seek);
        durationTime.textContent = formatTime(current.duration / 1000);

        if (hasThumb) {
          cover.src = `https://img.youtube.com/vi/${current.id}/mqdefault.jpg`;
          cover.alt = current.title || 'Track artwork';
          cover.hidden = false;
          fallback.hidden = true;
        } else {
          cover.hidden = true;
          fallback.hidden = false;
        }
      };

      render();
      setInterval(render, 1000);
    } catch (error) {
      console.error('Failed to load listening.txt:', error);
      widget.replaceWith(Object.assign(document.createElement('div'), {
        className: 'now-playing-empty',
        textContent: 'Could not load listening.txt for the music widget.',
      }));
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount, { once: true });
  } else {
    mount();
  }
})();
