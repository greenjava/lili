// Metadata shared by the floating bar, popup and options page.
// Loaded before content.js and via <script> in extension pages.
(() => {
  const ACTIONS = {
    translate: {
      label: 'Traduire',
      short: 'Traduire',
      hint: 'Traduire la sélection (Alt+Maj+T)',
      icon: 'translate',
      editable: true,
    },
    rephrase: {
      label: 'Reformuler',
      short: 'Reformuler',
      hint: 'Reformuler sans changer le sens (Alt+Maj+R)',
      icon: 'sparkles',
      editable: true,
    },
    rephrase_translate: {
      label: 'Reformuler + traduire',
      short: 'Reform. + trad.',
      hint: 'Reformuler puis traduire le résultat',
      icon: 'shuffle',
      editable: true,
    },
    summarize: {
      label: 'Résumer',
      short: 'Résumer',
      hint: 'Résumer la sélection (Alt+Maj+D)',
      icon: 'list',
      editable: false,
    },
    fix: {
      label: 'Corriger',
      short: 'Corriger',
      hint: 'Corriger l’orthographe et la grammaire',
      icon: 'check',
      editable: true,
    },
    summarize_page: {
      label: 'Résumer la page',
      short: 'Page',
      hint: 'Résumer le contenu de la page (Alt+Maj+S)',
      icon: 'page',
      editable: false,
    },
  };

  globalThis.LILI = {
    ACTIONS,
    /** Actions offered on a text selection. */
    SELECTION_ACTIONS: ['translate', 'rephrase', 'rephrase_translate', 'summarize', 'fix'],
    /** Actions whose result can replace the selection. */
    REPLACEABLE: ['translate', 'rephrase', 'rephrase_translate', 'fix'],
  };
})();
