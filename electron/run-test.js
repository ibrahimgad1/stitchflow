const cp = require('child_process');
const path = require('path');
const target = path.join(__dirname, 'dist/package/win-unpacked/Clothing Factory Management.exe');

console.log("Launching standard async GUI process:", target);
const child = cp.spawn(target, [], {
  env: { 
    ...process.env, 
    NODE_ENV: 'production' 
  }
});

child.on('close', (code) => {
  console.log(`Child process exited with code ${code}`);
});

// Automatically kill after 8 seconds to complete verification
setTimeout(() => {
  console.log("Verification complete. Killing process...");
  child.kill();
  process.exit(0);
}, 8000);
