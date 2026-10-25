/**
 * PokerTH Service Worker — v4
 * ⚠ Bump CACHE_VERSION on every static deploy to force clients to update.
 *    Format: 'pokerth-v{MAJOR}.{MINOR}.{N}' where {N} is a monotonic deploy
 *    counter that doubles as the release patch number. A release tag equals
 *    this string without the 'pokerth-' prefix (cache pokerth-v0.2.378 ↔ v0.2.91).
 *
 * Strategy (v4):
 *   • install   — precache the critical app shell (HTML, JS, CSS, modules,
 *                 manifest, key PWA icons)
 *   • activate  — drop stale caches, enable navigation preload, notify pages
 *                 (clients.claim is intentionally omitted — see activate note)
 *   • fetch     — split by request type for the best of both worlds:
 *                   – navigations (the HTML document) → NETWORK-FIRST, so a
 *                     fresh deploy is picked up immediately; falls back to the
 *                     cached shell when offline. Uses navigationPreload to
 *                     start the network request in parallel with SW boot.
 *                   – static assets (js, css, mjs, svg, png, fonts, proto…) →
 *                     STALE-WHILE-REVALIDATE: served instantly from cache and
 *                     refreshed in the background. Repeat loads are near
 *                     instant and work fully offline; the CACHE_VERSION bump on
 *                     each deploy still guarantees clients get the new files.
 *                 Cross-origin requests and WS upgrades are left untouched.
 *                 (Fonts are now self-hosted and handled by SWR above.)
 */
const CACHE_VERSION = 'pokerth-v2.1.10-web.332';
// Build id the page puts on the card back URL (deck.mjs _deckBack →
// flipside.<ext>?v=<BUILD_VERSION>): CACHE_VERSION without its prefix.
const BUILD_ID = CACHE_VERSION.replace(/^pokerth-v/, '');
// Share Target payload park (see handleShareTarget). Kept OUT of CACHE_VERSION
// so an update sweep never eats a share that arrived seconds earlier.
const SHARE_CACHE = 'pokerth-share';

// Where navigations fall back to when the network is unavailable.
const NAV_FALLBACK = '/holdem-practice/pokerth-client.html';
// How long a navigation waits for the origin before falling back to the
// cached shell. Keeps the tab from hanging on a blank page when the origin
// is slow (e.g. during server backups); the network fetch keeps running in
// the background so the cached shell still gets refreshed.
const NAV_TIMEOUT_MS = 3500;

