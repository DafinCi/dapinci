// Custom playful cursors for petting and squeezing the DapinCi Slime companion.
// Rendered as lightweight, crisp SVG data URIs with proper hot spots.

const PET_SVG = encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <defs>
    <filter id="sh" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="1.2" stdDeviation="1.2" flood-color="rgba(0,0,0,0.4)"/>
    </filter>
  </defs>
  <g filter="url(#sh)">
    <!-- Open, gentle cupped cartoon petting glove/hand -->
    <path d="M9 22 C6.5 19.5 6 15 8 11.5 C9.5 8.5 13 7.5 16 9 C17.5 8 20 8.5 21.5 10 C23 11 23.5 13 23 15 C24.5 15.5 25.5 17.5 25 19.5 C24.2 21.8 22 23.2 19 23.5 C15.5 24.2 11.5 24 9 22 Z" fill="#FFFFFF" stroke="#1A1E26" stroke-width="2" stroke-linejoin="round"/>
    <!-- Subtle finger creases -->
    <path d="M14 12 C15 14.5 14.5 17 13.5 19" fill="none" stroke="#E1E5EE" stroke-width="1.5" stroke-linecap="round"/>
    <path d="M18 13 C19 15.5 18.5 18 17.5 20" fill="none" stroke="#E1E5EE" stroke-width="1.5" stroke-linecap="round"/>
    <!-- Soft sweet paw pad accent -->
    <ellipse cx="14" cy="20.5" rx="2.4" ry="1.6" fill="#FFAEC0" opacity="0.75"/>
  </g>
</svg>
`.trim());

const SQUEEZE_SVG = encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <defs>
    <filter id="sh" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="1.2" stdDeviation="1.2" flood-color="rgba(0,0,0,0.4)"/>
    </filter>
  </defs>
  <g filter="url(#sh)">
    <!-- Curled/squeezing fingers grasping the squishy slime -->
    <path d="M8.5 19 C6.5 16.5 6.5 12.5 9 9.5 C11.5 6.8 15.5 7 17.5 9 C19 7.5 21.5 8 22.5 10 C23.5 11.5 23 13.5 22 15.5 C23 16.8 22.5 19 20.5 20.8 C18 22.5 13 22.8 9.5 21 Z" fill="#FFFFFF" stroke="#1A1E26" stroke-width="2" stroke-linejoin="round"/>
    <!-- Squeeze creases -->
    <path d="M13.5 11 C15 13.5 14 16.5 12 18.5" fill="none" stroke="#D1D7E4" stroke-width="1.5" stroke-linecap="round"/>
    <path d="M17.5 12 C18.5 14.5 18 17.5 16 19.5" fill="none" stroke="#D1D7E4" stroke-width="1.5" stroke-linecap="round"/>
    <!-- Pressed palm pad -->
    <ellipse cx="13.5" cy="18.5" rx="2.2" ry="1.4" fill="#FF8FA3" opacity="0.85"/>
  </g>
</svg>
`.trim());

export const PET_CURSOR_CSS = `url("data:image/svg+xml,${PET_SVG}") 14 18, grab`;
export const SQUEEZE_CURSOR_CSS = `url("data:image/svg+xml,${SQUEEZE_SVG}") 14 15, grabbing`;

