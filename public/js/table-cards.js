/* Mirrors each table's column headers onto its body cells as data-label, which is
   what lets the narrow-viewport rules in style.css render a row as a labelled card
   instead of something you have to pan sideways to read.

   This runs as an observer rather than being folded into the five renderers that
   build these tables. Every one of them replaces tbody.innerHTML wholesale — on
   filter, on status change, on trail expand — so a one-shot pass would be correct
   only until the first interaction, and the label is load-bearing on mobile: an
   unlabelled cell is an unreadable one. Keeping it here also means a new table
   inherits the behaviour by including this file, with nothing to remember. */
(function () {
  'use strict';

  // A header whose only text sits in .visually-hidden is a spacer for an actions
  // column — it names nothing the reader needs repeated on every card.
  function headerLabel(th) {
    const hidden = th.querySelector('.visually-hidden');
    if (hidden && th.textContent.trim() === hidden.textContent.trim()) return '';
    return th.textContent.trim();
  }

  function labelCells(table) {
    const headers = Array.from(table.querySelectorAll('thead th')).map(headerLabel);
    if (!headers.length) return;

    for (const row of table.querySelectorAll('tbody tr')) {
      let col = 0;
      for (const cell of row.children) {
        const span = cell.colSpan || 1;
        // A spanning cell is a full-width block (the trail panel, the empty state),
        // so it belongs to no single column and takes no label.
        if (span === 1 && headers[col]) cell.setAttribute('data-label', headers[col]);
        else cell.removeAttribute('data-label');

        // A cell holding the status/note/save group is flagged here rather than
        // matched with :has() in the stylesheet. The narrow-viewport layout depends
        // on it — an unflagged cell puts a select and a text field in an 84px column
        // — and this loop is already visiting every cell, so the flag costs nothing
        // and does not ride on a selector some older mobile browsers still miss.
        //
        // Only .row-update qualifies. An actions cell holds two short buttons that
        // fit the value column beside their label; giving those the full-width
        // treatment too put "No file" and "PDF" on their own line under a heading
        // and cost ~50px on every card for nothing.
        if (cell.querySelector('.row-update')) cell.setAttribute('data-cell', 'block');
        else cell.removeAttribute('data-cell');

        col += span;
      }
    }
  }

  function watch(table) {
    labelCells(table);
    const body = table.tBodies[0];
    if (!body) return;
    new MutationObserver(function () { labelCells(table); })
      .observe(body, { childList: true, subtree: true });
  }

  function init() {
    document.querySelectorAll('.table-wrap table').forEach(watch);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
