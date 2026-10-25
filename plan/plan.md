# FinPlanner — Real Ads: AdMob (mobile) + AdSense (web)

FinPlanner gets real banner advertising: AdMob banners in the iOS/Android app and an AdSense banner on the web version, shown only to free users in the ad slot that already exists as a placeholder today. Premium members get a completely ad-free experience.

## Who it's for
Free-tier FinPlanner users see the banner (this funds the free plan); premium subscribers never see ads. The app owner monetizes without changing any feature behavior.

## Core features and experience
- **One banner placement**: the existing placeholder ad slot becomes a real ad component. No new placements are added.
- **AdMob on iOS/Android**: a native adaptive banner is rendered in the slot. During development and testing, Google's official test ads are shown so the owner's AdMob account is never put at risk; the owner's real ad unit IDs are used only in production builds.
- **AdSense on web**: a responsive AdSense display banner renders in the same slot when the app runs in a browser. The required `ads.txt` file is served at the domain root.
- **Premium suppression**: the ad is hidden whenever the signed-in user's premium flag is set — this is read from the account data that already exists, so upgrading instantly removes ads everywhere.
- **Graceful fallbacks**: if an ad fails to load (offline, ad blocker, unfilled demand), the slot collapses quietly — no broken UI, no empty gray box.

## User flow
Nothing changes for users except: a free user now sees a real banner where the placeholder was; a premium user sees nothing. There is no new screen, setting, or interaction.

## UI/UX feel
Unchanged. The banner occupies the same slot with the same sizing behavior as the placeholder. No layout shifts elsewhere.

## Implementation phases
- **Phase 1 (built now)** — the ad component replaces the placeholder, wired with platform-specific implementations (AdMob on native, AdSense on web), premium-based suppression, development test ads on native, and the `ads.txt` file prepared. The app is fully ready; it shows test ads on native builds until the owner's real IDs are dropped in.
- **Phase 2 (later)** — production launch: owner supplies real AdMob app/ad-unit IDs and the AdSense publisher ID + slot; store compliance items (iOS App Tracking Transparency prompt, EEA/UK consent message, Play Store "contains ads" declaration, App Store privacy disclosure).
- **Phase 3 (later)** — optional revenue growth: interstitial or rewarded formats, ad mediation, and performance tuning. Not in scope now.

## Assumptions
- Banner only, in the existing slot — no interstitials or rewarded ads (as chosen).
- Ads show for free users only; premium members are ad-free (as chosen). The premium flag currently comes from the existing mock entitlement; when real billing is wired later, ad suppression keeps working unchanged.
- The owner will create the AdMob and AdSense accounts and supply four values after approving this plan: AdMob iOS App ID + banner unit ID, AdMob Android App ID + banner unit ID, and the AdSense publisher ID + slot ID. A bare "link" to the account is not usable — these IDs come from each network's dashboard.
- Native ads cannot appear in Expo Go or the browser preview — they only run in real iOS/Android builds generated via Publish. AdSense on web requires the owner's domain to be approved by Google, and ads may take days to start serving after approval; a blank slot during that window is normal.
- Until real IDs are provided, native builds show Google's official test ads and the web slot stays as the placeholder, so nothing breaks in the meantime.
- Store consent/privacy declarations (ATT, EEA consent, data-safety forms) are deferred to Phase 2 when real IDs go live.