// Critical app shell precached on install. Keep this list tight — anything
// large or rarely used (e.g. the protobuf bundle, individual flags) is fetched
// on demand and then served from cache thanks to the SWR handler below.
const ASSETS = [
  '/',
  '/holdem-practice/pokerth-client.html',
  '/holdem-practice/pokerth.js',
  '/holdem-practice/chat-emotes.js',
  '/holdem-practice/pokerth.css',
  // Self-hosted fonts (Cinzel + Inconsolata) — offline + privacy
  '/holdem-practice/fonts/fonts.css',
  '/holdem-practice/fonts/cinzel-latin-400-normal.woff2',
  '/holdem-practice/fonts/cinzel-latin-600-normal.woff2',
  '/holdem-practice/fonts/cinzel-latin-700-normal.woff2',
  '/holdem-practice/fonts/cinzel-latin-ext-400-normal.woff2',
  '/holdem-practice/fonts/cinzel-latin-ext-600-normal.woff2',
  '/holdem-practice/fonts/cinzel-latin-ext-700-normal.woff2',
  '/holdem-practice/fonts/inconsolata-latin-300-normal.woff2',
  '/holdem-practice/fonts/inconsolata-latin-400-normal.woff2',
  '/holdem-practice/fonts/inconsolata-latin-500-normal.woff2',
  '/holdem-practice/fonts/inconsolata-latin-ext-300-normal.woff2',
  '/holdem-practice/fonts/inconsolata-latin-ext-400-normal.woff2',
  '/holdem-practice/fonts/inconsolata-latin-ext-500-normal.woff2',
  '/holdem-practice/fonts/inter-latin-wght-normal.woff2',
  '/holdem-practice/fonts/inter-latin-ext-wght-normal.woff2',
  '/holdem-practice/manifest.json',
  '/holdem-practice/modules/errreport.mjs',
  '/holdem-practice/modules/feature-off.mjs',
  '/holdem-practice/modules/i18n.mjs',
  '/holdem-practice/modules/lang-meta.mjs',
  '/holdem-practice/modules/handlog.mjs',
  '/holdem-practice/modules/pdb-autosave.mjs',
  '/holdem-practice/modules/arena-witness.mjs',
  '/holdem-practice/modules/backup-autosave.mjs',
  '/holdem-practice/modules/journal.mjs',
  '/holdem-practice/modules/seo/about-guides.mjs',
  '/holdem-practice/modules/notes/index.mjs',
  '/holdem-practice/modules/notes/store.mjs',
  '/holdem-practice/vendor/sql-wasm.js',
  '/holdem-practice/vendor/sql-wasm.wasm',
  '/holdem-practice/modules/theme.mjs',
  '/holdem-practice/modules/ui/chatlog-tint.mjs',
  // Modules loaded by pokerth-client.html (or imported by one) — a module
  // missing here breaks its whole graph offline after a CACHE_VERSION bump.
  // Guarded by scripts/test-precache.mjs.
  '/holdem-practice/modules/ui/debuglog.mjs',
  '/holdem-practice/modules/ui/accessibility.mjs',
  '/holdem-practice/modules/ui/livescroll.mjs',
  '/holdem-practice/modules/chat/abbrev.mjs',
  '/holdem-practice/modules/ui/pm.mjs',
  '/holdem-practice/modules/game/presence.mjs',
  '/holdem-practice/modules/net/watchdog.mjs',
  '/holdem-practice/modules/pm/store.mjs',
  '/holdem-practice/modules/ui/assist-pane.mjs',
  '/holdem-practice/modules/ui/seat-menu.mjs',
  '/holdem-practice/modules/ui/back-guard.mjs',
  '/holdem-practice/modules/ui/z-order.mjs',
  // Offline (vs bots) mode modules
  '/holdem-practice/vendor/phe.mjs',
  '/holdem-practice/modules/game/state.mjs',
  '/holdem-practice/modules/ui/fmt.mjs',
  '/holdem-practice/modules/ui/media.mjs',
  '/holdem-practice/modules/ui/announcer.mjs',
  '/holdem-practice/modules/game/turn-timer.mjs',
  '/holdem-practice/modules/game/stats.mjs',
  '/holdem-practice/modules/net/petitions.mjs',
  '/holdem-practice/modules/ui/chat.mjs',
  '/holdem-practice/modules/ui/botsuggest.mjs',
  '/holdem-practice/modules/create-presets.mjs',
  '/holdem-practice/modules/ui/player-popup.mjs',
  '/holdem-practice/modules/ui/avatar-studio.mjs',
  '/holdem-practice/modules/ui/avatar-vector.mjs',
  '/holdem-practice/modules/ui/avatar-photo.mjs',
  '/holdem-practice/modules/ui/avatar-capture.mjs',
  '/holdem-practice/modules/ui/avatar-parts/helpers.mjs',
  '/holdem-practice/modules/ui/avatar-parts/faces.mjs',
  '/holdem-practice/modules/ui/avatar-parts/colors.mjs',
  '/holdem-practice/modules/ui/avatar-parts/hair.mjs',
  '/holdem-practice/modules/ui/avatar-parts/outfits.mjs',
  '/holdem-practice/modules/ui/avatar-parts/face-parts.mjs',
  '/holdem-practice/modules/ui/avatar-parts/extras.mjs',
  '/holdem-practice/modules/ui/avatar-parts/expressions.mjs',
  '/holdem-practice/modules/ui/avatar-parts/legacy.mjs',
  '/holdem-practice/modules/ui/avatar-parts/index.mjs',
  '/holdem-practice/modules/ui/avatar-parts/presets.mjs',
  '/holdem-practice/modules/ui/lobby.mjs',
  '/holdem-practice/modules/ui/wait-alert.mjs',
  '/holdem-practice/modules/ui/lobby-keynav.mjs',
  '/holdem-practice/modules/ui/lobby-typechat.mjs',
  '/holdem-practice/modules/ui/forumnews.mjs',
  '/holdem-practice/modules/ui/forum-events.mjs',
  '/holdem-practice/modules/ui/lobby-clock.mjs',
  '/holdem-practice/modules/ui/header-title-fit.mjs',
  '/holdem-practice/modules/ui/login-flourish.mjs',
  '/holdem-practice/modules/mascot/index.mjs',
  '/holdem-practice/modules/mascot/engine.mjs',
  '/holdem-practice/modules/mascot/plan.mjs',
  '/holdem-practice/modules/mascot/panel.mjs',
  '/holdem-practice/modules/mascot/acts-extra.mjs',
  '/holdem-practice/modules/mascot/acts-props.mjs',
  '/holdem-practice/modules/mascot/acts-social.mjs',
  '/holdem-practice/modules/mascot/acts-dance.mjs',
  '/holdem-practice/modules/mascot/groove.mjs',
  '/holdem-practice/modules/games/index.mjs',
  '/holdem-practice/modules/games/shell.mjs',
  '/holdem-practice/modules/games/ace-runner.mjs',
  '/holdem-practice/modules/games/poker-hand.mjs',
  '/holdem-practice/modules/games/common.mjs',
  '/holdem-practice/modules/games/menu.mjs',
  '/holdem-practice/modules/games/art.mjs',
  '/holdem-practice/modules/games/ui.mjs',
  '/holdem-practice/modules/games/deal.mjs',
  '/holdem-practice/modules/games/videopoker.mjs',
  '/holdem-practice/modules/games/whowins.mjs',
  '/holdem-practice/modules/games/hilo.mjs',
  '/holdem-practice/modules/games/bluff.mjs',
  '/holdem-practice/modules/games/pokerdrop.mjs',
  '/holdem-practice/modules/games/pokerdrop-rules.mjs',
  '/holdem-practice/modules/games/house.mjs',
  '/holdem-practice/modules/games/solitaire.mjs',
  '/holdem-practice/modules/games/solitaire-rules.mjs',
  '/holdem-practice/modules/mascot/guide.mjs',
  // Aide de l'As (modules/guide) — petit, précaché pour marcher hors ligne (D11).
  // Catalogues de textes : guide/lang/<code>.mjs (chargés à la demande).
  '/holdem-practice/modules/guide/index.mjs',
  '/holdem-practice/modules/guide/core.mjs',
  '/holdem-practice/modules/guide/state.mjs',
  '/holdem-practice/modules/guide/i18n.mjs',
  '/holdem-practice/modules/guide/highlight.mjs',
  '/holdem-practice/modules/guide/ranking-pick.mjs',
  '/holdem-practice/modules/guide/cup.mjs',
  '/holdem-practice/modules/guide/beacons.mjs',
  '/holdem-practice/modules/guide/hotspots.mjs', '/holdem-practice/modules/guide/knowledge.mjs',
  '/holdem-practice/modules/guide/contexts/index.mjs',
  '/holdem-practice/modules/guide/contexts/lobby-guest.mjs',
  '/holdem-practice/modules/guide/contexts/lobby-watch.mjs',
  '/holdem-practice/modules/guide/contexts/lobby-cup.mjs',
  '/holdem-practice/modules/guide/contexts/lobby-flag.mjs',
  '/holdem-practice/modules/guide/contexts/lobby-open.mjs',
  '/holdem-practice/modules/guide/contexts/lobby-lan.mjs',
  '/holdem-practice/modules/guide/contexts/lobby-ranking-create.mjs',
  '/holdem-practice/modules/guide/contexts/lobby-ranking.mjs',
  '/holdem-practice/modules/guide/contexts/login.mjs',
  '/holdem-practice/modules/guide/contexts/create.mjs',
  '/holdem-practice/modules/guide/contexts/windows.mjs',
  '/holdem-practice/modules/guide/contexts/login-profile.mjs',
  '/holdem-practice/modules/guide/contexts/login-lan.mjs',
  '/holdem-practice/modules/guide/contexts/wait-normal.mjs',
  '/holdem-practice/modules/guide/contexts/ranked-result.mjs',
  '/holdem-practice/modules/guide/contexts/wait-ranking.mjs',
  '/holdem-practice/modules/guide/contexts/welcome.mjs',
  '/holdem-practice/modules/guide/lang/af.mjs',
  '/holdem-practice/modules/guide/lang/am.mjs',
  '/holdem-practice/modules/guide/lang/ar.mjs',
  '/holdem-practice/modules/guide/lang/az.mjs',
  '/holdem-practice/modules/guide/lang/be.mjs',
  '/holdem-practice/modules/guide/lang/bg.mjs',
  '/holdem-practice/modules/guide/lang/bn.mjs',
  '/holdem-practice/modules/guide/lang/bs.mjs',
  '/holdem-practice/modules/guide/lang/ca.mjs',
  '/holdem-practice/modules/guide/lang/cs.mjs',
  '/holdem-practice/modules/guide/lang/cy.mjs',
  '/holdem-practice/modules/guide/lang/da.mjs',
  '/holdem-practice/modules/guide/lang/de.mjs',
  '/holdem-practice/modules/guide/lang/el.mjs',
  '/holdem-practice/modules/guide/lang/en.mjs',
  '/holdem-practice/modules/guide/lang/eo.mjs',
  '/holdem-practice/modules/guide/lang/es-419.mjs',
  '/holdem-practice/modules/guide/lang/es.mjs',
  '/holdem-practice/modules/guide/lang/et.mjs',
  '/holdem-practice/modules/guide/lang/eu.mjs',
  '/holdem-practice/modules/guide/lang/fa.mjs',
  '/holdem-practice/modules/guide/lang/fi.mjs',
  '/holdem-practice/modules/guide/lang/fil.mjs',
  '/holdem-practice/modules/guide/lang/fr.mjs',
  '/holdem-practice/modules/guide/lang/ga.mjs',
  '/holdem-practice/modules/guide/lang/gd.mjs',
  '/holdem-practice/modules/guide/lang/gl.mjs',
  '/holdem-practice/modules/guide/lang/gu.mjs',
  '/holdem-practice/modules/guide/lang/ha.mjs',
  '/holdem-practice/modules/guide/lang/he.mjs',
  '/holdem-practice/modules/guide/lang/hi.mjs',
  '/holdem-practice/modules/guide/lang/hr.mjs',
  '/holdem-practice/modules/guide/lang/hu.mjs',
  '/holdem-practice/modules/guide/lang/hy.mjs',
  '/holdem-practice/modules/guide/lang/id.mjs',
  '/holdem-practice/modules/guide/lang/is.mjs',
  '/holdem-practice/modules/guide/lang/it.mjs',
  '/holdem-practice/modules/guide/lang/ja.mjs',
  '/holdem-practice/modules/guide/lang/ka.mjs',
  '/holdem-practice/modules/guide/lang/kk.mjs',
  '/holdem-practice/modules/guide/lang/km.mjs',
  '/holdem-practice/modules/guide/lang/kn.mjs',
  '/holdem-practice/modules/guide/lang/ko.mjs',
  '/holdem-practice/modules/guide/lang/ky.mjs',
  '/holdem-practice/modules/guide/lang/lt.mjs',
  '/holdem-practice/modules/guide/lang/lv.mjs',
  '/holdem-practice/modules/guide/lang/mk.mjs',
  '/holdem-practice/modules/guide/lang/ml.mjs',
  '/holdem-practice/modules/guide/lang/mn.mjs',
  '/holdem-practice/modules/guide/lang/mr.mjs',
  '/holdem-practice/modules/guide/lang/ms.mjs',
  '/holdem-practice/modules/guide/lang/my.mjs',
  '/holdem-practice/modules/guide/lang/nb.mjs',
  '/holdem-practice/modules/guide/lang/ne.mjs',
  '/holdem-practice/modules/guide/lang/nl.mjs',
  '/holdem-practice/modules/guide/lang/pa.mjs',
  '/holdem-practice/modules/guide/lang/pl.mjs',
  '/holdem-practice/modules/guide/lang/pt-br.mjs',
  '/holdem-practice/modules/guide/lang/pt-pt.mjs',
  '/holdem-practice/modules/guide/lang/ro.mjs',
  '/holdem-practice/modules/guide/lang/ru.mjs',
  '/holdem-practice/modules/guide/lang/si.mjs',
  '/holdem-practice/modules/guide/lang/sk.mjs',
  '/holdem-practice/modules/guide/lang/sl.mjs',
  '/holdem-practice/modules/guide/lang/sq.mjs',
  '/holdem-practice/modules/guide/lang/sr.mjs',
  '/holdem-practice/modules/guide/lang/sv.mjs',
  '/holdem-practice/modules/guide/lang/sw.mjs',
  '/holdem-practice/modules/guide/lang/ta.mjs',
  '/holdem-practice/modules/guide/lang/te.mjs',
  '/holdem-practice/modules/guide/lang/tg.mjs',
  '/holdem-practice/modules/guide/lang/th.mjs',
  '/holdem-practice/modules/guide/lang/tk.mjs',
  '/holdem-practice/modules/guide/lang/tr.mjs',
  '/holdem-practice/modules/guide/lang/uk.mjs',
  '/holdem-practice/modules/guide/lang/ur.mjs',
  '/holdem-practice/modules/guide/lang/uz.mjs',
  '/holdem-practice/modules/guide/lang/vi.mjs',
  '/holdem-practice/modules/guide/lang/yo.mjs',
  '/holdem-practice/modules/guide/lang/zh-hk.mjs',
  '/holdem-practice/modules/guide/lang/zh-tw.mjs',
  '/holdem-practice/modules/guide/lang/zh.mjs',
  '/holdem-practice/modules/guide/lang/zu.mjs',
  '/holdem-practice/modules/ui/invite.mjs',
  '/holdem-practice/modules/ui/lan-directory.mjs',
  '/holdem-practice/modules/net/invite-link.mjs',
  '/holdem-practice/modules/ui/mini-board.mjs',
  '/holdem-practice/modules/ui/sound-import.mjs',
  '/holdem-practice/vendor/qrcode.mjs',
  '/holdem-practice/modules/ui/poll.mjs',
  '/holdem-practice/modules/ui/live-stats.mjs',
  '/holdem-practice/modules/ui/hold-tip.mjs',
  '/holdem-practice/modules/game/showdown.mjs',
  '/holdem-practice/modules/game/showlist.mjs',
  '/holdem-practice/modules/net/session.mjs',
  '/holdem-practice/modules/ui/game-info.mjs',
  '/holdem-practice/modules/ui/odds-panel.mjs',
  '/holdem-practice/modules/ui/table-cards.mjs',
  '/holdem-practice/modules/ui/action-bar.mjs',
  '/holdem-practice/modules/ui/bet-keypad.mjs',
  '/holdem-practice/modules/net/msg-avatars.mjs',
  '/holdem-practice/modules/net/msg-social.mjs',
  '/holdem-practice/modules/net/msg-lobby.mjs',
  '/holdem-practice/modules/net/msg-game-join.mjs',
  '/holdem-practice/modules/game/msg-hand.mjs',
  '/holdem-practice/modules/game/seat-render.mjs',
  '/holdem-practice/modules/game/cards.mjs',
  '/holdem-practice/modules/net/proto.mjs',
  '/holdem-practice/modules/net/crypto.mjs',
  '/holdem-practice/modules/net/messages.mjs',
  '/holdem-practice/modules/ui/shortcuts.mjs',
  '/holdem-practice/modules/ui/reactions.mjs',
  '/holdem-practice/modules/ui/anim.mjs',
  '/holdem-practice/modules/game/seats.mjs',
  '/holdem-practice/modules/game/layout.mjs',
  '/holdem-practice/modules/game/puck-dodge.mjs',
  '/holdem-practice/modules/game/seat-top-clamp.mjs',
  '/holdem-practice/modules/ui/deck.mjs',
  '/holdem-practice/modules/net/avatar-cache.mjs',
  '/holdem-practice/modules/ui/misc.mjs',
  '/holdem-practice/modules/ui/adv-search.mjs',
  '/holdem-practice/modules/ui/keynav.mjs',
  '/holdem-practice/modules/ui/gamepad.mjs',
  '/holdem-practice/modules/ui/spatial-nav.mjs',
  '/holdem-practice/modules/ui/ctl-nav.mjs',
  '/holdem-practice/modules/ui/ctl-menu.mjs',
  '/holdem-practice/modules/ui/ctl-keyboard.mjs',
  '/holdem-practice/modules/ui/remote.mjs',
  '/holdem-practice/modules/help/content/en.mjs',
  '/holdem-practice/modules/help/content/eo.mjs',
  '/holdem-practice/modules/help/content/fr.mjs',
  '/holdem-practice/modules/help/content/ga.mjs',
  '/holdem-practice/modules/help/content/de.mjs',
  '/holdem-practice/modules/help/content/es.mjs',
  '/holdem-practice/modules/help/content/es-419.mjs',
  '/holdem-practice/modules/help/content/it.mjs',
  '/holdem-practice/modules/help/content/nl.mjs',
  '/holdem-practice/modules/help/content/pl.mjs',
  '/holdem-practice/modules/help/content/ru.mjs',
  '/holdem-practice/modules/help/content/pt-br.mjs',
  '/holdem-practice/modules/help/content/zh.mjs',
  '/holdem-practice/modules/help/content/zh-tw.mjs',
  '/holdem-practice/modules/help/content/zh-hk.mjs',
  '/holdem-practice/modules/help/content/zu.mjs',
  '/holdem-practice/modules/help/content/ja.mjs',
  '/holdem-practice/modules/help/content/ko.mjs',
  '/holdem-practice/modules/help/content/ky.mjs',
  '/holdem-practice/modules/help/content/tr.mjs',
  '/holdem-practice/modules/help/content/pt-pt.mjs',
  '/holdem-practice/modules/help/content/cs.mjs',
  '/holdem-practice/modules/help/content/cy.mjs',
  '/holdem-practice/modules/help/content/da.mjs',
  '/holdem-practice/modules/help/content/fi.mjs',
  '/holdem-practice/modules/help/content/nb.mjs',
  '/holdem-practice/modules/help/content/ne.mjs',
  '/holdem-practice/modules/help/content/sv.mjs',
  '/holdem-practice/modules/help/content/ro.mjs',
  '/holdem-practice/modules/help/content/sk.mjs',
  '/holdem-practice/modules/help/content/bg.mjs',
  '/holdem-practice/modules/help/content/el.mjs',
  '/holdem-practice/modules/help/content/hr.mjs',
  '/holdem-practice/modules/help/content/hu.mjs',
  '/holdem-practice/modules/help/content/hy.mjs',
  '/holdem-practice/modules/help/content/lt.mjs',
  '/holdem-practice/modules/help/content/et.mjs',
  '/holdem-practice/modules/help/content/eu.mjs',
  '/holdem-practice/modules/help/content/lv.mjs',
  '/holdem-practice/modules/help/content/sl.mjs',
  '/holdem-practice/modules/help/content/bs.mjs',
  '/holdem-practice/modules/help/content/mk.mjs',
  '/holdem-practice/modules/help/content/ms.mjs',
  '/holdem-practice/modules/help/content/my.mjs',
  '/holdem-practice/modules/help/content/ka.mjs',
  '/holdem-practice/modules/help/content/kk.mjs',
  '/holdem-practice/modules/help/content/si.mjs',
  '/holdem-practice/modules/help/content/sq.mjs',
  '/holdem-practice/modules/help/content/pa.mjs',
  '/holdem-practice/modules/help/content/am.mjs',
  '/holdem-practice/modules/help/content/km.mjs',
  '/holdem-practice/modules/help/content/te.mjs',
  '/holdem-practice/modules/help/content/tg.mjs',
  '/holdem-practice/modules/help/content/ml.mjs',
  '/holdem-practice/modules/help/content/mn.mjs',
  '/holdem-practice/modules/help/content/mr.mjs',
  '/holdem-practice/modules/help/content/kn.mjs',
  '/holdem-practice/modules/help/content/gu.mjs',
  '/holdem-practice/modules/help/content/ha.mjs',
  '/holdem-practice/modules/help/content/is.mjs',
  '/holdem-practice/modules/help/content/sr.mjs',
  '/holdem-practice/modules/help/content/uk.mjs',
  '/holdem-practice/modules/help/content/af.mjs',
  '/holdem-practice/modules/help/content/ca.mjs',
  '/holdem-practice/modules/help/content/gd.mjs',
  '/holdem-practice/modules/help/content/gl.mjs',
  '/holdem-practice/modules/help/content/hi.mjs',
  '/holdem-practice/modules/help/content/ta.mjs',
  '/holdem-practice/modules/help/content/vi.mjs',
  '/holdem-practice/modules/help/content/yo.mjs',
  '/holdem-practice/modules/help/content/id.mjs',
  '/holdem-practice/modules/help/content/th.mjs',
  '/holdem-practice/modules/help/content/tk.mjs',
  '/holdem-practice/modules/help/content/fil.mjs',
  '/holdem-practice/modules/help/content/bn.mjs',
  '/holdem-practice/modules/help/content/sw.mjs',
  '/holdem-practice/modules/help/content/ar.mjs',
  '/holdem-practice/modules/help/content/az.mjs',
  '/holdem-practice/modules/help/content/be.mjs',
  '/holdem-practice/modules/help/content/fa.mjs',
  '/holdem-practice/modules/help/content/he.mjs',
  '/holdem-practice/modules/help/content/ur.mjs',
  '/holdem-practice/modules/help/content/uz.mjs',
  '/holdem-practice/modules/offline/engine.mjs',
  '/holdem-practice/modules/offline/bots.mjs',
  '/holdem-practice/modules/offline/proto.mjs',
  '/holdem-practice/modules/offline/server.mjs',
  '/holdem-practice/modules/offline/index.mjs',
  '/holdem-practice/modules/offline/rand.mjs',
  // Achievements, imported by offline/server.mjs: without them the lazy
  // import of the offline mode fails with no network ("Offline init failed").
  '/holdem-practice/modules/achievements/index.mjs',
  '/holdem-practice/modules/achievements/defs.mjs',
  '/holdem-practice/modules/achievements/tracker.mjs',
  '/holdem-practice/modules/achievements/store.mjs',
  '/holdem-practice/modules/lang/en.mjs',
  '/holdem-practice/modules/lang/eo.mjs',
  '/holdem-practice/modules/lang/fr.mjs',
  '/holdem-practice/modules/lang/ga.mjs',
  '/holdem-practice/modules/lang/de.mjs',
  '/holdem-practice/modules/lang/es.mjs',
  '/holdem-practice/modules/lang/es-419.mjs',
  '/holdem-practice/modules/lang/it.mjs',
  '/holdem-practice/modules/lang/pt-br.mjs',
  '/holdem-practice/modules/lang/pt-pt.mjs',
  '/holdem-practice/modules/lang/nl.mjs',
  '/holdem-practice/modules/lang/pl.mjs',
  '/holdem-practice/modules/lang/ru.mjs',
  // Remaining UI languages — i18n.mjs imports all of them statically,
  // so they must be cached for the app to boot offline.
  '/holdem-practice/modules/lang/af.mjs',
  '/holdem-practice/modules/lang/bg.mjs',
  '/holdem-practice/modules/lang/ca.mjs',
  '/holdem-practice/modules/lang/cs.mjs',
  '/holdem-practice/modules/lang/cy.mjs',
  '/holdem-practice/modules/lang/da.mjs',
  '/holdem-practice/modules/lang/el.mjs',
  '/holdem-practice/modules/lang/fi.mjs',
  '/holdem-practice/modules/lang/gd.mjs',
  '/holdem-practice/modules/lang/gl.mjs',
  '/holdem-practice/modules/lang/hi.mjs',
  '/holdem-practice/modules/lang/ar.mjs',
  '/holdem-practice/modules/lang/az.mjs',
  '/holdem-practice/modules/lang/be.mjs',
  '/holdem-practice/modules/lang/fa.mjs',
  '/holdem-practice/modules/lang/he.mjs',
  '/holdem-practice/modules/lang/ur.mjs',
  '/holdem-practice/modules/lang/uz.mjs',
  '/holdem-practice/modules/lang/hr.mjs',
  '/holdem-practice/modules/lang/hu.mjs',
  '/holdem-practice/modules/lang/hy.mjs',
  '/holdem-practice/modules/lang/ja.mjs',
  '/holdem-practice/modules/lang/ko.mjs',
  '/holdem-practice/modules/lang/ky.mjs',
  '/holdem-practice/modules/lang/lt.mjs',
  '/holdem-practice/modules/lang/et.mjs',
  '/holdem-practice/modules/lang/eu.mjs',
  '/holdem-practice/modules/lang/lv.mjs',
  '/holdem-practice/modules/lang/sl.mjs',
  '/holdem-practice/modules/lang/bs.mjs',
  '/holdem-practice/modules/lang/mk.mjs',
  '/holdem-practice/modules/lang/ms.mjs',
  '/holdem-practice/modules/lang/my.mjs',
  '/holdem-practice/modules/lang/ka.mjs',
  '/holdem-practice/modules/lang/kk.mjs',
  '/holdem-practice/modules/lang/si.mjs',
  '/holdem-practice/modules/lang/sq.mjs',
  '/holdem-practice/modules/lang/pa.mjs',
  '/holdem-practice/modules/lang/am.mjs',
  '/holdem-practice/modules/lang/km.mjs',
  '/holdem-practice/modules/lang/te.mjs',
  '/holdem-practice/modules/lang/tg.mjs',
  '/holdem-practice/modules/lang/ml.mjs',
  '/holdem-practice/modules/lang/mn.mjs',
  '/holdem-practice/modules/lang/mr.mjs',
  '/holdem-practice/modules/lang/kn.mjs',
  '/holdem-practice/modules/lang/gu.mjs',
  '/holdem-practice/modules/lang/ha.mjs',
  '/holdem-practice/modules/lang/is.mjs',
  '/holdem-practice/modules/lang/nb.mjs',
  '/holdem-practice/modules/lang/ne.mjs',
  '/holdem-practice/modules/lang/ro.mjs',
  '/holdem-practice/modules/lang/sk.mjs',
  '/holdem-practice/modules/lang/sr.mjs',
  '/holdem-practice/modules/lang/sv.mjs',
  '/holdem-practice/modules/lang/ta.mjs',
  '/holdem-practice/modules/lang/tr.mjs',
  '/holdem-practice/modules/lang/uk.mjs',
  '/holdem-practice/modules/lang/vi.mjs',
  '/holdem-practice/modules/lang/yo.mjs',
  '/holdem-practice/modules/lang/zh.mjs',
  '/holdem-practice/modules/lang/zh-tw.mjs',
  '/holdem-practice/modules/lang/zh-hk.mjs',
  '/holdem-practice/modules/lang/zu.mjs',
  '/holdem-practice/modules/lang/id.mjs',
  '/holdem-practice/modules/lang/th.mjs',
  '/holdem-practice/modules/lang/tk.mjs',
  '/holdem-practice/modules/lang/fil.mjs',
  '/holdem-practice/modules/lang/bn.mjs',
  '/holdem-practice/modules/lang/sw.mjs',
  '/holdem-practice/modules/sounds.mjs',
  '/holdem-practice/modules/music.mjs',
  // Sons de jeu PokerTH (MP3, AGPL-3.0)
  '/holdem-practice/sounds/pokerth/fold.mp3',
  '/holdem-practice/sounds/pokerth/check.mp3',
  '/holdem-practice/sounds/pokerth/call.mp3',
  '/holdem-practice/sounds/pokerth/bet.mp3',
  '/holdem-practice/sounds/pokerth/raise.mp3',
  '/holdem-practice/sounds/pokerth/allin.mp3',
  '/holdem-practice/sounds/pokerth/dealtwocards.mp3',
  '/holdem-practice/sounds/pokerth/yourturn.mp3',
  '/holdem-practice/sounds/pokerth/blinds_raises_level1.mp3',
  '/holdem-practice/sounds/pokerth/blinds_raises_level2.mp3',
  '/holdem-practice/sounds/pokerth/blinds_raises_level3.mp3',
  // Default deck (theme.mjs 'pokerth-new', PokerTH Royal Classic, ~50 KB)
  // and default table style ('' → table/pokerth-official-fs: felt, pucks,
  // action buttons, ~1 MB), so a table has its cards and felt with no
  // network right after an update. The back is listed twice: the inline
  // boot poses it plain, deck.mjs with ?v=<build> (a distinct cache key).
  ...Array.from({ length: 52 }, function (_, n) { return '/holdem-practice/cards/pokerth-new/' + n + '.svg'; }),
  '/holdem-practice/cards/pokerth-new/flipside.svg',
  '/holdem-practice/cards/pokerth-new/flipside.svg?v=' + BUILD_ID,
  '/holdem-practice/table/pokerth-official-fs/felt.png',
  '/holdem-practice/table/pokerth-official-fs/dealerPuck.svg',
  '/holdem-practice/table/pokerth-official-fs/smallblindPuck.svg',
  '/holdem-practice/table/pokerth-official-fs/bigblindPuck.svg',
  '/holdem-practice/table/pokerth-official-fs/actionFold.svg',
  '/holdem-practice/table/pokerth-official-fs/actionCall.svg',
  '/holdem-practice/table/pokerth-official-fs/actionRaise.svg',
  '/holdem-practice/table/pokerth-official-fs/actionAllIn.svg',
  '/holdem-practice/favicon.ico',
  '/holdem-practice/favicon.svg',
  '/holdem-practice/favicon-32.png',
  '/holdem-practice/favicon-192.png',
  '/holdem-practice/favicon-512.png',
  '/holdem-practice/logo-chip.png',
  '/holdem-practice/bbc-icon.png',
  '/holdem-practice/wec-icon.png',
  '/holdem-practice/img/pokerth-login-bg.webp',
  // PWA install icons referenced by manifest.json
  '/holdem-practice/icon-192.png',
  '/holdem-practice/icon-512.png',
  '/holdem-practice/icon-maskable-192.png',
  '/holdem-practice/icon-maskable-512.png',
  '/holdem-practice/ChangeLog',
  '/holdem-practice/CHANGELOG.md',
  '/holdem-practice/modules/ui/changelog-md.mjs'
];

