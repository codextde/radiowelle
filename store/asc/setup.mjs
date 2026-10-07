import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { ascKey, setting } from '../config.mjs';

const { id: KEY_ID, issuer: ISSUER, key } = ascKey();
const BUNDLE = 'de.codext.radiowelle';
const root = new URL('..', import.meta.url).pathname;
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

function token() {
  const now = Math.floor(Date.now() / 1000);
  const h = b64({ alg: 'ES256', kid: KEY_ID, typ: 'JWT' });
  const p = b64({ iss: ISSUER, iat: now, exp: now + 1100, aud: 'appstoreconnect-v1' });
  return `${h}.${p}.${crypto.sign('sha256', Buffer.from(`${h}.${p}`), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
}

async function api(method, p, body, { allowFail = false } = {}) {
  const r = await fetch(`https://api.appstoreconnect.apple.com${p}`, {
    method,
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await r.text();
  if (!r.ok && !allowFail) throw new Error(`${method} ${p} ${r.status} ${t.slice(0, 800)}`);
  return t ? JSON.parse(t) : null;
}

const listing = {
  'de-DE': JSON.parse(fs.readFileSync(path.join(root, 'listing/de.json'), 'utf8')),
  'en-US': JSON.parse(fs.readFileSync(path.join(root, 'listing/en.json'), 'utf8')),
};
const shots = { 'de-DE': 'screens/appstore/de', 'en-US': 'screens/appstore/en' };
const SITE = 'https://radiowelle.codext.de';
const step = process.argv[2] ?? 'all';

const apps = await api('GET', `/v1/apps?filter[bundleId]=${BUNDLE}`);
const app = apps.data[0];
if (!app) {
  console.log('NO_APP');
  process.exit(2);
}
const appId = app.id;
console.log('app', appId, app.attributes.name);

async function appInfo() {
  const infos = await api('GET', `/v1/apps/${appId}/appInfos`);
  const info = infos.data.find((i) => ['PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED'].includes(i.attributes.appStoreState ?? i.attributes.state)) ?? infos.data[0];
  await api('PATCH', `/v1/appInfos/${info.id}`, {
    data: {
      type: 'appInfos',
      id: info.id,
      relationships: {
        primaryCategory: { data: { type: 'appCategories', id: 'MUSIC' } },
        secondaryCategory: { data: { type: 'appCategories', id: 'ENTERTAINMENT' } },
      },
    },
  });
  console.log('categories set');
  const locs = await api('GET', `/v1/appInfos/${info.id}/appInfoLocalizations`);
  for (const [locale, t] of Object.entries(listing)) {
    const existing = locs.data.find((l) => l.attributes.locale === locale);
    const attributes = { name: t.title, subtitle: t.subtitle, privacyPolicyUrl: locale === 'de-DE' ? `${SITE}/datenschutz/` : `${SITE}/datenschutz/#en` };
    if (existing) await api('PATCH', `/v1/appInfoLocalizations/${existing.id}`, { data: { type: 'appInfoLocalizations', id: existing.id, attributes } });
    else await api('POST', '/v1/appInfoLocalizations', { data: { type: 'appInfoLocalizations', attributes: { locale, ...attributes }, relationships: { appInfo: { data: { type: 'appInfos', id: info.id } } } } });
    console.log('app info', locale);
  }
  const age = await api('GET', `/v1/appInfos/${info.id}/ageRatingDeclaration`);
  const attributes = {
    alcoholTobaccoOrDrugUseOrReferences: 'NONE',
    contests: 'NONE',
    gamblingSimulated: 'NONE',
    horrorOrFearThemes: 'NONE',
    matureOrSuggestiveThemes: 'NONE',
    medicalOrTreatmentInformation: 'NONE',
    profanityOrCrudeHumor: 'NONE',
    sexualContentGraphicAndNudity: 'NONE',
    sexualContentOrNudity: 'NONE',
    violenceCartoonOrFantasy: 'NONE',
    violenceRealistic: 'NONE',
    violenceRealisticProlongedGraphicOrSadistic: 'NONE',
    gunsOrOtherWeapons: 'NONE',
    gambling: false,
    lootBox: false,
    unrestrictedWebAccess: false,
    messagingAndChat: false,
    userGeneratedContent: false,
    healthOrWellnessTopics: false,
    parentalControls: false,
    ageAssurance: false,
    advertising: false,
    socialMedia: false,
  };
  let result = await api('PATCH', `/v1/ageRatingDeclarations/${age.data.id}`, { data: { type: 'ageRatingDeclarations', id: age.data.id, attributes } }, { allowFail: true });
  if (result?.errors) {
    const bad = new Set(result.errors.map((e) => e.source?.pointer?.split('/').pop()).filter(Boolean));
    for (const k of bad) delete attributes[k];
    console.log('age rating: dropped unsupported fields', [...bad].join(', '));
    result = await api('PATCH', `/v1/ageRatingDeclarations/${age.data.id}`, { data: { type: 'ageRatingDeclarations', id: age.data.id, attributes } });
  }
  console.log('age rating set');
}

