import Head from 'next/head';
import { useState, useEffect } from 'react';

export default function Home() {
  const [healthStatus, setHealthStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check health status on load
    fetch('/api/health')
      .then(res => res.json())
      .then(data => {
        setHealthStatus(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Health check failed:', err);
        setLoading(false);
      });
  }, []);

  return (
    <>
      <Head>
        <title>PM-Next Lark Bot - Next.js</title>
        <meta name="description" content="PM-Next Recruitment Management System Lark Bot" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div style={{
        minHeight: '100vh',
        padding: '20px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        backgroundColor: '#f5f5f5'
      }}>
        <main style={{
          maxWidth: '800px',
          margin: '0 auto',
          backgroundColor: 'white',
          padding: '40px',
          borderRadius: '8px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
        }}>
          <h1 style={{
            color: '#333',
            textAlign: 'center',
            marginBottom: '30px',
            fontSize: '2.5em'
          }}>
            🤖 PM-Next Lark Bot
          </h1>
          
          <div style={{
            textAlign: 'center',
            marginBottom: '40px'
          }}>
            <p style={{ fontSize: '1.2em', color: '#666', marginBottom: '20px' }}>
              Next.js-powered intelligent assistant for PM-Next Recruitment Management System
            </p>
          </div>

          <div style={{
            backgroundColor: '#f8f9fa',
            padding: '30px',
            borderRadius: '8px',
            border: '1px solid #e9ecef'
          }}>
            <h2 style={{ marginBottom: '20px', color: '#495057' }}>🔧 System Status</h2>
            
            {loading ? (
              <p>Loading system status...</p>
            ) : healthStatus ? (
              <div>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  marginBottom: '15px'
                }}>
                  <span style={{
                    display: 'inline-block',
                    width: '12px',
                    height: '12px',
                    borderRadius: '50%',
                    backgroundColor: healthStatus.status === 'healthy' ? '#28a745' : 
                                    healthStatus.status === 'degraded' ? '#ffc107' : '#dc3545',
                    marginRight: '10px'
                  }}></span>
                  <strong>Status: {healthStatus.status.toUpperCase()}</strong>
                </div>
                
                <div style={{ fontSize: '0.9em', color: '#6c757d' }}>
                  <p><strong>Environment:</strong> {healthStatus.environment}</p>
                  <p><strong>Version:</strong> {healthStatus.version}</p>
                  <p><strong>Uptime:</strong> {Math.round(healthStatus.uptime)} seconds</p>
                  <p><strong>Last Check:</strong> {new Date(healthStatus.timestamp).toLocaleString()}</p>
                </div>

                {healthStatus.services && (
                  <div style={{ marginTop: '20px' }}>
                    <h4 style={{ marginBottom: '10px' }}>Services:</h4>
                    <ul style={{ margin: 0, paddingLeft: '20px' }}>
                      <li>Lark SDK: <span style={{ color: healthStatus.services.lark === 'configured' ? '#28a745' : '#dc3545' }}>
                        {healthStatus.services.lark}
                      </span></li>
                      <li>OpenAI: <span style={{ color: healthStatus.services.openai === 'configured' ? '#28a745' : '#dc3545' }}>
                        {healthStatus.services.openai}
                      </span></li>
                      <li>Supabase: <span style={{ color: healthStatus.services.supabase === 'configured' ? '#28a745' : '#dc3545' }}>
                        {healthStatus.services.supabase}
                      </span></li>
                    </ul>
                  </div>
                )}

                {healthStatus.warnings && (
                  <div style={{
                    marginTop: '15px',
                    padding: '10px',
                    backgroundColor: '#fff3cd',
                    border: '1px solid #ffeaa7',
                    borderRadius: '4px',
                    color: '#856404'
                  }}>
                    <strong>⚠️ Warning:</strong> {healthStatus.warnings}
                  </div>
                )}
              </div>
            ) : (
              <p style={{ color: '#dc3545' }}>❌ Unable to fetch system status</p>
            )}
          </div>

          <div style={{
            marginTop: '40px',
            padding: '30px',
            backgroundColor: '#e7f3ff',
            borderRadius: '8px',
            border: '1px solid #b3d9ff'
          }}>
            <h2 style={{ marginBottom: '20px', color: '#0056b3' }}>📚 Features</h2>
            <ul style={{ marginLeft: '20px', lineHeight: '1.6' }}>
              <li><strong>Intelligent AI Responses:</strong> Powered by OpenAI GPT models</li>
              <li><strong>Interactive Cards:</strong> Rich UI elements for better user experience</li>
              <li><strong>FAQ System:</strong> Quick answers for common questions</li>
              <li><strong>Support Ticketing:</strong> Automatic escalation for complex issues</li>
              <li><strong>Knowledge Base:</strong> Dynamic learning from support interactions</li>
              <li><strong>Multi-Page Support:</strong> Dashboard, Jobs, Candidates, Clients, Calendar, Claims</li>
            </ul>
          </div>

          <div style={{
            marginTop: '30px',
            textAlign: 'center',
            padding: '20px',
            backgroundColor: '#f8f9fa',
            borderRadius: '8px'
          }}>
            <h3 style={{ marginBottom: '15px' }}>🚀 API Endpoints</h3>
            <div style={{ fontSize: '0.9em', color: '#6c757d' }}>
              <p><code>/api/lark/events</code> - Webhook for Lark messages and interactions</p>
              <p><code>/api/health</code> - System health check</p>
              <p><code>/webhook</code> - Alias for Lark webhook (redirects to /api/lark/events)</p>
            </div>
          </div>
        </main>
      </div>
    </>
  );
} 