// Precache one asset with a couple of retries so a single flaky request
// doesn't leave a hole. addAll() is all-or-nothing (one failure rejects the
// whole batch) and its rejection used to be swallowed, so a hiccup during
// install could leave the cache empty without any signal. Per-asset with
// allSettled below means a miss is isolated, retried, and logged.
function precacheOne(cache, url, tries) {
  tries = tries || 3;
  return (async function () {
    for (var i = 0; i < tries; i++) {
      try {
        var res = await fetch(new Request(url, { cache: 'reload' }));
        if (res && res.status === 200) { await cache.put(url, res.clone()); return true; }
      } catch (e) { /* retry */ }
      await new Promise(function (r) { setTimeout(r, 400 * (i + 1)); });
    }
    console.warn('[SW] precache miss:', url);
    return false;
  })();
}

// ── Install : precache the app shell (per-asset, resilient) ──
self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE_VERSION).then(function (c) {
      // Bounded concurrency: firing all ~130 fetches at once hammered the
      // origin on every update — worst when the update banner lands during
      // the nightly server backup. A small worker pool (6) keeps installs
      // gentle without noticeably slowing them; precacheOne never rejects,
      // so each worker chain runs to the end of the queue.
      var queue = ASSETS.slice();
      var miss = 0;
      function worker() {
        var u = queue.shift();
        if (u === undefined) return Promise.resolve();
        return precacheOne(c, u).then(function (ok) {
          if (ok === false) miss++;
          return worker();
        });
      }
      var pool = [];
      for (var i = 0; i < 6 && i < ASSETS.length; i++) pool.push(worker());
      return Promise.all(pool).then(function () {
        if (miss) console.warn('[SW] precache incomplete:', miss, 'of', ASSETS.length, 'asset(s) missing');
        else console.log('[SW] precache complete:', ASSETS.length, 'assets');
      });
    })
  );
  // NOTE: skipWaiting() is deliberately NOT called here. A freshly installed SW
  // must WAIT until the user applies the update via the /__ver banner (which
  // posts SKIP_WAITING below, then reloads). Auto-activating would let the new
  // SW take over a live page and fire controllerchange, which can drop an
  // in-flight WebSocket to the proxy (close 1005) → the PokerTH server reads it
  // as a connect-then-drop and blocks the IP for a few minutes (the bug seen
  // when reconnecting after a reload with a cleared cache). Waiting also keeps
  // registration.waiting populated so the banner button has a worker to message.
});

