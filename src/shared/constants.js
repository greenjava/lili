// Metadata shared by the floating bar, popup and options page.
// Loaded before content.js and via <script> in extension pages.
(() => {
  const ACTIONS = {
    translate: {
      labelKey: 'action_translate',
      shortKey: 'action_translate_short',
      hintKey: 'action_translate_hint',
      icon: 'translate',
      editable: true,
    },
    rephrase: {
      labelKey: 'action_rephrase',
      shortKey: 'action_rephrase_short',
      hintKey: 'action_rephrase_hint',
      icon: 'sparkles',
      editable: true,
    },
    rephrase_translate: {
      labelKey: 'action_rephrase_translate',
      shortKey: 'action_rephrase_translate_short',
      hintKey: 'action_rephrase_translate_hint',
      icon: 'shuffle',
      editable: true,
    },
    summarize: {
      labelKey: 'action_summarize',
      shortKey: 'action_summarize_short',
      hintKey: 'action_summarize_hint',
      icon: 'list',
      editable: false,
    },
    fix: {
      labelKey: 'action_fix',
      shortKey: 'action_fix_short',
      hintKey: 'action_fix_hint',
      icon: 'check',
      editable: true,
    },
    summarize_page: {
      labelKey: 'action_summarize_page',
      shortKey: 'action_summarize_page_short',
      hintKey: 'action_summarize_page_hint',
      icon: 'page',
      editable: false,
    },
    refine: {
      labelKey: 'action_refine',
      shortKey: 'action_refine_short',
      hintKey: 'action_refine_hint',
      icon: 'sparkles',
      editable: false,
    },
    refine_shorter: {
      labelKey: 'action_refine_shorter',
      shortKey: 'action_refine_shorter_short',
      hintKey: 'action_refine_shorter_hint',
      icon: 'list',
      editable: false,
    },
    refine_longer: {
      labelKey: 'action_refine_longer',
      shortKey: 'action_refine_longer_short',
      hintKey: 'action_refine_longer_hint',
      icon: 'sparkles',
      editable: false,
    },
    refine_formal: {
      labelKey: 'action_refine_formal',
      shortKey: 'action_refine_formal_short',
      hintKey: 'action_refine_formal_hint',
      icon: 'sparkles',
      editable: false,
    },
    refine_bullets: {
      labelKey: 'action_refine_bullets',
      shortKey: 'action_refine_bullets_short',
      hintKey: 'action_refine_bullets_hint',
      icon: 'list',
      editable: false,
    },
    refine_explain: {
      labelKey: 'action_refine_explain',
      shortKey: 'action_refine_explain_short',
      hintKey: 'action_refine_explain_hint',
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
