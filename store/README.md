# Store tooling

Listing texts live in `listing/*.json`, store screenshots in `screens/` (composed by `screens/compose.mjs` from simulator captures made with the Maestro flows in `../maestro`).

## Configuration

The scripts read their settings from environment variables or from `credentials/store.json` (gitignored):

```json
{
  "ASC_KEY_ID": "App Store Connect API key id",
  "ASC_ISSUER_ID": "App Store Connect issuer id",
  "ASC_KEY_PATH": "optional, defaults to ~/.appstoreconnect/private_keys/AuthKey_<id>.p8",
  "PLAY_CONSOLE_APP_URL": "https://play.google.com/console/u/0/developers/<developer>/app/<app>",
  "REVIEW_CONTACT_FIRST_NAME": "",
  "REVIEW_CONTACT_LAST_NAME": "",
  "REVIEW_CONTACT_EMAIL": "",
  "REVIEW_CONTACT_PHONE": ""
}
```

Google Play scripts expect a service account key at `credentials/play-service-account.json`.

## App Store

```bash
node store/asc/setup.mjs all      # app info, price, availability, version texts, screenshots, review notes, attach build
node store/asc/setup.mjs submit   # send the version to App Review
```

Upload a build with `xcrun altool --upload-app -f <ipa> -t ios --apiKey <id> --apiIssuer <issuer>`.

## Google Play

```bash
node store/play/listing.mjs                       # texts, icon, feature graphic, screenshots
node store/play/upload-bundle.mjs <aab> internal  # upload a bundle to a track
node store/play/promote.mjs <versionCode> draft   # production release (draft until the app is published)
```