async function pricing() {
  const points = await api('GET', `/v1/apps/${appId}/appPricePoints?filter[territory]=USA&limit=200`);
  const free = points.data.find((p) => Number(p.attributes.customerPrice) === 0);
  await api('POST', '/v1/appPriceSchedules', {
    data: {
      type: 'appPriceSchedules',
      relationships: {
        app: { data: { type: 'apps', id: appId } },
        baseTerritory: { data: { type: 'territories', id: 'USA' } },
        manualPrices: { data: [{ type: 'appPrices', id: '${price0}' }] },
      },
    },
    included: [
      {
        type: 'appPrices',
        id: '${price0}',
        attributes: { startDate: null },
        relationships: { appPricePoint: { data: { type: 'appPricePoints', id: free.id } } },
      },
    ],
  });
  console.log('price: free');
  const territories = [];
  let next = '/v1/territories?limit=200';
  while (next) {
    const page = await api('GET', next.replace('https://api.appstoreconnect.apple.com', ''));
    territories.push(...page.data.map((t) => t.id));
    next = page.links?.next;
  }
  const availability = await api(
    'POST',
    '/v2/appAvailabilities',
    {
      data: {
        type: 'appAvailabilities',
        attributes: { availableInNewTerritories: true },
        relationships: {
          app: { data: { type: 'apps', id: appId } },
          territoryAvailabilities: { data: territories.map((t, i) => ({ type: 'territoryAvailabilities', id: `\${t${i}}` })) },
        },
      },
      included: territories.map((t, i) => ({
        type: 'territoryAvailabilities',
        id: `\${t${i}}`,
        attributes: { available: true },
        relationships: { territory: { data: { type: 'territories', id: t } } },
      })),
    },
    { allowFail: true },
  );
  console.log('availability', availability?.errors ? JSON.stringify(availability.errors).slice(0, 300) : `${territories.length} territories`);
}

async function version() {
  const versions = await api('GET', `/v1/apps/${appId}/appStoreVersions?filter[platform]=IOS`);
  let v = versions.data.find((x) => ['PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED', 'METADATA_REJECTED'].includes(x.attributes.appStoreState));
  if (!v) {
    v = (await api('POST', '/v1/appStoreVersions', { data: { type: 'appStoreVersions', attributes: { platform: 'IOS', versionString: '1.0.0' }, relationships: { app: { data: { type: 'apps', id: appId } } } } })).data;
  } else if (v.attributes.versionString !== '1.0.0') {
    await api('PATCH', `/v1/appStoreVersions/${v.id}`, { data: { type: 'appStoreVersions', id: v.id, attributes: { versionString: '1.0.0' } } });
  }
  await api('PATCH', `/v1/appStoreVersions/${v.id}`, { data: { type: 'appStoreVersions', id: v.id, attributes: { copyright: '2026 Codext GmbH', releaseType: 'AFTER_APPROVAL' } } });
  console.log('version', v.id);
  const locs = await api('GET', `/v1/appStoreVersions/${v.id}/appStoreVersionLocalizations`);
  for (const [locale, t] of Object.entries(listing)) {
    let loc = locs.data.find((l) => l.attributes.locale === locale);
    const attributes = {
      description: t.fullDescription,
      keywords: t.keywords.slice(0, 100),
      promotionalText: t.promotionalText,
      supportUrl: locale === 'de-DE' ? `${SITE}/support/` : `${SITE}/support/#en`,
      marketingUrl: locale === 'de-DE' ? `${SITE}/` : `${SITE}/en/`,
    };
    if (loc) await api('PATCH', `/v1/appStoreVersionLocalizations/${loc.id}`, { data: { type: 'appStoreVersionLocalizations', id: loc.id, attributes } });
    else loc = (await api('POST', '/v1/appStoreVersionLocalizations', { data: { type: 'appStoreVersionLocalizations', attributes: { locale, ...attributes }, relationships: { appStoreVersion: { data: { type: 'appStoreVersions', id: v.id } } } } })).data;
    console.log('version texts', locale);
    const sets = await api('GET', `/v1/appStoreVersionLocalizations/${loc.id}/appScreenshotSets`);
    for (const s of sets.data) await api('DELETE', `/v1/appScreenshotSets/${s.id}`);
    const set = await api('POST', '/v1/appScreenshotSets', { data: { type: 'appScreenshotSets', attributes: { screenshotDisplayType: 'APP_IPHONE_67' }, relationships: { appStoreVersionLocalization: { data: { type: 'appStoreVersionLocalizations', id: loc.id } } } } });
    const dir = path.join(root, shots[locale]);
    for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.png')).sort()) {
      const buf = fs.readFileSync(path.join(dir, f));
      const s = await api('POST', '/v1/appScreenshots', { data: { type: 'appScreenshots', attributes: { fileName: `radiowelle-${locale}-${f}`, fileSize: buf.length }, relationships: { appScreenshotSet: { data: { type: 'appScreenshotSets', id: set.data.id } } } } });
      for (const op of s.data.attributes.uploadOperations) {
        const headers = {};
        for (const h of op.requestHeaders) headers[h.name] = h.value;
        const r = await fetch(op.url, { method: op.method, headers, body: buf.subarray(op.offset, op.offset + op.length) });
        if (!r.ok) throw new Error(`upload ${r.status}`);
      }
      await api('PATCH', `/v1/appScreenshots/${s.data.id}`, { data: { type: 'appScreenshots', id: s.data.id, attributes: { uploaded: true, sourceFileChecksum: crypto.createHash('md5').update(buf).digest('hex') } } });
      console.log('  screenshot', locale, f);
    }
  }
  const review = await api('GET', `/v1/appStoreVersions/${v.id}/appStoreReviewDetail`, null, { allowFail: true });
  const reviewAttrs = {
    contactFirstName: setting('REVIEW_CONTACT_FIRST_NAME'),
    contactLastName: setting('REVIEW_CONTACT_LAST_NAME'),
    contactEmail: setting('REVIEW_CONTACT_EMAIL'),
    contactPhone: setting('REVIEW_CONTACT_PHONE'),
    demoAccountRequired: false,
    notes:
      'Radiowelle is a free internet radio player by Codext GmbH (Germany): no accounts, no ads, no in-app purchases, no tracking. It only plays the public live streams that radio stations themselves publish for third-party players and directories; the app does not record, store or redistribute content. The bundled list of 265 German stations and the worldwide search use the open community directory radio-browser.info (public domain data, public API). Station names and logos are shown solely to identify the station the user chooses, the same way radio directories such as radio.de, TuneIn or radio-browser.info do; broadcasters can ask for removal at kontakt@codext.de. Background audio is used so the chosen station keeps playing while the screen is locked; lock screen controls and AirPlay are supported. How to test: tap any station on the home screen, open the player from the mini player above the tab bar, add a favorite with the heart, try the sleep timer, and use Search for stations worldwide.',
  };
  if (review?.data) await api('PATCH', `/v1/appStoreReviewDetails/${review.data.id}`, { data: { type: 'appStoreReviewDetails', id: review.data.id, attributes: reviewAttrs } });
  else await api('POST', '/v1/appStoreReviewDetails', { data: { type: 'appStoreReviewDetails', attributes: reviewAttrs, relationships: { appStoreVersion: { data: { type: 'appStoreVersions', id: v.id } } } } });
  console.log('review details set');
  return v.id;
}

