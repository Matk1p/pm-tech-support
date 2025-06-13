#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { generateKnowledgeBase } = require('./knowledge-extractor');

class LarkBotSetup {
  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  async question(prompt) {
    return new Promise((resolve) => {
      this.rl.question(prompt, resolve);
    });
  }

  async setup() {
    console.log('🤖 PM-Next Lark Bot Setup');
    console.log('==========================\n');

    try {
      // Check if .env already exists
      const envPath = path.join(__dirname, '.env');
      if (fs.existsSync(envPath)) {
        const overwrite = await this.question('❓ .env file already exists. Overwrite? (y/N): ');
        if (overwrite.toLowerCase() !== 'y') {
          console.log('Setup cancelled.');
          this.rl.close();
          return;
        }
      }

      console.log('📝 Please provide your Lark app credentials:\n');
      
      // Collect Lark credentials
      const appId = await this.question('🔑 Lark App ID: ');
      const appSecret = await this.question('🔐 Lark App Secret: ');
      const verificationToken = await this.question('🎫 Verification Token: ');
      const encryptKey = await this.question('🔒 Encrypt Key (optional): ');

      console.log('\n📝 Please provide your OpenAI credentials:\n');
      
      // Collect OpenAI credentials
      const openaiKey = await this.question('🤖 OpenAI API Key: ');
      const openaiModel = await this.question('🧠 OpenAI Model (default: gpt-4): ') || 'gpt-4';

      console.log('\n📝 Server configuration:\n');
      
      // Server configuration
      const port = await this.question('🌐 Port (default: 3001): ') || '3001';
      const appUrl = await this.question('🔗 Your app URL (for reference): ') || 'https://your-app-url.com';

      // Generate .env file
      const envContent = this.generateEnvFile({
        appId,
        appSecret,
        verificationToken,
        encryptKey,
        openaiKey,
        openaiModel,
        port,
        appUrl
      });

      fs.writeFileSync(envPath, envContent);
      console.log('\n✅ .env file created successfully!');

      // Generate knowledge base
      console.log('\n📚 Generating knowledge base from documentation...');
      try {
        await generateKnowledgeBase();
        console.log('✅ Knowledge base generated!');
      } catch (error) {
        console.log('⚠️  Using default knowledge base');
      }

      // Create start script
      this.createStartScript();

      console.log('\n🎉 Setup complete!');
      console.log('\nNext steps:');
      console.log('1. Configure your Lark app webhook URL: https://your-domain.com/lark/events');
      console.log('2. Install dependencies: npm install');
      console.log('3. Start the bot: npm start');
      console.log('4. Test the health endpoint: curl http://localhost:' + port + '/health');

    } catch (error) {
      console.error('❌ Setup failed:', error);
    } finally {
      this.rl.close();
    }
  }

  generateEnvFile(config) {
    return `# Lark Bot Configuration
LARK_APP_ID=${config.appId}
LARK_APP_SECRET=${config.appSecret}
LARK_VERIFICATION_TOKEN=${config.verificationToken}
${config.encryptKey ? `LARK_ENCRYPT_KEY=${config.encryptKey}` : '# LARK_ENCRYPT_KEY=your_encrypt_key'}

# OpenAI Configuration
OPENAI_API_KEY=${config.openaiKey}
OPENAI_MODEL=${config.openaiModel}

# Server Configuration
PORT=${config.port}
NODE_ENV=development

# Application Information
APP_NAME=PM-Next Recruitment Management System
APP_URL=${config.appUrl}

# Generated on ${new Date().toISOString()}
`;
  }

  createStartScript() {
    const startScriptContent = `#!/bin/bash

echo "🤖 Starting PM-Next Lark Bot..."

# Check if .env exists
if [ ! -f .env ]; then
    echo "❌ .env file not found. Please run 'node setup.js' first."
    exit 1
fi

# Check if node_modules exists
if [ ! -d node_modules ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Start the bot
echo "🚀 Launching bot server..."
npm start
`;

    const scriptPath = path.join(__dirname, 'start.sh');
    fs.writeFileSync(scriptPath, startScriptContent);
    
    // Make it executable on Unix systems
    try {
      fs.chmodSync(scriptPath, '755');
      console.log('✅ Start script created: ./start.sh');
    } catch (error) {
      console.log('✅ Start script created: ./start.sh (use: bash start.sh)');
    }
  }
}

// Validate environment function
function validateEnvironment() {
  const requiredVars = [
    'LARK_APP_ID',
    'LARK_APP_SECRET',
    'LARK_VERIFICATION_TOKEN',
    'OPENAI_API_KEY'
  ];

  const missing = requiredVars.filter(varName => !process.env[varName]);
  
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:');
    missing.forEach(varName => console.error(`   - ${varName}`));
    console.error('\nPlease run: node setup.js');
    process.exit(1);
  }

  console.log('✅ Environment validation passed');
}

// Run setup if called directly
if (require.main === module) {
  const setup = new LarkBotSetup();
  setup.setup();
}

module.exports = { LarkBotSetup, validateEnvironment }; 