// Minimal i18n helper shared by content scripts and extension pages.
(() => {
  const api = globalThis.browser || globalThis.chrome;
  const i18n = api && api.i18n;
  const cache = new Map();

  function t(key, substitutions) {
    const values = Array.isArray(substitutions)
      ? substitutions
      : substitutions == null
        ? []
        : [String(substitutions)];
    const cacheKey = key + '\u0000' + values.join('\u0001');
    if (cache.has(cacheKey)) return cache.get(cacheKey);

    let message = '';
    try {
      message = i18n && i18n.getMessage ? i18n.getMessage(key, values) : '';
    } catch {
      message = '';
    }

    const result = message || key;
    cache.set(cacheKey, result);
    return result;
  }

  const locale =
    (i18n && i18n.getUILanguage && i18n.getUILanguage()) ||
    (globalThis.navigator && navigator.language) ||
    'en';

  globalThis.LILI_I18N = { t, locale };
})();