async function attachBuild(versionId) {
  for (let i = 0; i < 60; i++) {
    const builds = await api('GET', `/v1/builds?filter[app]=${appId}&sort=-uploadedDate&limit=5`);
    const b = builds.data.find((x) => x.attributes.processingState === 'VALID');
    const pending = builds.data.find((x) => x.attributes.processingState === 'PROCESSING');
    if (b) {
      await api('PATCH', `/v1/builds/${b.id}`, { data: { type: 'builds', id: b.id, attributes: { usesNonExemptEncryption: false } } }, { allowFail: true });
      await api('PATCH', `/v1/appStoreVersions/${versionId}/relationships/build`, { data: { type: 'builds', id: b.id } });
      console.log('build attached', b.attributes.version);
      return b.id;
    }
    console.log(pending ? 'build processing...' : 'no build yet...');
    await new Promise((r) => setTimeout(r, 30000));
  }
  throw new Error('build not processed in time');
}

async function submit() {
  await api('PATCH', `/v1/apps/${appId}`, { data: { type: 'apps', id: appId, attributes: { contentRightsDeclaration: 'USES_THIRD_PARTY_CONTENT' } } });
  const versions = await api('GET', `/v1/apps/${appId}/appStoreVersions?filter[platform]=IOS&filter[appStoreState]=PREPARE_FOR_SUBMISSION`);
  const v = versions.data[0];
  const sub = await api('POST', '/v1/reviewSubmissions', { data: { type: 'reviewSubmissions', attributes: { platform: 'IOS' }, relationships: { app: { data: { type: 'apps', id: appId } } } } });
  await api('POST', '/v1/reviewSubmissionItems', { data: { type: 'reviewSubmissionItems', relationships: { reviewSubmission: { data: { type: 'reviewSubmissions', id: sub.data.id } }, appStoreVersion: { data: { type: 'appStoreVersions', id: v.id } } } } });
  await api('PATCH', `/v1/reviewSubmissions/${sub.data.id}`, { data: { type: 'reviewSubmissions', id: sub.data.id, attributes: { submitted: true } } });
  console.log('submitted for review', sub.data.id);
}

if (step === 'all' || step === 'info') await appInfo();
if (step === 'all' || step === 'pricing') await pricing();
let versionId;
if (step === 'all' || step === 'version') versionId = await version();
if (step === 'all' || step === 'build') {
  if (!versionId) {
    const versions = await api('GET', `/v1/apps/${appId}/appStoreVersions?filter[platform]=IOS`);
    versionId = versions.data[0].id;
  }
  await attachBuild(versionId);
}
if (step === 'submit') await submit();
