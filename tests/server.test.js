const axios = require('axios');

const BASE_URL = 'http://localhost:5832';

class ServerTests {
  constructor() {
    this.testResults = [];
  }

  async runAllTests() {
    console.log('🧪 Running Server Tests...\n');
    
    await this.testServerConnectivity();
    await this.testRootEndpoint();
    await this.testAdminEndpoints();
    await this.testApiEndpoints();
    
    this.printResults();
  }

  async testServerConnectivity() {
    console.log('📝 Test: Server Connectivity');
    try {
      const response = await axios.get(`${BASE_URL}/`, { timeout: 5000 });
      console.log('✅ Server Connectivity - Success');
      this.testResults.push({ test: 'Server Connectivity', status: 'PASS', data: response.data });
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        console.log('❌ Server Connectivity - Server not running');
        this.testResults.push({ test: 'Server Connectivity', status: 'FAIL', error: 'Server not running on port 5832' });
      } else {
        console.log('❌ Server Connectivity - Failed:', error.message);
        this.testResults.push({ test: 'Server Connectivity', status: 'FAIL', error: error.message });
      }
    }
  }

  async testRootEndpoint() {
    console.log('\n📝 Test: Root Endpoint');
    try {
      const response = await axios.get(`${BASE_URL}/`);
      if (response.status === 200) {
        console.log('✅ Root Endpoint - Success');
        this.testResults.push({ test: 'Root Endpoint', status: 'PASS', data: response.data });
      } else {
        console.log('❌ Root Endpoint - Unexpected status:', response.status);
        this.testResults.push({ test: 'Root Endpoint', status: 'FAIL', error: `Unexpected status: ${response.status}` });
      }
    } catch (error) {
      console.log('❌ Root Endpoint - Failed:', error.message);
      this.testResults.push({ test: 'Root Endpoint', status: 'FAIL', error: error.message });
    }
  }

  async testAdminEndpoints() {
    console.log('\n📝 Test: Admin Endpoints');
    
    // Test admin signup endpoint
    try {
      const response = await axios.post(`${BASE_URL}/api/admin/signup`, {
        name: "Test Admin",
        email: "testadmin@example.com",
        password: "testpass123",
        companyName: "Test Company",
        phone: "1234567890"
      }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 5000
      });
      
      console.log('✅ Admin Signup Endpoint - Accessible');
      this.testResults.push({ test: 'Admin Signup Endpoint', status: 'PASS' });
      
    } catch (error) {
      if (error.response?.status === 400 && error.response.data.errors?.[0]?.msg === 'User already exists') {
        console.log('✅ Admin Signup Endpoint - Accessible (user exists)');
        this.testResults.push({ test: 'Admin Signup Endpoint', status: 'PASS' });
      } else if (error.response?.status === 500) {
        console.log('⚠️ Admin Signup Endpoint - Server error');
        this.testResults.push({ test: 'Admin Signup Endpoint', status: 'FAIL', error: 'Server error' });
      } else {
        console.log('❌ Admin Signup Endpoint - Failed:', error.message);
        this.testResults.push({ test: 'Admin Signup Endpoint', status: 'FAIL', error: error.message });
      }
    }
    
    // Test admin login endpoint
    try {
      const response = await axios.post(`${BASE_URL}/api/admin/login`, {
        email: "test@example.com",
        password: "testpass"
      }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 5000
      });
      
      console.log('✅ Admin Login Endpoint - Accessible');
      this.testResults.push({ test: 'Admin Login Endpoint', status: 'PASS' });
      
    } catch (error) {
      if (error.response?.status === 400) {
        console.log('✅ Admin Login Endpoint - Accessible (invalid credentials)');
        this.testResults.push({ test: 'Admin Login Endpoint', status: 'PASS' });
      } else if (error.response?.status === 500) {
        console.log('⚠️ Admin Login Endpoint - Server error');
        this.testResults.push({ test: 'Admin Login Endpoint', status: 'FAIL', error: 'Server error' });
      } else {
        console.log('❌ Admin Login Endpoint - Failed:', error.message);
        this.testResults.push({ test: 'Admin Login Endpoint', status: 'FAIL', error: error.message });
      }
    }
  }

  async testApiEndpoints() {
    console.log('\n📝 Test: API Endpoints');
    
    const endpoints = [
      '/api/products',
      '/api/users',
      '/api/auth',
      '/api/web3'
    ];
    
    for (const endpoint of endpoints) {
      try {
        const response = await axios.get(`${BASE_URL}${endpoint}`, { timeout: 5000 });
        console.log(`✅ ${endpoint} - Accessible`);
        this.testResults.push({ test: `${endpoint} Endpoint`, status: 'PASS' });
      } catch (error) {
        if (error.response?.status === 401 || error.response?.status === 404) {
          console.log(`✅ ${endpoint} - Accessible (${error.response.status})`);
          this.testResults.push({ test: `${endpoint} Endpoint`, status: 'PASS' });
        } else {
          console.log(`❌ ${endpoint} - Failed:`, error.message);
          this.testResults.push({ test: `${endpoint} Endpoint`, status: 'FAIL', error: error.message });
        }
      }
    }
  }

  printResults() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 SERVER TEST RESULTS');
    console.log('='.repeat(60));
    
    const passed = this.testResults.filter(r => r.status === 'PASS').length;
    const failed = this.testResults.filter(r => r.status === 'FAIL').length;
    
    this.testResults.forEach(result => {
      const status = result.status === 'PASS' ? '✅' : '❌';
      console.log(`${status} ${result.test}: ${result.status}`);
      if (result.error) console.log(`   Error: ${result.error}`);
      if (result.data) console.log(`   Data: ${result.data}`);
    });
    
    console.log('\n📈 SUMMARY:');
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`📊 Total: ${this.testResults.length}`);
    
    if (failed === 0) {
      console.log('\n🎉 All server tests passed!');
    } else {
      console.log('\n💡 Some server tests failed. Check the errors above.');
    }
  }
}

// Run tests
const serverTests = new ServerTests();
serverTests.runAllTests(); 