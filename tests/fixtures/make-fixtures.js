// Generates sample input files under tests/fixtures/out (run: node tests/fixtures/make-fixtures.js).
const fs = require('fs');
const path = require('path');
const XLSX = require('../../lib/xlsx.full.min.js');
const { sampleAoa, shortAoa } = require('./sample-data.js');

const out = path.join(__dirname, 'out');
fs.mkdirSync(out, { recursive: true });

function writeXlsx(name, sheets) {
  const wb = XLSX.utils.book_new();
  Object.entries(sheets).forEach(([n, aoa]) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), n));
  fs.writeFileSync(path.join(out, name), XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}

writeXlsx('sample.xlsx', { Responses: sampleAoa() });
fs.writeFileSync(path.join(out, 'sample.csv'), '\uFEFF' + XLSX.utils.sheet_to_csv(XLSX.utils.aoa_to_sheet(sampleAoa())));

writeXlsx('edge-counts.xlsx', {
  Sheet1: shortAoa([
    ['Zero', 'z@x', '0', '', ''], ['Neg', 'n@x', -1, '', ''], ['Dec', 'd@x', 2.5, '', ''], ['Txt', 't@x', '3 tickets', '', ''],
    ['Word', 'w@x', 'two', '', ''], ['Space', 's@x', ' 4 ', '', ''], ['Exp', 'e@x', '1e1', '', ''], ['Big', 'b@x', 60, '', ''],
    ['Both', 'both@x', 2, '(3 tickets)', ''], ['Amount', 'am@x', '', 'Rs. 2000', ''], ['Text8', 't8@x', '', 'Rs. 2000 (8 tickets)', 'No']
  ])
});

writeXlsx('names.xlsx', {
  Sheet1: shortAoa([
    ['Ananya Iyer', 'a1@x', 1, '', ''], ['अनुराग', 'a2@x', 1, '', ''], ['Zoë', 'a3@x', 2, '', ''],
    ['A very long name '.repeat(7).trim(), 'a4@x', 1, '', ''], ['  Spaced    Out  ', 'a5@x', 1, '', ''],
    ['A/B:C*D?', 'a6@x', 1, '', ''], ['Same Name', 's1@x', 1, '', ''], ['Same Name', 's2@x', 2, '', ''],
    ['<img src=x onerror=alert(1)>', 'x1@x', 1, '', ''], ['=HYPERLINK("http://x")', 'x2@x', 1, '', '']
  ])
});

writeXlsx('no-name-col.xlsx', { Sheet1: [['Full Name', 'Email'], ['A', 'a@x']] });
writeXlsx('multi-sheet.xlsx', { Empty: [[]], Data: shortAoa([['Multi Sheet', 'm@x', 2, '', '']]) });
writeXlsx('empty.xlsx', { Sheet1: [['Name', 'Email']] });
fs.writeFileSync(path.join(out, 'corrupt.xlsx'), 'this is not a real workbook \u0000\u0001');
fs.writeFileSync(path.join(out, 'notes.txt'), 'hello');

const big = [];
for (let i = 1; i <= 1000; i++) big.push(['Person ' + i, 'p' + i + '@x', (i % 5) + 1, '', '']);
writeXlsx('large.xlsx', { Sheet1: shortAoa(big) });

console.log('Fixtures written to ' + out);
