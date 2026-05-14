The most popular library by far is **react-i18next**. Here's how it typically looks end-to-end:

## 1. Setup (one-time config)

```js
// i18n.js — initialized once, imported at app root
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

i18n.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  resources: {
    en: { translation: require('./locales/en.json') },
    fr: { translation: require('./locales/fr.json') },
  }
})

export default i18n
```

```js
// main.jsx
import './i18n'  // just import it, side-effectful
```

---

## 2. The Translation Files

Flat or nested JSON, manually maintained:

```json
// locales/en.json
{
  "welcome": "Welcome back!",
  "nav.home": "Home",
  "nav.settings": "Settings",
  "items_count": "{{count}} item",
  "items_count_plural": "{{count}} items"
}
```

```json
// locales/fr.json
{
  "welcome": "Bienvenue!",
  "nav.home": "Accueil",
  "nav.settings": "Paramètres",
  "items_count": "{{count}} élément",
  "items_count_plural": "{{count}} éléments"
}
```

**This is the painful part** — every new string means touching these files.

---

## 3. Usage in Components

```jsx
import { useTranslation } from 'react-i18next'

function NavBar() {
  const { t, i18n } = useTranslation()

  return (
    <nav>
      <h1>{t('welcome')}</h1>
      <a>{t('nav.home')}</a>
      <a>{t('nav.settings')}</a>

      {/* interpolation */}
      <p>{t('items_count', { count: 5 })}</p>

      {/* switching locale */}
      <button onClick={() => i18n.changeLanguage('fr')}>FR</button>
    </nav>
  )
}
```

There's also a `<Trans>` component for strings with embedded JSX:

```jsx
import { Trans } from 'react-i18next'

// When you can't just use t() because there's markup inside
<Trans i18nKey="agree_terms">
  I agree to the <a href="/terms">Terms of Service</a>
</Trans>
```

---

## 4. The Typical File Structure

```
src/
├── i18n.js
├── locales/
│   ├── en.json
│   ├── fr.json
│   ├── ar.json
│   └── zh.json
└── components/
    └── NavBar.jsx
```

Larger projects split by **namespace** (feature area):

```json
// locales/en/common.json  → shared strings
// locales/en/dashboard.json → dashboard-specific
// locales/en/settings.json
```

```js
const { t } = useTranslation('dashboard')  // loads that namespace
```

---

## 5. The Full Dev Workflow (where the pain is)

```
1. Write component with t('some.new.key')
2. Open en.json → add "some.new.key": "My string"
3. Open fr.json → add "some.new.key": ""  ← leave blank or guess
4. Send fr.json to a translator / translation service
5. Wait
6. Get back fr.json, paste it in
7. Repeat for every language
8. Forget to add a key → silent fallback to key name in UI 😬
```

The forgetting step is especially common — `t('nav.settings')` silently renders as `"nav.settings"` in the UI if the key is missing, which you might not catch until QA.

---