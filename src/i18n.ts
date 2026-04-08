import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import enTranslations from './locales/en.json';
import viTranslations from './locales/vi.json';
import frTranslations from './locales/fr.json';
import zhTranslations from './locales/zh.json';
import koTranslations from './locales/ko.json';
import jaTranslations from './locales/ja.json';

const savedLanguage = localStorage.getItem('language') || 'vi';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: enTranslations,
      vi: viTranslations,
      fr: frTranslations,
      zh: zhTranslations,
      ko: koTranslations,
      ja: jaTranslations,
    },
    lng: savedLanguage,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false, // React already protects from XSS
    },
  });

export default i18n;
