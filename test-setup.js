#!/usr/bin/env node

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

class NgrokTestSetup {
  constructor() {
    this.ngrokUrl = null;
  }

  async checkNgrok() {
    return new Promise((resolve) => {
      exec('ngrok version', (error) => {
        resolve(!error);
      });
    });
  }

  async startNgrok(port = 3001) {
    return new Promise((resolve, reject) => {
      console.log(`🌐 Starting ngrok tunnel on port ${port}...`);
      
      const ngrokProcess = exec(`ngrok http ${port} --log=stdout`, (error, stdout, stderr) => {
        if (error) {
          reject(error);
        }
      });

      ngrokProcess.stdout.on('data', (data) => {
        const output = data.toString();
        
        // Look for the public URL
        const urlMatch = output.match(/https:\/\/[a-z0-9]+\.ngrok\.io/);
        if (urlMatch && !this.ngrokUrl) {
          this.ngrokUrl = urlMatch[0];
          console.log(`✅ Ngrok tunnel established: ${this.ngrokUrl}`);
          console.log(`📝 Webhook URL: ${this.ngrokUrl}/lark/events`);
          resolve(this.ngrokUrl);
        }
      });

      // Timeout after 10 seconds if URL not found
      setTimeout(() => {
        if (!this.ngrokUrl) {
          reject(new Error('Ngrok tunnel setup timeout'));
        }
      }, 10000);
    });
  }

  async setup() {
    console.log('🧪 PM-Next Lark Bot - Test Setup with Ngrok');
    console.log('============================================\n');

    try {
      // Check if ngrok is installed
      const ngrokInstalled = await this.checkNgrok();
      if (!ngrokInstalled) {
        console.log('❌ Ngrok not found. Please install ngrok first:');
        console.log('   npm install -g ngrok');
        console.log('   or download from: https://ngrok.com/download');
        process.exit(1);
      }

      console.log('✅ Ngrok found');

      // Check if .env exists
      const envPath = path.join(__dirname, '.env');
      if (!fs.existsSync(envPath)) {
        console.log('❌ .env file not found. Please run setup first:');
        console.log('   node setup.js');
        process.exit(1);
      }

      console.log('✅ Environment file found');

      // Load environment variables
      require('dotenv').config();
      const port = process.env.PORT || 3001;

      console.log(`\n🚀 Starting test environment on port ${port}...`);
      
      // Start the bot server in the background
      const serverProcess = exec('npm run dev', (error) => {
        if (error) {
          console.error('❌ Failed to start server:', error);
          process.exit(1);
        }
      });

      // Wait a moment for server to start
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Start ngrok tunnel
      const ngrokUrl = await this.startNgrok(port);

      console.log('\n🎉 Test environment ready!');
      console.log('\n📋 Next steps:');
      console.log('1. Go to Lark Developer Console: https://open.larksuite.com/');
      console.log('2. Navigate to your app → Features → Event Subscriptions');
      console.log(`3. Set Request URL to: ${ngrokUrl}/lark/events`);
      console.log('4. Test the webhook by sending a message to your bot');
      console.log('\n🔍 Monitoring:');
      console.log(`   - Health check: ${ngrokUrl}/health`);
      console.log('   - Server logs: Check the console output');
      console.log('\n💡 Tips:');
      console.log('   - Keep this terminal open to maintain the tunnel');
      console.log('   - Use Ctrl+C to stop both server and tunnel');
      console.log('   - Test with direct messages or @mentions in Lark');

      // Handle graceful shutdown
      process.on('SIGINT', () => {
        console.log('\n🛑 Shutting down test environment...');
        serverProcess.kill();
        process.exit(0);
      });

    } catch (error) {
      console.error('❌ Setup failed:', error.message);
      process.exit(1);
    }
  }
}

// Quick test function
async function quickTest() {
  const ngrokSetup = new NgrokTestSetup();
  await ngrokSetup.setup();
}

if (require.main === module) {
  quickTest();
}

module.exports = NgrokTestSetup; 