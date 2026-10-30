/**
 * CollectIQ -> "Payment Collection Scoring" live sync.
 *
 * Paste this whole file into the sheet: Extensions -> Apps Script, replace
 * Code.gs, Save. Then run setupSync() once (it asks for the sheet key and
 * Google's permission) and the tabs refresh every 10 minutes by themselves.
 * Menu "CollectIQ -> Sync now" refreshes on demand.
 *
 * Only the columns CollectIQ fills are rewritten on each sync. Put your own
 * formulas on a separate tab (rows are re-sorted every sync).
 */
var EXPORT_URL = 'https://oxriijxeiyfubyhbohim.supabase.co/functions/v1/sheet-export';
var SYNC_MINUTES = 10;

function onOpen() {
  SpreadsheetApp.getUi().createMenu('CollectIQ')
    .addItem('Sync now', 'syncCollectIQ')
    .addItem('Set up / change sheet key', 'setupSync')
    .addToUi();
}

function setupSync() {
  var ui = SpreadsheetApp.getUi();
  var res = ui.prompt('CollectIQ sheet key', 'Paste the sheet key you got for this sheet:', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  var key = res.getResponseText().trim();
  if (!key) return;
  PropertiesService.getScriptProperties().setProperty('SHEET_EXPORT_KEY', key);
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'syncCollectIQ') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('syncCollectIQ').timeBased().everyMinutes(SYNC_MINUTES).create();
  syncCollectIQ();
  ui.alert('Connected. The sheet now refreshes from CollectIQ every ' + SYNC_MINUTES + ' minutes.');
}

function syncCollectIQ() {
  var key = PropertiesService.getScriptProperties().getProperty('SHEET_EXPORT_KEY');
  if (!key) throw new Error('Run setupSync() first to save the sheet key.');
  var resp = UrlFetchApp.fetch(EXPORT_URL, { method: 'get', headers: { 'x-sheet-key': key }, muteHttpExceptions: true });
  if (resp.getResponseCode() !== 200) throw new Error('CollectIQ export failed (' + resp.getResponseCode() + '): ' + resp.getContentText().slice(0, 300));
  var out = JSON.parse(resp.getContentText());
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(out.tabs).forEach(function (name) {
    writeTab(ss, name, out.tabs[name].headers, out.tabs[name].rows);
  });
  writeTab(ss, 'Sync Info', ['Last sync', 'CollectIQ date', 'Score counts tasks planned from'],
    [[new Date(out.generatedAt), out.today, out.scoreFrom]]);
}

function writeTab(ss, name, headers, rows) {
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  var width = headers.length;
  var oldRows = Math.max(sh.getLastRow(), 1);
  sh.getRange(1, 1, oldRows, width).clearContent();
  var values = [headers].concat(rows.map(function (r) {
    return r.map(function (v) { return v === null || v === undefined ? '' : v; });
  }));
  if (sh.getMaxRows() < values.length) sh.insertRowsAfter(sh.getMaxRows(), values.length - sh.getMaxRows());
  if (sh.getMaxColumns() < width) sh.insertColumnsAfter(sh.getMaxColumns(), width - sh.getMaxColumns());
  sh.getRange(1, 1, values.length, width).setValues(values);
  sh.getRange(1, 1, 1, width).setFontWeight('bold');
  sh.setFrozenRows(1);
}
