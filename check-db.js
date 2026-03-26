const Database = require('better-sqlite3');

try {
  const db1 = new Database('/home/huy/.config/ezprofile/profiles/0da3cf36-b51c-437d-ace0-3f95fd2eb316/Default/Cookies');
  const count1 = db1.prepare('SELECT count(*) as count FROM cookies').get();
  console.log('Profile 0da... has cookies:', count1.count);
  db1.close();
} catch (e) {
  console.log("Profile 0da... error:", e.message);
}

try {
  const db2 = new Database('/home/huy/.config/ezprofile/profiles/36286dc8-7933-44ff-8f87-40bb64612610/Default/Cookies');
  const count2 = db2.prepare('SELECT count(*) as count FROM cookies').get();
  console.log('Profile 362... has cookies:', count2.count);
  db2.close();
} catch (e) {
  console.log("Profile 362... error:", e.message);
}