// ── Activate : drop old caches, enable nav preload ──
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys
          .filter(function(k) { return k !== CACHE_VERSION && k !== SHARE_CACHE; })
          .map(function(k) {
            console.log('[SW] Dropping old cache:', k);
            return caches.delete(k);
          })
      );
    }).then(function() {
      // Let the browser fetch the navigation request in parallel with SW
      // startup so network-first navigations stay fast.
      if (self.registration.navigationPreload) {
        return self.registration.navigationPreload.enable();
      }
    }).then(function() {
      // NOTE: clients.claim() is deliberately NOT called. Taking control of an
      // already-loaded page fires controllerchange, which can drop an in-flight
      // WebSocket to the proxy (close 1005) and make the PokerTH server treat it
      // as a connect-then-drop → temporary IP block. This is the root cause of
      // the buggy reconnect after a reload (reliably reproduced once the cache
      // is cleared, since the SW then re-installs from scratch). Updates are
      // user-driven (the /__ver banner → SKIP_WAITING → reload), so the SW only
      // ever controls a freshly-navigated page, never a live one.
      // Tell pages a new version is live so they can offer a reload prompt.
      return self.clients.matchAll({ type: 'window' }).then(function(clients) {
        clients.forEach(function(client) {
          client.postMessage({ type: 'SW_UPDATED', version: CACHE_VERSION });
        });
      });
    })
  );
});

