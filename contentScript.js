/**
 * QuickTube Controls - Content Script
 * Injects custom controls into YouTube video player
 */

(function () {
  // Global state to prevent duplicate injections
  let controlsInjected = false;
  let currentVideoId = null;

  /**
   * Main initialization function
   * Sets up MutationObserver to handle YouTube's SPA navigation
   */
  function init() {
    // Initial injection
    injectControls();

    // Watch for video changes (YouTube is a SPA)
    const observer = new MutationObserver(() => {
      const newVideoId = getVideoId();
      if (newVideoId && newVideoId !== currentVideoId) {
        currentVideoId = newVideoId;
        controlsInjected = false;
        injectControls();
      }
    });

    // Observe URL changes and DOM mutations
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  /**
   * Extract YouTube video ID from URL
   * @returns {string|null} Video ID or null if not found
   */
  function getVideoId() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get("v");
  }

  /**
   * Convert seconds to HH-MM-SS format for filename
   * @param {number} seconds - Current playback time in seconds
   * @returns {string} Formatted timestamp
   */
  function formatTimestamp(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    return [hours, minutes, secs]
      .map((val) => String(val).padStart(2, "0"))
      .join("-");
  }

  /**
   * Capture current video frame as PNG
   * Downloads with format: `yt-ss_at_${timestamp}_from_https://youtu.be/${videoId}.png`
   */
  function captureScreenshot() {
    const video = document.querySelector("video");
    const videoId = getVideoId();

    if (!video || !videoId) {
      console.error("Video element or video ID not found");
      return;
    }

    // Create canvas with video dimensions
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw current frame
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Convert to blob and download
    canvas.toBlob((blob) => {
      const timestamp = formatTimestamp(video.currentTime);
      const filename = `yt-ss_at_${timestamp}_from_vid=${videoId}.png`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();

      // Cleanup
      URL.revokeObjectURL(url);
    }, "image/png");
  }

  /**
   * Map YouTube internal quality levels to display labels
   * @param {string} level - Internal quality level
   * @returns {string} Display label (e.g., "1080p")
   */
  function mapQualityLabel(level) {
    const qualityMap = {
      small: "144p",
      medium: "360p",
      large: "480p",
      hd720: "720p",
      hd1080: "1080p",
      hd1440: "1440p",
      hd2160: "2160p (4K)",
      highres: "4320p (8K)",
      auto: "Auto",
    };

    return qualityMap[level] || level;
  }

  /**
   * Get quality level order for sorting (highest to lowest)
   * @param {string} level - Internal quality level
   * @returns {number} Sort order
   */
  function getQualityOrder(level) {
    const orderMap = {
      highres: 8,
      hd2160: 7,
      hd1440: 6,
      hd1080: 5,
      hd720: 4,
      large: 3,
      medium: 2,
      small: 1,
    };

    return orderMap[level] || 0;
  }

  /**
   * Show quality selection popup
   * Fetches real available qualities from YouTube player
   * @param {HTMLElement} button - Button element to position popup relative to
   */
  /**
   * Show quality selection popup
   * Fetches real available qualities from YouTube player
   * @param {HTMLElement} button - Button element to position popup relative to
   */
  function showQualityPopup(button) {
    // Close any existing popups
    closeAllPopups();

    const player = document.getElementById("movie_player");
    if (!player) {
      console.error("YouTube player not found");
      return;
    }

    // Get available quality levels
    const availableLevels = player.getAvailableQualityLevels();
    const currentQuality = player.getPlaybackQuality();

    if (!availableLevels || availableLevels.length === 0) {
      console.error("No quality levels available");
      return;
    }

    // Sort qualities from highest to lowest and filter out 'tiny'
    const sortedLevels = availableLevels
      .filter((level) => level !== "tiny")
      .sort((a, b) => getQualityOrder(b) - getQualityOrder(a));

    // Create popup
    const popup = document.createElement("div");
    popup.className = "quicktube-popup";
    popup.id = "quicktube-quality-popup";

    // Add quality options
    sortedLevels.forEach((level) => {
      const option = document.createElement("div");
      option.className = "quicktube-popup-option";
      option.textContent = mapQualityLabel(level);

      // Highlight current quality
      if (level === currentQuality) {
        option.classList.add("active");
      }

      // Set quality on click
      option.addEventListener("click", () => {
        player.setPlaybackQualityRange(level, level);
        player.setPlaybackQuality(level);
        
        // Update the quality button icon
        const qualityBtn = document.getElementById('quicktube-quality-btn');
        if (qualityBtn) {
          const label = mapQualityLabel(level);
          const displayValue = label.replace('p', '').replace(' (4K)', '').replace(' (8K)', '');
          // Clear existing content and add new SVG
          while (qualityBtn.firstChild) qualityBtn.removeChild(qualityBtn.firstChild);
          qualityBtn.appendChild(createResolutionIcon(displayValue));
        }
        
        closeAllPopups();
      });

      popup.appendChild(option);
    });

    // Position popup above button
    positionPopup(popup, button);
    document.body.appendChild(popup);

    // Close on outside click
    setTimeout(() => {
      document.addEventListener("click", handleOutsideClick);
    }, 0);
  }

  /**
   * Show playback speed selection popup
   * @param {HTMLElement} button - Button element to position popup relative to
   */
  function showSpeedPopup(button) {
    // Close any existing popups
    closeAllPopups();

    const video = document.querySelector("video");
    if (!video) {
      console.error("Video element not found");
      return;
    }

    const speeds = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
    const currentSpeed = video.playbackRate;

    // Create popup
    const popup = document.createElement("div");
    popup.className = "quicktube-popup";
    popup.id = "quicktube-speed-popup";

    // Add speed options
    speeds.forEach((speed) => {
      const option = document.createElement("div");
      option.className = "quicktube-popup-option";
      option.textContent = speed === 1 ? "Normal" : `${speed}x`;

      // Highlight current speed
      if (Math.abs(speed - currentSpeed) < 0.01) {
        option.classList.add("active");
      }

      // Set speed on click
      option.addEventListener("click", () => {
        video.playbackRate = speed;
        
        // Update the speed button icon
        const speedBtn = document.getElementById('quicktube-speed-btn');
        if (speedBtn) {
          const displaySpeed = speed === 1 ? '1x' : `${speed}x`;
          // Clear existing content and add new SVG
          while (speedBtn.firstChild) speedBtn.removeChild(speedBtn.firstChild);
          speedBtn.appendChild(createSpeedIcon(displaySpeed));
        }
        
        closeAllPopups();
      });

      popup.appendChild(option);
    });

    // Position popup above button
    positionPopup(popup, button);
    document.body.appendChild(popup);

    // Close on outside click
    setTimeout(() => {
      document.addEventListener("click", handleOutsideClick);
    }, 0);
  }

  /**
   * Position popup above button
   * @param {HTMLElement} popup - Popup element
   * @param {HTMLElement} button - Button element
   */
  function positionPopup(popup, button) {
    const rect = button.getBoundingClientRect();
    popup.style.position = "fixed";
    popup.style.bottom = `${window.innerHeight - rect.top + 30}px`;
    popup.style.left = `${rect.left}px`;
  }

  /**
   * Close all open popups
   */
  function closeAllPopups() {
    document.querySelectorAll(".quicktube-popup").forEach((popup) => {
      popup.remove();
    });
    document.removeEventListener("click", handleOutsideClick);
  }

  /**
   * Handle clicks outside popups to close them
   * @param {Event} e - Click event
   */
  function handleOutsideClick(e) {
    if (
      !e.target.closest(".quicktube-popup") &&
      !e.target.closest(".quicktube-btn")
    ) {
      closeAllPopups();
    }
  }

  const SVG_NS = 'http://www.w3.org/2000/svg';

  /**
   * Helper to create SVG element with attributes
   */
  function createSVGElement(tag, attrs = {}) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attrs)) {
      el.setAttribute(key, value);
    }
    return el;
  }

  /**
   * Create resolution SVG icon with dynamic text (programmatic)
   * @param {string} resolution - Resolution to display
   * @returns {SVGElement} SVG element
   */
  /**
   * Create resolution SVG icon with dynamic text (programmatic)
   * @param {string} resolution - Resolution to display
   * @returns {SVGElement} SVG element
   */
  function createResolutionIcon(resolution = '1080') {
    // Significantly increased font sizes for readability
    let fontSize = 220;
    if (resolution.length >= 3) fontSize = 200;
    if (resolution.length >= 4) fontSize = 170;
    if (resolution === 'Auto') fontSize = 150;

    const svg = createSVGElement('svg', {
      xmlns: SVG_NS,
      viewBox: '0 0 500 500',
      width: '24',
      height: '24',
      style: 'width: 24px; height: 24px; min-width: 24px;'
    });

    // Monitor frame
    const rect = createSVGElement('rect', {
      x: '20', y: '70', width: '460', height: '340', rx: '30', ry: '30',
      'stroke-width': '40', // Slightly reduced stroke to give text more breathing room
      'stroke-linecap': 'round', 'stroke-linejoin': 'round',
      style: 'fill: none; stroke: #ffffff;'
    });
    svg.appendChild(rect);

    // Removed corner brackets to reduce clutter and make space for text

    // Resolution text - maximized size
    const text = createSVGElement('text', {
      x: '250', y: '320', // Adjusted Y for better vertical centering with larger font
      'font-size': fontSize.toString(),
      'font-family': 'Arial, sans-serif', 'font-weight': 'bold',
      'text-anchor': 'middle',
      style: 'fill: #ffffff;'
    });
    text.textContent = resolution;
    svg.appendChild(text);

    return svg;
  }

  /**
   * Create speed SVG icon with dynamic text (programmatic)
   * @param {string} speed - Speed to display
   * @returns {SVGElement} SVG element
   */
  function createSpeedIcon(speed = '1x') {
    // Increased font sizes
    let fontSize = 200;
    if (speed.length >= 4) fontSize = 170;
    if (speed.length >= 5) fontSize = 150;

    const svg = createSVGElement('svg', {
      xmlns: SVG_NS,
      viewBox: '0 0 500 500',
      width: '24',
      height: '24',
      style: 'width: 24px; height: 24px; min-width: 24px;'
    });

    // Speedometer arc - moved up by 70px (center y: 250)
    const arc = createSVGElement('path', {
      d: 'M 40 250 A 210 210 0 1 1 460 250',
      'stroke-width': '50',
      'stroke-linecap': 'round', 'stroke-linejoin': 'round',
      style: 'fill: none; stroke: #ffffff;'
    });
    svg.appendChild(arc);

    // Needle - moved up
    const needle = createSVGElement('line', {
      x1: '250', y1: '250', x2: '250', y2: '80',
      'stroke-width': '50',
      'stroke-linecap': 'round', 'stroke-linejoin': 'round',
      style: 'stroke: #ffffff;'
    });
    svg.appendChild(needle);

    // Center dot - moved up
    const dot = createSVGElement('circle', {
      cx: '250', cy: '250', r: '25',
      style: 'fill: #ffffff;'
    });
    svg.appendChild(dot);

    // Speed text - bigger and positioned lower
    const text = createSVGElement('text', {
      x: '250', y: '460', 
      'font-size': fontSize.toString(),
      'font-family': 'Arial, sans-serif', 'font-weight': 'bold',
      'text-anchor': 'middle',
      style: 'fill: #ffffff;'
    });
    text.textContent = speed;
    svg.appendChild(text);

    return svg;
  }

  /**
   * Create screenshot SVG icon (programmatic)
   * @returns {SVGElement} SVG element
   */
  function createScreenshotIcon() {
    const svg = createSVGElement('svg', {
      xmlns: SVG_NS,
      viewBox: '0 0 24 24',
      width: '24',
      height: '24',
      style: 'width: 24px; height: 24px; min-width: 24px;'
    });

    const path = createSVGElement('path', {
      d: 'M11.993 14.407l-1.552 1.552a4 4 0 1 1-1.418-1.41l1.555-1.556-4.185-4.185 1.415-1.415 4.185 4.185 4.189-4.189 1.414 1.414-4.19 4.19 1.562 1.56a4 4 0 1 1-1.414 1.414l-1.561-1.56zM7 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm10 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm2-7V5H5v8H3V4a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v9h-2z',
      style: 'fill: #ffffff;'
    });
    svg.appendChild(path);

    return svg;
  }

  /**
   * Create a control button with SVG icon
   * @param {string} id - Button ID
   * @param {SVGElement} svgIcon - SVG icon element
   * @param {string} title - Tooltip text
   * @param {Function} onClick - Click handler
   * @returns {HTMLElement} Button element
   */
  function createButton(id, svgIcon, title, onClick) {
    const button = document.createElement('button');
    button.id = id;
    button.className = 'quicktube-btn ytp-button';
    button.setAttribute('aria-label', title);
    button.setAttribute('title', title);
    button.appendChild(svgIcon);
    button.addEventListener('click', onClick);
    return button;
  }

  /**
   * Inject custom controls into YouTube player
   * Uses MutationObserver-safe injection to prevent duplicates
   */
  function injectControls() {
    // Prevent duplicate injection
    if (controlsInjected) return;

    // Wait for player controls to be available
    const leftControls = document.querySelector(".ytp-left-controls");
    if (!leftControls) {
      // Retry after a short delay
      setTimeout(injectControls, 500);
      return;
    }

    // Check if controls already exist
    if (document.getElementById("quicktube-screenshot-btn")) {
      controlsInjected = true;
      return;
    }

    // Get initial quality and speed values
    const player = document.getElementById('movie_player');
    const video = document.querySelector('video');
    
    // Default quality label is always "Auto"
    let initialQuality = 'Auto';
    
    // Get initial speed
    let initialSpeed = '1x';
    if (video) {
      const speed = video.playbackRate;
      initialSpeed = speed === 1 ? '1x' : `${speed}x`;
    }
    
    // Create buttons with icons
    const screenshotBtn = createButton(
      'quicktube-screenshot-btn',
      createScreenshotIcon(),
      'Take Screenshot',
      captureScreenshot
    );

    const qualityBtn = createButton(
      'quicktube-quality-btn',
      createResolutionIcon(initialQuality),
      'Change Quality',
      function() { showQualityPopup(this); }
    );

    const speedBtn = createButton(
      'quicktube-speed-btn',
      createSpeedIcon(initialSpeed),
      'Change Speed',
      function() { showSpeedPopup(this); }
    );

    // Create container for grouped buttons
    const controlsContainer = document.createElement("div");
    controlsContainer.className = "quicktube-controls-container";
    controlsContainer.id = "quicktube-controls-container";

    // Add buttons to container in order: Quality, Speed, Screenshot
    controlsContainer.appendChild(qualityBtn);
    controlsContainer.appendChild(speedBtn);
    controlsContainer.appendChild(screenshotBtn);

    // Find the right controls to insert into
    const rightControls = document.querySelector(".ytp-right-controls");
    
    if (rightControls) {
      // Insert container at the beginning of right controls
      rightControls.prepend(controlsContainer);
    } else {
      // Fallback to left controls
      leftControls.appendChild(controlsContainer);
    }

    controlsInjected = true;
    currentVideoId = getVideoId();
  }

  /**
   * Ensure controls are properly placed in the DOM
   * CSS media queries handle the visibility
   * @param {HTMLElement} controlsContainer - The controls container element
   */
  function checkOverlap(controlsContainer) {
    const rightControls = document.querySelector(".ytp-right-controls");
    const leftControls = document.querySelector(".ytp-left-controls");
    const chromeControls = document.querySelector(
      ".ytp-chrome-bottom .ytp-chrome-controls"
    );

    if (!controlsContainer) return;

    // Ensure controls are in the DOM (insert before right controls)
    if (!controlsContainer.parentNode) {
      if (chromeControls && rightControls) {
        chromeControls.insertBefore(controlsContainer, rightControls);
      } else if (leftControls) {
        leftControls.appendChild(controlsContainer);
      }
    }
  }

  /**
   * Set up dynamic visibility checking using ResizeObserver
   * @param {HTMLElement} controlsContainer - The controls container element
   */
  function setupDynamicVisibility(controlsContainer) {
    // Throttle function to limit check frequency
    let resizeTimeout;
    const throttledCheck = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => checkOverlap(controlsContainer), 100);
    };

    // Watch for player resize
    const player = document.getElementById("movie_player");
    if (player && window.ResizeObserver) {
      const resizeObserver = new ResizeObserver(throttledCheck);
      resizeObserver.observe(player);
    }

    // Also check on window resize
    window.addEventListener("resize", throttledCheck);

    // Initial check
    setTimeout(() => checkOverlap(controlsContainer), 500);
  }

  // Initialize when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
