import {defineConfig} from '@playwright/test';
export default defineConfig({
  testDir:'tests',testMatch:'ui.spec.mjs',fullyParallel:false,workers:1,
  use:{baseURL:'http://127.0.0.1:4173',viewport:{width:1360,height:1080},
    launchOptions:{executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']},
    screenshot:'only-on-failure'},
  webServer:{command:'node scripts/serve.mjs',url:'http://127.0.0.1:4173',reuseExistingServer:!process.env.CI}
});
