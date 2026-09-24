"""JavaScript that runs inside the portal page (fast DOM inspection)."""

# Shared helpers injected into every in-page script.
#
# The key idea is the "item": the row/card/list entry that holds the mess
# name. We start at the element with the name and climb up until we reach an
# element that has look-alike siblings (the other messes in the same list).
# Anything clickable INSIDE that item belongs to our mess; buttons outside it
# (another mess's "Book", a page-level "Submit") are never mistaken for it.
COMMON_JS = r"""
  const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const target = norm(args.messName);
  const isVisible = el => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0';
  };
  const labelOf = el => (el.innerText || el.value || el.getAttribute('aria-label') || '').trim();
  const hasWord = (text, words) => {
    const t = norm(text);
    return words.map(norm).some(w => w && (t === w || t.startsWith(w) || t.endsWith(w)));
  };
  const isDisabled = el => !!(el.disabled || el.getAttribute('aria-disabled') === 'true' ||
                              el.closest('fieldset[disabled]') || /(^|\s)disabled(\s|$)/i.test(el.className || ''));
  const signature = el => el.tagName + '.' + [...el.classList].filter(c => !/active|selected|checked/i.test(c)).sort().join('.');

  // Smallest visible elements whose text contains the mess name.
  const nameElements = () => {
    const out = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const seen = new Set();
    while (walker.nextNode()) {
      const node = walker.currentNode;
      let el = node.parentElement;
      // The name may be split across tags (<b>Sagar</b>foods): climb a little.
      for (let i = 0; el && i < 4 && !norm(el.innerText).includes(target); i++) el = el.parentElement;
      if (!el || seen.has(el) || !norm(el.innerText).includes(target) || !isVisible(el)) continue;
      if (['SCRIPT', 'STYLE', 'OPTION', 'TITLE'].includes(el.tagName)) continue;
      seen.add(el);
      out.push(el);
    }
    // keep only the innermost ones
    return out.filter(a => !out.some(b => b !== a && a.contains(b)));
  };

  // Climb from the name to the list item that represents this mess.
  // Items found as one entry of a repeated list are remembered in listItems:
  // those are trustworthy. Anything else (e.g. a "Your current mess: X"
  // heading) is only used when the page has no list at all.
  const listItems = new WeakSet();
  const itemOf = nameEl => {
    let el = nameEl;
    for (let depth = 0; depth < 8 && el.parentElement && el.parentElement !== document.body; depth++) {
      const sig = signature(el);
      const twins = [...el.parentElement.children].filter(c => c !== el && signature(c) === sig && norm(c.innerText).length > 0);
      if (twins.length > 0 && depth > 0) { listItems.add(el); return el; }
      if (el.matches('tr, li, label, [role=row], [role=listitem], [role=option], [role=radio], mat-card, ion-item')) {
        listItems.add(el); return el;
      }
      el = el.parentElement;
    }
    return el;
  };

  // Among candidates inside `item`, keep the one that sits closest to the
  // name (deepest common ancestor). If several tie, it's ambiguous: none.
  const depthOf = el => { let d = 0; while (el) { d++; el = el.parentElement; } return d; };
  const commonAncestor = (a, b) => { while (a && !a.contains(b)) a = a.parentElement; return a; };
  const closest = (nameEl, cands) => {
    if (cands.length <= 1) return cands[0] || null;
    const scored = cands.map(c => ({ c, d: depthOf(commonAncestor(nameEl, c)) }));
    const best = Math.max(...scored.map(x => x.d));
    const top = scored.filter(x => x.d === best);
    return top.length === 1 ? top[0].c : null;
  };

  const inAnyItem = (btn, items) => items.some(it => it.contains(btn) || btn.contains(it));
"""

