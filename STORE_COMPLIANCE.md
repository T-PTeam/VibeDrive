# App Store Compliance — VibeDrive MVP

This document tracks non-code deliverables required before the app can be published
on the Apple App Store and Google Play.

---

## Privacy Policy

**Required.** Must be hosted at a stable public URL.
Configured in `mobile-app/app.json` → `privacyPolicyUrl: "https://vibe-drive.store/privacy"`.

Minimum contents for this app:

- What data is collected: audio recordings (voice commands), device identifiers, account
  credentials (email), usage/session data.
- Third-party services: **OpenAI** (audio is sent for transcription and chat completion),
  **Spotify** (OAuth tokens stored on device).
- Microphone usage: recorded only when the user taps the mic button; not recorded in
  background.
- Data retention and deletion policy.
- Contact / support email for privacy requests.

Once written, host the page at `https://vibe-drive.store/privacy` (or update the
`privacyPolicyUrl` in `app.json` to wherever it lives).

---

## Terms of Use

**Recommended** (required by Apple when paid subscriptions are offered).
Host at e.g. `https://vibe-drive.store/terms`.

Key sections: licence grant, prohibited use, subscription / refund policy, limitation
of liability, governing law.

---

## Support URL

**Required for App Store listing.**
Provide a page or email address — e.g. `https://vibe-drive.store/support` or
`support@vibe-drive.store`.

---

## Apple App Privacy labels (App Store Connect)

Go to your app in App Store Connect → App Privacy → answer the questionnaire honestly:

| Data type         | Collected? | Linked to user? | Used for tracking? |
|-------------------|------------|-----------------|-------------------|
| Audio data        | Yes        | No (ephemeral)  | No                |
| Email address     | Yes        | Yes             | No                |
| User ID / token   | Yes        | Yes             | No                |
| Usage data        | Yes        | No              | No                |

---

## Subscription products (IAP)

The plans screen displays three offerings. Before the App Store build goes live you must:

1. Create matching **In-App Purchase** products in **App Store Connect** (Subscriptions):
   - Free (no IAP needed; gated by app logic)
   - **Plus** — Monthly subscription, price tier ~\$3 USD.
   - **Pro** — Monthly subscription, price tier ~\$5 USD.

2. Create matching **Subscription** products in **Google Play Console** under
   Monetization → Subscriptions.

3. Wire `handleSelectPlan` in
   `mobile-app/src/screens/SubscriptionPricesScreen.tsx` to `expo-in-app-purchases`
   (or `react-native-iap`) to initiate purchase flow.

4. Implement a backend endpoint (or RevenueCat/webhook) to validate receipts and unlock
   the paid tier for the user.

**Do not submit to the stores with `handleSelectPlan` as a no-op.** Apple will reject
an app that shows paid subscription options without a working purchase flow.

---

## Export Compliance

`ITSAppUsesNonExemptEncryption: false` is set in `mobile-app/app.json` (iOS).
Confirm this is accurate — standard HTTPS / TLS does not require an export compliance
declaration, so `false` is correct unless you use custom cryptography.

---

## Checklist summary

| Item                                   | Status     |
|----------------------------------------|------------|
| Privacy Policy published at URL        | TODO       |
| Terms of Use published at URL          | TODO       |
| Support URL live                       | TODO       |
| App Privacy questionnaire (Apple)      | TODO       |
| App Store Connect — Plus IAP created   | TODO       |
| App Store Connect — Pro IAP created    | TODO       |
| Google Play — Plus subscription        | TODO       |
| Google Play — Pro subscription         | TODO       |
| `handleSelectPlan` wired to IAP SDK    | TODO       |
| Backend receipt validation endpoint    | TODO       |
