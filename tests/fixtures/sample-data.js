// FX-1: the 20-row sample sheet (transcribed from the screenshot).
const HEADER = [
  'Id', 'Start time', 'Completion time', 'Email', 'Name', 'Full Name', 'Microsoft Alias / Email', 'Location / Site', 'Team / Org',
  'Cause(s) / NGO(s) you donated to',
  'Donated to other cause(s)? List them here — you can add more than one (one per line)',
  'How many tickets are you registering for? (1 ticket = ₹250 donated. e.g. ₹250 = 1, ₹500 = 2, ₹750 = 3)',
  'Preferred contact for game-day link', 'I confirm my donation was made voluntarily on the GIVE portal'
];

// [email, Name, Full Name, donated-to-other text, ticket count, confirm]
const ROWS = [
  ['participant1@example.com', 'Asha Rao', 'Asha Rao', 'Supporting Education for Children for a Better Future', '', 'Yes'],
  ['participant2@example.com', 'Divya Kulkarni', 'Divya', '', '', 'Yes'],
  ['participant3@example.com', 'Isha Menon', 'Isha Menon', 'CRY- Child Rights and You', '', 'Yes'],
  ['participant4@example.com', 'Nisha V P', 'Nisha V P', '', '', 'Yes'],
  ['participant5@example.com', 'Kabir Malhotra', 'Kabir Malhotra', '', '', 'Yes'],
  ['participant6@example.com', 'Meera Raghavan Iyer', 'Meera Raghavan Iyer', '', '', 'Yes'],
  ['participant7@example.com', 'Ananya Shah', 'Ananya shah', '', '', 'Yes'],
  ['participant8@example.com', 'Rohan Desai', 'Rohan Desai', '', '', 'Yes'],
  ['participant9@example.com', 'Lakshmi Pillai', 'Lakshmi Pillai', '', '', 'Yes'],
  ['participant10@example.com', 'Tara Bhatt', 'Tara M Bhatt', '', '', 'Yes'],
  ['participant11@example.com', 'Arjun Nair', 'Arjun Govind Nair', 'Save the Children, Bal Raksha Bharat Rs. 2000 (8 tickets)', '', 'Yes'],
  ['participant12@example.com', 'Aman Chauhan', 'Aman Chauhan', '', '', 'Yes'],
  ['participant13@example.com', 'Sneha Reddy', 'Sneha Reddy', '', '', 'Yes'],
  ['participant14@example.com', 'VIKRAM SETH', 'Vikram Seth', '', '', 'Yes'],
  ['participant14@example.com', 'VIKRAM SETH', 'Vikram Seth', '', 2, 'Yes'],
  ['participant15@example.com', 'Rohit Bansal', 'Rohit Bansal', '', 4, 'Yes'],
  ['participant16@example.com', 'Karan Joshi', 'Karan Joshi', '', 2, 'Yes'],
  ['participant17@example.com', 'Yash Kapoor', 'Yash Kapoor', '', 1, 'No'],
  ['participant7@example.com', 'Ananya Shah', 'Ananya shah', '', 1, 'Yes'],
  ['participant18@example.com', 'Ritu Sharma', 'Ritu Sharma', '', 2, 'Yes']
];

// Builds an array-of-arrays shaped like the real sheet (header + data rows).
function sampleAoa() {
  const aoa = [HEADER];
  ROWS.forEach((r, i) => {
    aoa.push([i + 1, '10/8/2026', '10/8/2026', r[0], r[1], r[2], r[0], 'Noida', 'Team', '', r[3], r[4], 'Teams', r[5]]);
  });
  return aoa;
}

// Smaller helper for focused tests: headers Name, Email, count, donated, confirm.
const SHORT_HEADER = [
  'Name', 'Email',
  'How many tickets are you registering for? (1 ticket = ₹250 donated)',
  'Donated to other cause(s)? List them here',
  'I confirm my donation was made voluntarily'
];
function shortAoa(rows) { return [SHORT_HEADER].concat(rows); }

module.exports = { HEADER, ROWS, sampleAoa, SHORT_HEADER, shortAoa };