# Finds the control that belongs to the mess we want. Works for the common
# layouts: a card/row per mess with its own button, a radio list + Submit,
# a <select> dropdown, or a clickable card. Marks the element with
# data-messbot="target" so Python can click it with a real mouse click.
FIND_TARGET_JS = r"""
(args) => {
""" + COMMON_JS + r"""
  document.querySelectorAll('[data-messbot]').forEach(e => e.removeAttribute('data-messbot'));
  const bodyText = norm(document.body ? document.body.innerText : '');

  // 1) <select> dropdowns
  for (const sel of document.querySelectorAll('select')) {
    for (const opt of sel.options) {
      if (norm(opt.textContent).includes(target)) {
        sel.setAttribute('data-messbot', 'target');
        return { found: true, kind: 'select', value: opt.value, label: opt.textContent.trim(),
                 disabled: sel.disabled || opt.disabled };
      }
    }
  }
  if (!bodyText.includes(target)) return { found: false, reason: 'name-not-on-page' };

  const names = nameElements();
  if (!names.length) return { found: false, reason: 'name-not-visible' };

  const BUTTONS = 'button, input[type=button], input[type=submit], [role=button], a';
  const CHOICES = 'input[type=radio], input[type=checkbox], [role=radio], [role=checkbox], [role=option], label';
  const mark = (el, kind, item) => {
    // Hidden radio/checkbox (custom styled)? Click its label instead.
    if (el.matches('input') && !isVisible(el)) {
      const lab = (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) || el.closest('label');
      if (lab && isVisible(lab)) el = lab;
    }
    el.setAttribute('data-messbot', 'target');
    return { found: true, kind, label: labelOf(el).replace(/\s+/g, ' ').slice(0, 80), disabled: isDisabled(el),
             itemText: (item || el).innerText.replace(/\s+/g, ' ').slice(0, 240) };
  };

  const pairs = names.map(n => ({ nameEl: n, item: itemOf(n) }));
  const inLists = pairs.filter(p => listItems.has(p.item));
  for (const { nameEl, item } of (inLists.length ? inLists : pairs)) {
    // a) A "Book/Select/Opt" button inside this mess's card/row
    const actions = [...item.querySelectorAll(BUTTONS)].filter(isVisible)
      .filter(b => hasWord(labelOf(b), args.actionWords) && !hasWord(labelOf(b), args.avoidWords));
    const enabledActions = actions.filter(b => !isDisabled(b));
    const action = closest(nameEl, enabledActions.length ? enabledActions : actions);
    if (action) return mark(action, 'action', item);
    if (actions.length) continue;  // ambiguous: several buttons, none clearly ours
    // b) A radio/checkbox/label for this mess
    const choice = item.matches(CHOICES) ? item : closest(nameEl, [...item.querySelectorAll(CHOICES)]);
    if (choice) return mark(choice, 'choice', item);
    // c) The card itself is clickable (or sits inside a clickable wrapper)
    const wrapper = nameEl.closest('a, button, [role=button], [role=option], [onclick], label');
    if (wrapper && !hasWord(labelOf(wrapper), args.avoidWords)) return mark(wrapper, 'choice', item);
  }
  // d) Fallback: a card that looks clickable (pointer cursor), e.g. a React div with onClick
  for (const { nameEl, item } of (inLists.length ? inLists : pairs)) {
    if ([nameEl, item].some(e => getComputedStyle(e).cursor === 'pointer')) return mark(item, 'choice', item);
  }
  return { found: false, reason: 'no-button-for-it-yet' };
}
"""

# After the first click, finds the next "Submit/Confirm/Yes" button to press.
# Only picks buttons inside a popup, buttons inside our mess's own card/row,
# or a page-level button that belongs to NO mess card. So it can never book
# a different mess by mistake.
FIND_NEXT_STEP_JS = r"""
(args) => {
""" + COMMON_JS + r"""
  const alreadyClicked = new Set(args.clicked);
  document.querySelectorAll('[data-messbot-next]').forEach(e => e.removeAttribute('data-messbot-next'));
  const DIALOG = '[role=dialog], [role=alertdialog], [aria-modal=true], .modal, .modal-dialog, .swal2-popup, ' +
                 '.swal-modal, .MuiDialog-root, .ant-modal, .ant-popover, .cdk-overlay-pane, .mat-dialog-container, ' +
                 'ion-alert, ion-modal, .v-dialog, .popup, [class*="Dialog"], [class*="dialog"], [class*="modal"]';

  // All mess cards on the page = look-alike siblings of our card.
  let ours = nameElements().map(itemOf);
  if (ours.some(it => listItems.has(it))) ours = ours.filter(it => listItems.has(it));
  const allItems = [];
  for (const it of ours) {
    allItems.push(it);
    if (it.parentElement) for (const c of it.parentElement.children) if (c !== it && signature(c) === signature(it)) allItems.push(c);
  }

  const buttons = [...document.querySelectorAll('button, input[type=submit], input[type=button], [role=button], a.btn, a.button')]
    .filter(isVisible).filter(b => !isDisabled(b));
  const candidates = [];
  for (const b of buttons) {
    const text = labelOf(b);
    if (!text || hasWord(text, args.avoidWords) || !hasWord(text, args.confirmWords)) continue;
    const key = norm(text) + '|' + Math.round(b.getBoundingClientRect().top);
    if (alreadyClicked.has(key)) continue;
    if (b.getAttribute('data-messbot') === 'target') continue;  // our first click, don't repeat it
    const inDialog = !!b.closest(DIALOG);
    const inOurItem = inAnyItem(b, ours);
    const inOtherItem = !inOurItem && inAnyItem(b, allItems);
    candidates.push({ b, text, key, inDialog, inOurItem, inOtherItem });
  }
  const pick = candidates.find(c => c.inDialog) ||
               candidates.find(c => c.inOurItem) ||
               candidates.find(c => !c.inOtherItem);
  if (!pick) return { found: false };
  pick.b.setAttribute('data-messbot-next', 'yes');
  return { found: true, label: pick.text.replace(/\s+/g, ' ').slice(0, 60), key: pick.key, inDialog: pick.inDialog };
}
"""

PAGE_SUMMARY_JS = r"""
() => {
  const vis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const t = el => (el.innerText || el.value || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 80);
  return {
    title: document.title,
    url: location.href,
    buttons: [...document.querySelectorAll('button, [role=button], input[type=submit], input[type=button], a.btn')].filter(vis).map(t).filter(Boolean),
    radios: [...document.querySelectorAll('input[type=radio], [role=radio]')].map(r => (r.closest('label') ? t(r.closest('label')) : r.value || r.id)).slice(0, 40),
    selects: [...document.querySelectorAll('select')].map(s => [...s.options].map(o => o.textContent.trim())),
    text: (document.body ? document.body.innerText : '').slice(0, 6000),
  };
}
"""
