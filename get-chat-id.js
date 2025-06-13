// Helper script to get Lark chat IDs
// Run this to find your support group chat ID

require('dotenv').config();

async function getChatId() {
  try {
    // Get access token
    const tokenResponse = await fetch('https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        app_id: process.env.LARK_APP_ID,
        app_secret: process.env.LARK_APP_SECRET
      })
    });

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.tenant_access_token;

    // Get list of chats the bot is in
    const chatsResponse = await fetch('https://open.larksuite.com/open-apis/im/v1/chats', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    const chatsData = await chatsResponse.json();
    
    console.log('📋 Available chats:');
    console.log(JSON.stringify(chatsData, null, 2));
    
    if (chatsData.data && chatsData.data.items) {
      chatsData.data.items.forEach(chat => {
        console.log(`\n📱 Chat: ${chat.name || 'Unnamed'}`);
        console.log(`   ID: ${chat.chat_id}`);
        console.log(`   Type: ${chat.chat_type}`);
        console.log(`   Members: ${chat.member_count || 'Unknown'}`);
      });
    }

  } catch (error) {
    console.error('❌ Error getting chat IDs:', error);
  }
}

getChatId(); 