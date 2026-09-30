const fs = require('fs');

// Mock browser environment
global.window = global;
global.window.addEventListener = function() {};
global.localStorage = {
  _data: {},
  getItem(k) { return this._data[k] || null; },
  setItem(k, v) { this._data[k] = String(v); },
  removeItem(k) { delete this._data[k]; }
};
global.document = {
  getElementById(id) { return { value: '', textContent: '', innerHTML: '', style: {}, dataset: {}, addEventListener() {}, querySelectorAll() { return []; } }; },
  querySelector(sel) { return null; },
  querySelectorAll(sel) { return []; },
  createElement(tag) { return { appendChild() {}, style: {}, addEventListener() {}, querySelectorAll() { return []; } }; },
  head: { appendChild() {} },
  addEventListener() {}
};
global.navigator = { userAgent: 'Node' };
global.today = new Date();
global.toast = function(msg) { console.log('TOAST:', msg); };
global.saveCloud = async function() {};
global.saveAllMarkasCloud = async function() {};
global.closeModal = function() {};
global.renderAll = function() {};
global.switchView = function() {};

// Load app.js
const appCode = fs.readFileSync('app.js', 'utf-8');
eval(appCode);

console.log('Initial markas count:', window.markas.length);

// Sample rows from user's Excel image
const sampleGrid = [
  ["Book", "Party", "Marka/Grou\np", "Bill Date", "Bill No", "TO DAYS", "Days", "Gross Amt", "Taxable\nAmt", "Bill Amt", "Dr Amt", "Cr Amt", "Part", "Paid", "Balance", "Acc +\nAddress", "Agent", "Master", "Collection\nPerson", "Month", "PolicyDa\nte", "PolicyNam\ne"],
  ["JOB BILLING", "ANNAPURNA", "SAN", "21/07/26", "14674", "dd/MM/yyyy", "71", "21022.65", "20391.87", "21412.00", "0.00", "0.00", "0.00", "0.00", "21412.00", "ANNAPURNA", "", "KALPESHMAS", "", "July", "01/10/26", "3% PARTY"],
  ["JOB BILLING", "ANNAPURNA", "SAN", "21/08/26", "20003", "dd/MM/yyyy", "40", "21022.65", "20391.87", "21412.00", "0.00", "0.00", "0.00", "0.00", "21412.00", "ANNAPURNA", "", "KALPESHMAS", "", "August", "01/11/26", "3% PARTY"],
  ["JOB BILLING", "ANNAPURNA", "SAN", "21/08/26", "20185", "dd/MM/yyyy", "40", "22585.05", "21907.50", "23003.00", "0.00", "0.00", "0.00", "0.00", "23003.00", "ANNAPURNA", "", "KALPESHMAS", "", "August", "01/11/26", "3% PARTY"],
  ["JOB BILLING", "ANNAPURNA", "SAN", "21/08/26", "20186", "dd/MM/yyyy", "40", "10192.80", "9887.02", "10381.00", "0.00", "0.00", "0.00", "0.00", "10381.00", "ANNAPURNA", "", "KALPESHMAS", "", "August", "01/11/26", "3% PARTY"],
  ["JOB BILLING", "ANNAPURNA", "SAN", "02/09/26", "22352", "dd/MM/yyyy", "28", "23813.60", "23099.18", "24254.00", "0.00", "0.00", "0.00", "0.00", "24254.00", "ANNAPURNA", "", "KALPESHMAS", "", "September", "16/11/26", "3% PARTY"],
  ["JOB BILLING", "ANNAPURNA", "SAN", "02/09/26", "22353", "dd/MM/yyyy", "28", "24390.40", "23658.68", "24842.00", "0.00", "0.00", "0.00", "0.00", "24842.00", "ANNAPURNA", "", "KALPESHMAS", "", "September", "16/11/26", "3% PARTY"],
  ["JOB BILLING", "ANNAPURNA", "SAN", "02/09/26", "22354", "dd/MM/yyyy", "28", "12020.10", "11659.50", "12242.00", "0.00", "0.00", "0.00", "0.00", "12242.00", "ANNAPURNA", "", "KALPESHMAS", "", "September", "16/11/26", "3% PARTY"],
  ["JOB BILLING", "ANNAPURNA", "SAN", "05/09/26", "22765", "dd/MM/yyyy", "25", "24071.10", "23348.97", "24516.00", "0.00", "0.00", "0.00", "0.00", "24516.00", "ANNAPURNA", "", "KALPESHMAS", "", "September", "16/11/26", "3% PARTY"],
  ["JOB BILLING", "ANNAPURNA", "SAN", "08/09/26", "23359", "dd/MM/yyyy", "22", "11711.10", "11359.77", "11928.00", "0.00", "0.00", "0.00", "0.00", "11928.00", "ANNAPURNA", "", "KALPESHMAS", "", "September", "16/11/26", "3% PARTY"]
];

window.processImportedRows(sampleGrid, 'test_excel.xlsx');

const sanMarka = window.markas.find(m => m.marka === 'SAN');
console.log('SAN Marka found:', sanMarka ? 'YES' : 'NO');
if (sanMarka) {
  console.log('SAN Bills count:', sanMarka.bills.length);
  console.log('SAN Total Outstanding:', window.totalOutstanding(sanMarka));
  console.log('SAN Bills details:', JSON.stringify(sanMarka.bills, null, 2));
}