// ── Message : SKIP_WAITING (from the page) ──
self.addEventListener('message', function(e) {
  if (e.data && e.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Network-first, used for navigations (the HTML document). Prefers the preload
// response when available, refreshes the cached shell, and falls back to cache
// (then a tiny offline notice) when the network is down.
// The cached app shell only stands in for the app itself: a first visit to
// /live, /privacy, /faq, /studio… used to get the full client at that URL when
// the network was slow or down.
function isAppRoute(req) {
  try { return /^\/(?:index\.html|pokerth-client\.html)?$/.test(new URL(req.url).pathname); } catch (e) { return false; }
}
function handleNavigation(e) {
  var appRoute = isAppRoute(e.request);
  return (async function() {
    try {
      var preload = await e.preloadResponse;
      var netP = preload ? Promise.resolve(preload) : fetch(e.request);
      // Don't hang on a blank page while the origin is slow: after
      // NAV_TIMEOUT_MS serve the cached shell and let the fetch finish in the
      // background (it still refreshes the cache for the next load).
      var response = await Promise.race([
        netP,
        new Promise(function (res) { setTimeout(function () { res(null); }, NAV_TIMEOUT_MS); })
      ]);
      if (response === null) {
        netP.then(function (r) {
          if (r && r.status === 200) {
            var cl = r.clone();
            caches.open(CACHE_VERSION).then(function (c) { c.put(e.request, cl); });
          }
        }).catch(function () {});
        var shellNow = await caches.match(e.request) || (appRoute ? await caches.match(NAV_FALLBACK) : null);
        if (shellNow) return shellNow;
        response = await netP; // nothing cached yet (first visit) — wait it out
      }
      if (response && response.status === 200) {
        var clone = response.clone();
        caches.open(CACHE_VERSION).then(function(c) { c.put(e.request, clone); });
      }
      return response;
    } catch (err) {
      var cached = await caches.match(e.request);
      if (cached) return cached;
      var shell = appRoute ? await caches.match(NAV_FALLBACK) : null;
      if (shell) return shell;
      return new Response('Offline — reload when you are back online', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }
  })();
}

// Stale-while-revalidate, used for static assets. Serve from cache at once and
// refresh in the background; if nothing is cached, go to network and store it.
function handleAsset(e) {
  return caches.open(CACHE_VERSION).then(function(cache) {
    return cache.match(e.request).then(function(cached) {
      var network = fetch(e.request).then(function(response) {
        if (response && response.status === 200) {
          cache.put(e.request, response.clone());
        }
        return response;
      }).catch(function() { return null; });
      // Cache hit → instant response, network refresh happens in the background.
      // Cache miss → wait for the network (and a real Response on failure).
      return cached || network.then(function(r) {
        return r || new Response('Offline', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      });
    });
  });
}

// True network-first for app CODE (.js/.mjs/.css): the network is always
// tried FIRST (`cache:'reload'` bypasses the HTTP disk cache too), and only
// a network failure (offline, origin down) falls back to the SW cache — so
// two code files requested moments apart (e.g. pokerth.js + pokerth.css on
// the same page load) can never end up served from two different deploys.
// Was stale-while-revalidate until 2.1.8-web.155 (narmod, 2026-09-12): that
// served the CACHED copy instantly and only refreshed it in the background
// for the *next* request, so pokerth.css and pokerth.js — revalidated by
// independent, differently-timed requests — could each pick up a deploy at
// a different moment and briefly disagree (new JS markup rendered against
// old CSS, or vice versa). Slightly slower on a cold/slow connection since
// every request now waits on the network before falling back; still fully
// offline-capable, and the /__ver banner is unaffected (CACHE_VERSION bump
// still drives the full re-precache on activate).
function handleCode(e) {
  return caches.open(CACHE_VERSION).then(function (cache) {
    return fetch(e.request, { cache: 'reload' }).then(function (response) {
      if (response && response.status === 200) {
        cache.put(e.request, response.clone());
        return response;
      }
      // A 5xx is an edge/origin hiccup (Cloudflare 52x bursts between the
      // edge and the origin last a few seconds), not a verdict on the file:
      // answering with it fails the <script type=module> just like a cut
      // connection would. Serve this version's precached copy when there is
      // one — same build as long as this worker is current — and pass the
      // error through otherwise. A 404 is passed through untouched (real
      // "not here"). If this worker is OLDER than the server (update not
      // applied yet), that copy can mismatch its fresh neighbours: the page
      // detects the resulting link error and reloads once (pokerth-client.html,
      // "Module skew", web.260).
      if (response && response.status >= 500) {
        return cache.match(e.request).then(function (cached) {
          return cached || response;
        });
      }
      return response;
    }).catch(function () {
      return cache.match(e.request).then(function (cached) {
        return cached || new Response('Offline', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      });
    });
  });
}

// ── Notification actions ──
// The turn notification carries Fold / Check-Call buttons (see action-bar.mjs).
// Only a service worker can own those buttons, so the click lands here: we
// focus the game window and hand the chosen action over to the page, which
// re-validates that it is still the player's turn before sending anything.
// A click on the notification body (no action) only focuses the window.
self.addEventListener('notificationclick', function(e) {
  var act = e.action || '';
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(list) {
      var client = (list && list[0]) || null;
      if (!client) return self.clients.openWindow('/');
      // The notification names the tab that posted it (data.tab): every window
      // gets the action and only that tab plays it. Without a tab (a page from
      // before web.331) the first window gets it, as before.
      var tab = e.notification.data && e.notification.data.tab;
      if (act && tab) list.forEach(function (c) { try { c.postMessage({ type: 'NOTIF_ACTION', action: act, tab: tab }); } catch (_e) {} });
      else if (act) client.postMessage({ type: 'NOTIF_ACTION', action: act });
      return client.focus ? client.focus() : null;
    })
  );
});

// ── Web Share Target (POST, multipart) ──
// The manifest points share_target at /share-target, but nothing on the server
// answers that route: the service worker IS the endpoint. The OS posts the
// shared text/URL and files here; we park the payload in a dedicated cache and
// redirect to the app, which drains it on boot (window._pthDrainShare).
function handleShareTarget(e) {
  return (async function() {
    var idx = { ts: Date.now(), title: '', text: '', url: '', files: [] };
    try {
      var form = await e.request.formData();
      idx.title = String(form.get('title') || '');
      idx.text  = String(form.get('text')  || '');
      idx.url   = String(form.get('url')   || '');
      var cache = await caches.open(SHARE_CACHE);
      var files = form.getAll('files') || [];
      for (var i = 0; i < files.length && i < 4; i++) {
        var f = files[i];
        if (!f || typeof f.name !== 'string') continue;
        var path = '/__share/' + i;
        await cache.put(new Request(path), new Response(f, {
          headers: { 'Content-Type': f.type || 'application/octet-stream' }
        }));
        idx.files.push({ path: path, name: f.name, type: f.type || '' });
      }
      await cache.put(new Request('/__share/index.json'), new Response(JSON.stringify(idx), {
        headers: { 'Content-Type': 'application/json' }
      }));
    } catch (err) {}
    // 303: turns the POST into a GET navigation, so a reload never re-posts.
    return Response.redirect('/?share=1', 303);
  })();
}

// ── Fetch : route by request type ──
self.addEventListener('fetch', function(e) {
  if (e.request.method === 'POST' &&
      new URL(e.request.url).pathname === '/share-target') {
    e.respondWith(handleShareTarget(e));
    return;
  }
  if (e.request.method !== 'GET') return;
  var url = new URL(e.request.url);
  // Don't intercept WebSocket upgrades or cross-origin requests (fonts etc.)
  if (url.origin !== self.location.origin) return;
  // The admin dashboard + its API are authenticated and no-store: never let the
  // SW cache or serve them (otherwise the package list, status, logs… show stale
  // after a change). Network only — admin is an online-only tool.
  if (/^\/admin(?:\/|$)/.test(url.pathname)) return;
  // Same for /arena: sent to the linked Arena (or a 404): a cached app shell
  // must never stand in for it.
  if (/^\/arena(?:\.html|\/|$)/.test(url.pathname)) return;
  // Live state endpoints served by the proxy: never cached, never served from
  // Cache Storage. `cache:'no-store'` on the page and `Cache-Control: no-store`
  // on the response are both ignored once the SW answers from a cache entry, so
  // the only way to keep them fresh is to leave them alone here. /__ver in
  // particular drives the update banner: served stale, it made the page compare
  // the previous deploy's marker against the fresh one and prompt for an update
  // that was already applied.
  if (/^\/(?:__ver|__time|__visit|__music|__poll-vote|prefs|prefs-web|stats|api)(?:\/|$)/.test(url.pathname)) return;
  // Media is served by the browser straight from the network: an <audio> element
  // streams with byte-range requests, and the SWR handler below only stores
  // status 200, so a 206 was never cacheable anyway. Every buffer chunk paid a
  // SW round-trip plus a full background revalidation, and a cache.match() hit
  // (which ignores Range) could answer a partial request with the whole file —
  // both stutter playback, badly so on iOS Safari. Nothing offline is lost.
  if (e.request.headers.get('range')) return;
  if (/^\/music\//.test(url.pathname) && !/\.json$/.test(url.pathname)) return;

  if (e.request.mode === 'navigate') {
    e.respondWith(handleNavigation(e));
  } else if (/\.(?:js|mjs|css)$/.test(url.pathname) || /^\/(?:table\/tables|cards\/decks|seats\/seats|music\/tracks)\.json$/.test(url.pathname) || url.pathname === '/app-config') {
    // Code, the runtime gallery manifests, AND the live /app-config are
    // network-first: a freshly imported package or a changed admin default must
    // be visible on the next load, never served stale from the SW cache.
    e.respondWith(handleCode(e));
  } else {
    e.respondWith(handleAsset(e));
  }
});

