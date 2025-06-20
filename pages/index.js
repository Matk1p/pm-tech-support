import Head from 'next/head';
import { useState, useEffect } from 'react';

export default function Home() {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const response = await fetch('/api/lark/events');
        const data = await response.json();
        setHealth(data);
      } catch (error) {
        setHealth({ 
          status: 'error', 
          error: error.message,
          timestamp: new Date().toISOString()
        });
      } finally {
        setLoading(false);
      }
    };

    checkHealth();
  }, []);

  return (
    <>
      <Head>
        <title>PM-Next Support Bot - Status Dashboard</title>
        <meta name="description" content="AI-powered support bot for PM-Next platform" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main style={{ 
        fontFamily: 'system-ui, -apple-system, sans-serif',
        lineHeight: 1.6,
        maxWidth: '800px',
        margin: '0 auto',
        padding: '20px',
        color: '#333'
      }}>
        <header style={{ 
          textAlign: 'center', 
          marginBottom: '40px',
          borderBottom: '2px solid #eee',
          paddingBottom: '20px'
        }}>
          <h1 style={{ 
            color: '#2563eb', 
            fontSize: '2.5rem',
            margin: '0 0 10px 0'
          }}>
            🤖 PM-Next Support Bot
          </h1>
          <p style={{ 
            fontSize: '1.2rem', 
            color: '#666',
            margin: 0
          }}>
            AI-Powered Support System for PM-Next Platform
          </p>
        </header>

        <div style={{ 
          display: 'grid', 
          gap: '20px',
          marginBottom: '30px'
        }}>
          {/* System Status */}
          <div style={{
            background: loading ? '#f8f9fa' : health?.status === 'ok' ? '#d4edda' : '#f8d7da',
            border: `1px solid ${loading ? '#dee2e6' : health?.status === 'ok' ? '#c3e6cb' : '#f5c6cb'}`,
            borderRadius: '8px',
            padding: '20px'
          }}>
            <h2 style={{ 
              margin: '0 0 15px 0',
              color: loading ? '#6c757d' : health?.status === 'ok' ? '#155724' : '#721c24'
            }}>
              🔧 System Status
            </h2>
            
            {loading ? (
              <p>⏳ Checking system status...</p>
            ) : health?.status === 'ok' ? (
              <div>
                <p style={{ margin: '5px 0' }}>
                  <strong>✅ Status:</strong> System Online
                </p>
                <p style={{ margin: '5px 0' }}>
                  <strong>🔗 Webhook:</strong> Active
                </p>
                <p style={{ margin: '5px 0' }}>
                  <strong>⏰ Last Check:</strong> {new Date(health.timestamp).toLocaleString()}
                </p>
                <p style={{ margin: '5px 0' }}>
                  <strong>🤖 Lark Client:</strong> {health.larkClient || 'Unknown'}
                </p>
              </div>
            ) : (
              <div>
                <p style={{ margin: '5px 0' }}>
                  <strong>❌ Status:</strong> Error Detected
                </p>
                <p style={{ margin: '5px 0' }}>
                  <strong>🔍 Error:</strong> {health?.error || 'Unknown error'}
                </p>
                <p style={{ margin: '5px 0' }}>
                  <strong>⏰ Timestamp:</strong> {health?.timestamp ? new Date(health.timestamp).toLocaleString() : 'Unknown'}
                </p>
              </div>
            )}
          </div>

          {/* Environment Check */}
          {health?.environmentCheck && (
            <div style={{
              background: '#e7f3ff',
              border: '1px solid #b8daff',
              borderRadius: '8px',
              padding: '20px'
            }}>
              <h2 style={{ margin: '0 0 15px 0', color: '#004085' }}>
                🔐 Environment Configuration
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
                <p style={{ margin: '5px 0' }}>
                  <strong>Lark App ID:</strong> {health.environmentCheck.hasLarkAppId ? '✅' : '❌'}
                </p>
                <p style={{ margin: '5px 0' }}>
                  <strong>Lark Secret:</strong> {health.environmentCheck.hasLarkAppSecret ? '✅' : '❌'}
                </p>
                <p style={{ margin: '5px 0' }}>
                  <strong>OpenAI Key:</strong> {health.environmentCheck.hasOpenAIKey ? '✅' : '❌'}
                </p>
                <p style={{ margin: '5px 0' }}>
                  <strong>Supabase URL:</strong> {health.environmentCheck.hasSupabaseUrl ? '✅' : '❌'}
                </p>
                <p style={{ margin: '5px 0' }}>
                  <strong>Supabase Key:</strong> {health.environmentCheck.hasSupabaseKey ? '✅' : '❌'}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Features Section */}
        <section style={{
          background: '#f8f9fa',
          border: '1px solid #dee2e6',
          borderRadius: '8px',
          padding: '20px',
          marginBottom: '30px'
        }}>
          <h2 style={{ margin: '0 0 20px 0', color: '#495057' }}>
            🌟 Bot Features
          </h2>
          <ul style={{ 
            listStyle: 'none', 
            padding: 0,
            margin: 0,
            display: 'grid',
            gap: '10px'
          }}>
            <li><strong>AI-Powered Support:</strong> Intelligent responses using OpenAI GPT models</li>
            <li><strong>FAQ System:</strong> Pre-built answers for common PM-Next questions</li>
            <li><strong>Support Tickets:</strong> Automatic escalation for complex issues</li>
            <li><strong>Knowledge Base:</strong> Comprehensive PM-Next platform guidance</li>
            <li><strong>Real-time Processing:</strong> Immediate responses with background processing</li>
          </ul>
        </section>

        {/* API Endpoints */}
                 <section style={{
           background: '#fff3cd',
           border: '1px solid #ffeaa7',
           borderRadius: '8px',
           padding: '20px',
           marginBottom: '30px'
         }}>
          <h2 style={{ margin: '0 0 20px 0', color: '#856404' }}>
            🔗 API Endpoints
          </h2>
          <div style={{ display: 'grid', gap: '15px' }}>
            <div>
              <h3 style={{ margin: '0 0 5px 0', color: '#856404' }}>Webhook Handler</h3>
              <code style={{
                background: '#f8f9fa',
                padding: '8px 12px',
                borderRadius: '4px',
                display: 'block',
                fontSize: '14px'
              }}>
                POST /api/lark/events
              </code>
              <p style={{ margin: '5px 0 0 0', fontSize: '14px', color: '#666' }}>
                Handles all Lark webhook events and bot interactions
              </p>
            </div>
            
            <div>
              <h3 style={{ margin: '0 0 5px 0', color: '#856404' }}>Health Check</h3>
              <code style={{
                background: '#f8f9fa',
                padding: '8px 12px',
                borderRadius: '4px',
                display: 'block',
                fontSize: '14px'
              }}>
                GET /api/lark/events
              </code>
              <p style={{ margin: '5px 0 0 0', fontSize: '14px', color: '#666' }}>
                Returns system status and configuration validation
              </p>
            </div>
          </div>
        </section>

        {/* PM-Next Modules */}
        <section style={{
          background: '#d1ecf1',
          border: '1px solid #bee5eb',
          borderRadius: '8px',
          padding: '20px'
        }}>
          <h2 style={{ margin: '0 0 20px 0', color: '#0c5460' }}>
            📚 Supported PM-Next Modules
          </h2>
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '15px'
          }}>
            <div>
              <h3 style={{ margin: '0 0 5px 0', color: '#0c5460' }}>📊 Dashboard</h3>
              <p style={{ margin: 0, fontSize: '14px' }}>Overview, analytics, and KPIs</p>
            </div>
            <div>
              <h3 style={{ margin: '0 0 5px 0', color: '#0c5460' }}>💼 Jobs</h3>
              <p style={{ margin: 0, fontSize: '14px' }}>Job posting and management</p>
            </div>
            <div>
              <h3 style={{ margin: '0 0 5px 0', color: '#0c5460' }}>👥 Candidates</h3>
              <p style={{ margin: 0, fontSize: '14px' }}>Candidate profiles and tracking</p>
            </div>
            <div>
              <h3 style={{ margin: '0 0 5px 0', color: '#0c5460' }}>🏢 Clients</h3>
              <p style={{ margin: 0, fontSize: '14px' }}>Client relationship management</p>
            </div>
            <div>
              <h3 style={{ margin: '0 0 5px 0', color: '#0c5460' }}>📅 Calendar</h3>
              <p style={{ margin: 0, fontSize: '14px' }}>Interview scheduling</p>
            </div>
            <div>
              <h3 style={{ margin: '0 0 5px 0', color: '#0c5460' }}>💰 Claims</h3>
              <p style={{ margin: 0, fontSize: '14px' }}>Billing and financial tracking</p>
            </div>
          </div>
        </section>

        <footer style={{ 
          textAlign: 'center', 
          marginTop: '40px',
          paddingTop: '20px',
          borderTop: '1px solid #eee',
          color: '#666',
          fontSize: '14px'
        }}>
          <p>Built with Next.js and powered by OpenAI • PM-Next Support Bot v2.0</p>
        </footer>
      </main>
    </>
  );
} 