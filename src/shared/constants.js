// Metadata shared by the floating bar, popup and options page.
// Loaded before content.js and via <script> in extension pages.
(() => {
  const ACTIONS = {
    translate: {
      label: 'Traduire',
      short: 'Traduire',
      hint: 'Traduire la sélection (Ctrl+Maj+Y)',
      icon: 'translate',
      editable: true,
    },
    rephrase: {
      label: 'Reformuler',
      short: 'Reformuler',
      hint: 'Reformuler sans changer le sens (Ctrl+Maj+U)',
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
      hint: 'Résumer la sélection (Ctrl+Maj+H)',
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
      hint: 'Résumer le contenu de la page (Ctrl+Maj+1)',
      icon: 'page',
      editable: false,
    },
    refine: {
      label: 'Suites (raccourcir, détailler…)',
      short: 'Suites',
      hint: 'Modèle utilisé pour affiner un résultat',
      icon: 'sparkles',
      editable: false,
    },
    refine_shorter: {
      label: 'Raccourcir',
      short: 'Raccourcir',
      hint: 'Raccourcir le résultat',
      icon: 'list',
      editable: false,
    },
    refine_longer: {
      label: 'Détailler',
      short: 'Détailler',
      hint: 'Développer le résultat',
      icon: 'sparkles',
      editable: false,
    },
    refine_formal: {
      label: 'Plus formel',
      short: 'Plus formel',
      hint: 'Rendre le résultat plus formel',
      icon: 'sparkles',
      editable: false,
    },
    refine_bullets: {
      label: 'En puces',
      short: 'En puces',
      hint: 'Convertir le résultat en liste à puces',
      icon: 'list',
      editable: false,
    },
    refine_explain: {
      label: 'Expliquer',
      short: 'Expliquer',
      hint: 'Expliquer le résultat simplement',
      icon: 'sparkles',
      editable: false,
    },
  };

  const FOLLOW_UPS = [
    'refine_shorter',
    'refine_longer',
    'refine_formal',
    'refine_bullets',
    'refine_explain',
  ];

  globalThis.LILI = {
    ACTIONS,
    /** Actions offered on a text selection. */
    SELECTION_ACTIONS: ['translate', 'rephrase', 'rephrase_translate', 'summarize', 'fix'],
    /** Actions whose result can replace the selection. */
    REPLACEABLE: [
      'translate',
      'rephrase',
      'rephrase_translate',
      'fix',
      ...FOLLOW_UPS,
    ],
    /** Actions offered on an existing result. */
    FOLLOW_UPS,
  };
})();
