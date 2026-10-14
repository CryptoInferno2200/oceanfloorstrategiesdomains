# Publishing OFS Domains to the App Store and Google Play

OFS Domains already installs as an app on iPhone, iPad, Android, and desktop from
https://www.ofsdomains.com/app.html (a Progressive Web App: manifest, icons, offline
service worker). Store listings are optional and wrap that same live site, so every
deploy updates the store apps too — no resubmission for normal site changes.

## What you need first (owner only)

| Store        | Account                                   | Cost          |
|--------------|-------------------------------------------|---------------|
| Google Play  | Google Play Console developer account     | $25 one-time  |
| App Store    | Apple Developer Program + a Mac with Xcode| $99 per year  |

Also have ready: privacy policy URL (https://www.ofsdomains.com/privacy.html),
support email, 2–8 phone screenshots, and the 512×512 icon at `assets/icons/icon-512.png`.

## Android (Google Play) — Trusted Web Activity

1. Go to https://www.pwabuilder.com, enter `https://www.ofsdomains.com`, choose **Android → Generate**.
   Package ID suggestion: `com.ofsdomains.app`.
2. Download the package. Keep the generated **signing key and passwords** somewhere safe —
   losing them means you can never update the app.
3. The package includes an `assetlinks.json`. Publish it at
   `/.well-known/assetlinks.json` in this repo (add the file and deploy). Without it the app
   shows a browser address bar. If you use Play App Signing, add the SHA-256 fingerprint from
   Play Console → App integrity as well.
4. In Play Console create the app, upload the `.aab`, fill in the store listing, content
   rating, and Data safety form (account email, purchases via Stripe), then submit for review.

Note: Google Play requires digital goods sold inside Android apps to use Play Billing.
Domains, hosting, and sites are services used outside the app; if review flags the Stripe
checkout, open checkout in the external browser from the Android app.

## iPhone + iPad (App Store)

1. In PWABuilder choose **iOS → Generate** and open the project in Xcode on a Mac.
2. Set the bundle ID (e.g. `com.ofsdomains.app`), your team, and app icons.
3. Archive and upload to App Store Connect, add screenshots, privacy details, and submit.

Apple review guideline 4.2 rejects apps that are "just a website". Before submitting, make
sure the app offers app-like value (sign-in, workspace, vault, notifications). Apple also
requires in-app account deletion for apps with sign-up — add it to the Profile page before
submitting. Purchases of services consumed outside the app (domains, hosting) may use
Stripe, but expect reviewer questions.

## After the listings are live

Add the store links to the "Store listings" card on `app.html`, and add
`related_applications` entries to `manifest.webmanifest` if you want browsers to point
Android users to the Play listing.
