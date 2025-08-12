const axios = require('axios');

const BASE_URL = 'http://localhost:5832';

class AuthTests {
  constructor() {
    this.testResults = [];
  }

  async runAllTests() {
    console.log('🧪 Running Authentication Tests...\n');
    
    await this.testAdminSignup();
    await this.testAdminLogin();
    await this.testAdminProfile();
    await this.testInvalidCredentials();
    
    this.printResults();
  }

  async testAdminSignup() {
    console.log('📝 Test: Admin Signup');
    try {
      const signupData = {
        name: "Test Admin",
        email: "testadmin@example.com",
        password: "testpass123",
        companyName: "Test Company",
        phone: "1234567890",
        role: "admin"
      };
      
      const response = await axios.post(`${BASE_URL}/api/admin/signup`, signupData, {
        headers: { 'Content-Type': 'application/json' }
      });
      
      console.log('✅ Admin Signup - Success');
      this.testResults.push({ test: 'Admin Signup', status: 'PASS', data: response.data });
      
    } catch (error) {
      if (error.response?.status === 400 && error.response.data.errors?.[0]?.msg === 'User already exists') {
        console.log('⚠️ Admin Signup - User already exists (expected)');
        this.testResults.push({ test: 'Admin Signup', status: 'SKIP', reason: 'User already exists' });
      } else {
        console.log('❌ Admin Signup - Failed:', error.response?.data || error.message);
        this.testResults.push({ test: 'Admin Signup', status: 'FAIL', error: error.response?.data || error.message });
      }
    }
  }

  async testAdminLogin() {
    console.log('\n📝 Test: Admin Login');
    try {
      const loginData = {
        email: "Emmakanebi@gmail.com",
        password: "Lancelot24@2024"
      };
      
      const response = await axios.post(`${BASE_URL}/api/admin/login`, loginData, {
        headers: { 'Content-Type': 'application/json' }
      });
      
      console.log('✅ Admin Login - Success');
      this.testResults.push({ test: 'Admin Login', status: 'PASS', data: response.data });
      
      // Store token for profile test
      this.authToken = response.data.token;
      
    } catch (error) {
      console.log('❌ Admin Login - Failed:', error.response?.data || error.message);
      this.testResults.push({ test: 'Admin Login', status: 'FAIL', error: error.response?.data || error.message });
    }
  }

  async testAdminProfile() {
    console.log('\n📝 Test: Admin Profile');
    if (!this.authToken) {
      console.log('⚠️ Admin Profile - Skipped (no auth token)');
      this.testResults.push({ test: 'Admin Profile', status: 'SKIP', reason: 'No auth token' });
      return;
    }
    
    try {
      const response = await axios.get(`${BASE_URL}/api/admin/profile`, {
        headers: {
          'Authorization': `Bearer ${this.authToken}`,
          'Content-Type': 'application/json'
        }
      });
      
      console.log('✅ Admin Profile - Success');
      this.testResults.push({ test: 'Admin Profile', status: 'PASS', data: response.data });
      
    } catch (error) {
      console.log('❌ Admin Profile - Failed:', error.response?.data || error.message);
      this.testResults.push({ test: 'Admin Profile', status: 'FAIL', error: error.response?.data || error.message });
    }
  }

  async testInvalidCredentials() {
    console.log('\n📝 Test: Invalid Credentials');
    try {
      const loginData = {
        email: "invalid@example.com",
        password: "wrongpassword"
      };
      
      const response = await axios.post(`${BASE_URL}/api/admin/login`, loginData, {
        headers: { 'Content-Type': 'application/json' }
      });
      
      console.log('❌ Invalid Credentials - Unexpected success');
      this.testResults.push({ test: 'Invalid Credentials', status: 'FAIL', reason: 'Should have failed' });
      
    } catch (error) {
      if (error.response?.status === 400) {
        console.log('✅ Invalid Credentials - Correctly rejected');
        this.testResults.push({ test: 'Invalid Credentials', status: 'PASS', data: error.response.data });
      } else {
        console.log('❌ Invalid Credentials - Unexpected error:', error.response?.data || error.message);
        this.testResults.push({ test: 'Invalid Credentials', status: 'FAIL', error: error.response?.data || error.message });
      }
    }
  }

  printResults() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 TEST RESULTS SUMMARY');
    console.log('='.repeat(60));
    
    const passed = this.testResults.filter(r => r.status === 'PASS').length;
    const failed = this.testResults.filter(r => r.status === 'FAIL').length;
    const skipped = this.testResults.filter(r => r.status === 'SKIP').length;
    
    this.testResults.forEach(result => {
      const status = result.status === 'PASS' ? '✅' : result.status === 'FAIL' ? '❌' : '⚠️';
      console.log(`${status} ${result.test}: ${result.status}`);
      if (result.error) console.log(`   Error: ${JSON.stringify(result.error)}`);
      if (result.reason) console.log(`   Reason: ${result.reason}`);
    });
    
    console.log('\n📈 SUMMARY:');
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`⚠️ Skipped: ${skipped}`);
    console.log(`📊 Total: ${this.testResults.length}`);
    
    if (failed === 0) {
      console.log('\n🎉 All tests passed!');
    } else {
      console.log('\n💡 Some tests failed. Check the errors above.');
    }
  }
}

// Run tests
const authTests = new AuthTests();
authTests.runAllTests(); 